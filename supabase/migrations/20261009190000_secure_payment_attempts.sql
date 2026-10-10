-- Secure payment attempts without configuring or contacting a payment provider.
--
-- Existing payment rows are retained and remain readable to the same users.
-- New provider integrations must replace the confirmation guard only after
-- implementing and reviewing an authenticated provider verification flow.

DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.payments') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Cannot secure payments: expected public.payments, public.orders, public.order_items and public.profiles tables are required';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (VALUES
    ('payments', 'id'), ('payments', 'commande_id'), ('payments', 'user_id'),
    ('payments', 'montant'), ('payments', 'methode'), ('payments', 'statut'),
    ('payments', 'reference'),
    ('orders', 'id'), ('orders', 'acheteur_id'), ('orders', 'seller_id'),
    ('orders', 'statut'), ('orders', 'total'),
    ('order_items', 'commande_id'), ('order_items', 'quantite'),
    ('order_items', 'prix_unitaire'),
    ('profiles', 'user_id'), ('profiles', 'role')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot secure payments: missing required columns: %', v_missing;
  END IF;
END;
$$;

DO $$
DECLARE
  v_duplicate_found boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE reference IS NOT NULL
      AND btrim(reference) <> ''
    GROUP BY reference
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payments: duplicate non-empty reference values exist; reconcile them before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE statut IS NULL
       OR statut NOT IN ('en_attente', 'valide', 'echoue', 'annule', 'initie')
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payments: unsupported historical statuses exist; review them before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'idempotency_key'
  ) THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.payments
        WHERE idempotency_key IS NOT NULL
        GROUP BY idempotency_key
        HAVING count(*) > 1
      )
    $sql$ INTO v_duplicate_found;
    IF v_duplicate_found THEN
      RAISE EXCEPTION
        'Cannot secure payments: duplicate idempotency keys exist; review them before applying this migration';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'provider_event_id'
  ) THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.payments
        WHERE provider_event_id IS NOT NULL
        GROUP BY provider_event_id
        HAVING count(*) > 1
      )
    $sql$ INTO v_duplicate_found;
    IF v_duplicate_found THEN
      RAISE EXCEPTION
        'Cannot secure payments: duplicate provider event IDs exist; review them before applying this migration';
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS provider_confirmed_at timestamptz;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_statut_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_statut_check
  CHECK (statut IN ('initie', 'en_attente', 'valide', 'echoue', 'annule'));

CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_unique
  ON public.payments (reference)
  WHERE reference IS NOT NULL AND btrim(reference) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_unique
  ON public.payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_event_id_unique
  ON public.payments (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.guard_payment_attempts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
  v_order_buyer uuid;
  v_order_status text;
  v_order_total numeric;
  v_items_total numeric;
  v_item_count bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment records are immutable and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF v_jwt_role IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Payment writes are reserved for trusted server-side code'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.statut IS DISTINCT FROM 'initie'
       AND NEW.statut IS DISTINCT FROM 'en_attente' THEN
      RAISE EXCEPTION 'New payment attempts must start as initie or en_attente'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.reference IS NULL OR btrim(NEW.reference) = '' THEN
      RAISE EXCEPTION 'A server-generated payment reference is required'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.idempotency_key IS NULL THEN
      RAISE EXCEPTION 'A payment idempotency key is required'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.currency IS DISTINCT FROM 'XOF'
       OR NEW.montant IS NULL
       OR NEW.montant <= 0
       OR NEW.montant <> trunc(NEW.montant) THEN
      RAISE EXCEPTION 'Payment amount must be a positive whole amount in XOF'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.provider_reference IS NOT NULL
       OR NEW.provider_event_id IS NOT NULL
       OR NEW.provider_confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Provider confirmation data cannot be supplied without an approved provider integration'
        USING ERRCODE = '42501';
    END IF;

    SELECT o.acheteur_id, o.statut, o.total
    INTO v_order_buyer, v_order_status, v_order_total
    FROM public.orders AS o
    WHERE o.id = NEW.commande_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.user_id IS DISTINCT FROM v_order_buyer THEN
      RAISE EXCEPTION 'Only the order buyer may own its payment attempt'
        USING ERRCODE = '42501';
    END IF;

    IF v_order_status NOT IN ('en_attente', 'confirmee') THEN
      RAISE EXCEPTION 'Order is not in a payable state'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.payments AS p
      WHERE p.commande_id = NEW.commande_id
        AND p.statut = 'valide'
    ) THEN
      RAISE EXCEPTION 'Order has an unverified historical payment; manual reconciliation is required'
        USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(sum(oi.quantite::numeric * oi.prix_unitaire), 0), count(*)
    INTO v_items_total, v_item_count
    FROM public.order_items AS oi
    WHERE oi.commande_id = NEW.commande_id;

    IF v_item_count = 0
       OR v_items_total <= 0
       OR v_items_total <> trunc(v_items_total)
       OR v_items_total <> v_order_total
       OR NEW.montant <> v_items_total THEN
      RAISE EXCEPTION 'Payment amount does not match the persisted order items and total'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.payments AS p
      WHERE p.commande_id = NEW.commande_id
        AND p.statut = 'valide'
        AND p.provider_event_id IS NOT NULL
        AND p.provider_confirmed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Order already has a confirmed payment'
        USING ERRCODE = '23505';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.statut = 'valide' THEN
    RAISE EXCEPTION 'Confirmed historical payment records are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.commande_id IS DISTINCT FROM OLD.commande_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.montant IS DISTINCT FROM OLD.montant
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.methode IS DISTINCT FROM OLD.methode
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment identity, amount, currency, method and reference are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
     OR NEW.provider_confirmed_at IS DISTINCT FROM OLD.provider_confirmed_at THEN
    RAISE EXCEPTION 'Provider confirmation data cannot be changed without an approved provider integration'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.statut = 'valide' AND OLD.statut IS DISTINCT FROM 'valide' THEN
    RAISE EXCEPTION 'Payment confirmation is disabled until an authenticated provider integration is approved'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut
     AND NOT (
       (OLD.statut = 'initie' AND NEW.statut IN ('en_attente', 'echoue', 'annule'))
       OR (OLD.statut = 'en_attente' AND NEW.statut IN ('echoue', 'annule'))
     ) THEN
    RAISE EXCEPTION 'Invalid payment status transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.guard_payment_attempts() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_payment_attempts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_guard_attempts ON public.payments;
CREATE TRIGGER payments_guard_attempts
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION private.guard_payment_attempts();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Replace only the legacy participant-read policy created by the project
-- schema migration. Unknown/custom policies are retained; the restrictive
-- boundary below prevents any permissive policy from widening payment reads.
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;
DROP POLICY IF EXISTS "payments_delete" ON public.payments;
DROP POLICY IF EXISTS "ac_payments_read_boundary" ON public.payments;
DROP POLICY IF EXISTS "ac_payments_no_client_insert" ON public.payments;
DROP POLICY IF EXISTS "ac_payments_no_client_update" ON public.payments;
DROP POLICY IF EXISTS "ac_payments_no_client_delete" ON public.payments;

CREATE POLICY "payments_select"
ON public.payments
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.id = payments.commande_id
      AND (auth.uid() = o.acheteur_id OR auth.uid() = o.seller_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "ac_payments_read_boundary"
ON public.payments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = payments.commande_id
      AND (auth.uid() = o.acheteur_id OR auth.uid() = o.seller_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "ac_payments_no_client_insert"
ON public.payments
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "ac_payments_no_client_update"
ON public.payments
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "ac_payments_no_client_delete"
ON public.payments
AS RESTRICTIVE
FOR DELETE TO authenticated
USING (false);

DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'payments';

  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.payments FROM PUBLIC, anon, authenticated',
      v_columns
    );
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, commande_id, user_id, montant, currency, methode, statut, reference,
  provider_event_id, provider_confirmed_at, created_at, updated_at
) ON TABLE public.payments TO authenticated;
