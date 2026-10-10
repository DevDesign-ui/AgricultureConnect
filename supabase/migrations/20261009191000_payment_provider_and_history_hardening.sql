-- PayDunya hosted checkout support and payment-history integrity.
-- This migration preserves all existing payment and order rows.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS provider_confirmation_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'non_paye';

DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.payments') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION
      'Cannot harden payments: expected payments, orders, order_items, profiles and auth.users tables are required';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (VALUES
    ('payments', 'id'), ('payments', 'commande_id'), ('payments', 'user_id'),
    ('payments', 'montant'), ('payments', 'currency'), ('payments', 'methode'),
    ('payments', 'statut'), ('payments', 'reference'), ('payments', 'idempotency_key'),
    ('payments', 'provider_reference'), ('payments', 'provider_event_id'),
    ('payments', 'provider_confirmed_at'), ('payments', 'provider_checkout_url'),
    ('payments', 'provider_confirmation_verified'),
    ('orders', 'id'), ('orders', 'acheteur_id'), ('orders', 'seller_id'),
    ('orders', 'statut'), ('orders', 'total'), ('orders', 'payment_status'),
    ('order_items', 'commande_id'), ('order_items', 'quantite'),
    ('order_items', 'prix_unitaire'),
    ('profiles', 'user_id'), ('profiles', 'role'), ('auth.users', 'id')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS c
    WHERE c.table_schema = COALESCE(
        NULLIF(split_part(required.table_name, '.', 1), required.table_name),
        'public'
      )
      AND c.table_name = CASE
        WHEN position('.' IN required.table_name) > 0
          THEN split_part(required.table_name, '.', 2)
        ELSE required.table_name
      END
      AND c.column_name = required.column_name
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot harden payments: missing required columns: %', v_missing;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE payment_status IS NULL OR payment_status NOT IN ('non_paye', 'paye')
  ) THEN
    RAISE EXCEPTION 'Cannot secure payments: unsupported order payment status exists';
  END IF;
END;
$$;

DO $$
DECLARE
  v_constraint_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
  INTO v_constraint_definition
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.orders'::regclass
    AND c.conname = 'orders_payment_status_check';

  IF v_constraint_definition IS NULL THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('non_paye', 'paye'));
  ELSIF position('''non_paye''' IN v_constraint_definition) = 0
     OR position('''paye''' IN v_constraint_definition) = 0 THEN
    RAISE EXCEPTION 'Existing orders_payment_status_check has an incompatible definition';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE statut IS NULL
       OR statut NOT IN ('initie', 'en_attente', 'valide', 'echoue', 'annule', 'expiree')
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payments: unsupported historical status exists; review records before retrying';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE methode IS NULL
       OR methode NOT IN ('orange_money', 'wave', 'free_money', 'carte_bancaire', 'paydunya_checkout')
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payments: unsupported historical method exists; review records before retrying';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE reference IS NOT NULL AND btrim(reference) <> ''
    GROUP BY reference HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure payments: duplicate references exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure payments: duplicate idempotency keys exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE provider_event_id IS NOT NULL
    GROUP BY provider_event_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure payments: duplicate provider event IDs exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE provider_reference IS NOT NULL
    GROUP BY provider_reference HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure payments: duplicate provider references exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE statut IN ('initie', 'en_attente')
    GROUP BY commande_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payments: multiple open attempts exist for an order; review them without deleting history';
  END IF;
END;
$$;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_statut_check,
  DROP CONSTRAINT IF EXISTS payments_methode_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_statut_check
    CHECK (statut IN ('initie', 'en_attente', 'valide', 'echoue', 'annule', 'expiree')),
  ADD CONSTRAINT payments_methode_check
    CHECK (methode IN ('orange_money', 'wave', 'free_money', 'carte_bancaire', 'paydunya_checkout'));

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_attempt_per_order
  ON public.payments (commande_id)
  WHERE statut IN ('initie', 'en_attente');

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_unique
  ON public.payments (provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION private.guard_payment_attempts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
  v_order_id uuid;
  v_order_buyer uuid;
  v_order_status text;
  v_order_payment_status text;
  v_order_total numeric;
  v_items_total numeric;
  v_item_count bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment records are immutable and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Payment writes are reserved for trusted server-side code'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.statut IS DISTINCT FROM 'initie'
       OR NEW.provider_reference IS NOT NULL
       OR NEW.provider_event_id IS NOT NULL
       OR NEW.provider_confirmed_at IS NOT NULL
       OR NEW.provider_checkout_url IS NOT NULL
       OR NEW.provider_confirmation_verified IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'New payment attempts must be unconfirmed and start as initie'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.reference IS NULL OR btrim(NEW.reference) = '' OR NEW.idempotency_key IS NULL THEN
      RAISE EXCEPTION 'A unique server-generated reference and idempotency key are required'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.currency IS DISTINCT FROM 'XOF'
       OR NEW.montant <= 0
       OR NEW.montant <> trunc(NEW.montant)
       OR NEW.methode IS DISTINCT FROM 'paydunya_checkout' THEN
      RAISE EXCEPTION 'Payment attempts must use PayDunya checkout and a positive whole XOF amount'
        USING ERRCODE = '23514';
    END IF;

    SELECT o.acheteur_id, o.statut, o.total, o.payment_status
    INTO v_order_buyer, v_order_status, v_order_total, v_order_payment_status
    FROM public.orders AS o
    WHERE o.id = NEW.commande_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order does not exist' USING ERRCODE = '23503';
    END IF;
    IF NEW.user_id IS DISTINCT FROM v_order_buyer THEN
      RAISE EXCEPTION 'Only the order buyer may own its payment attempt' USING ERRCODE = '42501';
    END IF;
    IF v_order_status IS NULL OR v_order_status NOT IN ('en_attente', 'confirmee') THEN
      RAISE EXCEPTION 'Order is not in a payable state' USING ERRCODE = '23514';
    END IF;
    IF v_order_payment_status = 'paye' THEN
      RAISE EXCEPTION 'Order already has a verified payment' USING ERRCODE = '23505';
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
      RAISE EXCEPTION 'Payment amount does not match persisted order items and total'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.payments AS p
      WHERE p.commande_id = NEW.commande_id
        AND p.statut = 'valide'
        AND p.provider_confirmation_verified = true
    ) THEN
      RAISE EXCEPTION 'Order already has a verified payment'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payments AS p
      WHERE p.commande_id = NEW.commande_id
        AND p.statut = 'valide'
        AND p.provider_confirmation_verified IS DISTINCT FROM true
    ) THEN
      RAISE EXCEPTION 'Order has an unverified historical payment; manual reconciliation is required'
        USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.statut = 'valide' AND OLD.provider_confirmation_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unverified legacy payment records are immutable'
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

  IF (NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
      OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
      OR NEW.provider_confirmed_at IS DISTINCT FROM OLD.provider_confirmed_at
      OR NEW.provider_checkout_url IS DISTINCT FROM OLD.provider_checkout_url
      OR NEW.provider_confirmation_verified IS DISTINCT FROM OLD.provider_confirmation_verified)
     AND v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Provider metadata may only be changed by the trusted payment function'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.provider_reference IS NOT NULL
     AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference THEN
    RAISE EXCEPTION 'Provider reference is immutable once assigned' USING ERRCODE = '42501';
  END IF;

  IF OLD.provider_event_id IS NOT NULL
     AND NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id THEN
    RAISE EXCEPTION 'Provider event ID is immutable once assigned' USING ERRCODE = '42501';
  END IF;

  IF OLD.provider_checkout_url IS NOT NULL
     AND NEW.provider_checkout_url IS DISTINCT FROM OLD.provider_checkout_url THEN
    RAISE EXCEPTION 'Provider checkout URL is immutable once assigned' USING ERRCODE = '42501';
  END IF;

  IF NEW.provider_checkout_url IS NOT NULL
     AND NEW.provider_checkout_url !~ '^https://app\.paydunya\.com/(sandbox-)?checkout/invoice/[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid PayDunya checkout URL' USING ERRCODE = '23514';
  END IF;

  IF NEW.provider_confirmation_verified IS DISTINCT FROM OLD.provider_confirmation_verified
     AND NOT (
       v_jwt_role = 'service_role'
       AND NEW.provider_confirmation_verified = true
       AND NEW.statut = 'valide'
       AND NEW.provider_reference IS NOT NULL
       AND NEW.provider_event_id IS NOT NULL
       AND NEW.provider_confirmed_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Verified payment confirmation requires an authenticated provider notification'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.statut = 'valide'
     AND (
       v_jwt_role IS DISTINCT FROM 'service_role'
       OR NEW.provider_confirmation_verified IS DISTINCT FROM true
       OR NEW.provider_reference IS NULL
       OR NEW.provider_event_id IS NULL
       OR NEW.provider_confirmed_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Payment cannot be confirmed without verified provider evidence'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.statut = 'valide' AND OLD.statut IS DISTINCT FROM 'valide' THEN
    SELECT o.id INTO v_order_id
    FROM public.orders AS o
    WHERE o.id = NEW.commande_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment order no longer exists' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payments AS p
      WHERE p.commande_id = NEW.commande_id
        AND p.id <> NEW.id
        AND p.statut = 'valide'
        AND p.provider_confirmation_verified = true
    ) THEN
      RAISE EXCEPTION 'Order already has a verified payment' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut
     AND NOT (
       (OLD.statut = 'initie' AND NEW.statut IN ('en_attente', 'valide', 'echoue', 'annule', 'expiree'))
       OR (OLD.statut = 'en_attente' AND NEW.statut IN ('valide', 'echoue', 'annule', 'expiree'))
     ) THEN
    RAISE EXCEPTION 'Invalid payment status transition' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT c.conname
    FROM pg_constraint AS c
    JOIN pg_attribute AS a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.payments'::regclass
      AND c.confrelid = 'public.orders'::regclass
      AND a.attname = 'commande_id'
      AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;

  ALTER TABLE public.payments
    ADD CONSTRAINT payments_commande_id_fkey
    FOREIGN KEY (commande_id) REFERENCES public.orders(id)
    ON DELETE RESTRICT NOT VALID;
  ALTER TABLE public.payments VALIDATE CONSTRAINT payments_commande_id_fkey;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_attribute AS a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.payments'::regclass
      AND c.confrelid = 'public.orders'::regclass
      AND a.attname = 'commande_id'
      AND cardinality(c.conkey) <> 1
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payment order reference: an unsupported composite foreign key exists';
  END IF;

  FOR v_constraint_name IN
    SELECT c.conname
    FROM pg_constraint AS c
    JOIN pg_attribute AS a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.payments'::regclass
      AND c.confrelid = 'auth.users'::regclass
      AND a.attname = 'user_id'
      AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_attribute AS a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.payments'::regclass
      AND c.confrelid = 'auth.users'::regclass
      AND a.attname = 'user_id'
      AND cardinality(c.conkey) <> 1
  ) THEN
    RAISE EXCEPTION
      'Cannot secure payment user reference: an unsupported composite foreign key exists';
  END IF;

  ALTER TABLE public.payments
    ADD CONSTRAINT payments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id)
    ON DELETE RESTRICT NOT VALID;
  ALTER TABLE public.payments VALIDATE CONSTRAINT payments_user_id_fkey;
END;
$$;

ALTER FUNCTION private.guard_payment_attempts() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_payment_attempts() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_order_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NEW;
  END IF;
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Order payment status is server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.payment_status = 'paye'
     AND NOT EXISTS (
       SELECT 1 FROM public.payments AS p
       WHERE p.commande_id = NEW.id
         AND p.statut = 'valide'
         AND p.provider_confirmation_verified = true
         AND p.provider_reference IS NOT NULL
         AND p.provider_event_id IS NOT NULL
         AND p.provider_confirmed_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'An order can be marked paid only after verified provider confirmation'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.payment_status = 'paye' AND NEW.payment_status <> 'paye' THEN
    RAISE EXCEPTION 'Verified paid status is immutable; use a reviewed refund workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.apply_paydunya_confirmation(text, text, text, numeric);

CREATE FUNCTION public.apply_paydunya_confirmation(
  p_payment_reference text,
  p_provider_reference text,
  p_order_id uuid,
  p_provider_status text,
  p_amount numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
  v_target_status text;
  v_order_id uuid;
  v_payment public.payments%ROWTYPE;
  v_order_total numeric;
  v_items_total numeric;
  v_item_count bigint;
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Provider confirmations are server-only' USING ERRCODE = '42501';
  END IF;

  v_target_status := CASE lower(p_provider_status)
    WHEN 'completed' THEN 'valide'
    WHEN 'pending' THEN 'en_attente'
    WHEN 'failed' THEN 'echoue'
    WHEN 'cancelled' THEN 'annule'
    WHEN 'expired' THEN 'expiree'
    ELSE NULL
  END;
  IF v_target_status IS NULL
     OR p_provider_reference IS NULL
     OR p_provider_reference = ''
     OR p_order_id IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'Invalid verified provider confirmation';
  END IF;

  IF p_payment_reference IS NOT NULL THEN
    SELECT p.commande_id INTO v_order_id
    FROM public.payments AS p
    WHERE p.reference = p_payment_reference
      AND p.commande_id = p_order_id;
  ELSE
    SELECT p.commande_id INTO v_order_id
    FROM public.payments AS p
    WHERE p.provider_reference = p_provider_reference
      AND p.commande_id = p_order_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt not found';
  END IF;

  PERFORM 1 FROM public.orders AS o WHERE o.id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found';
  END IF;

  IF p_payment_reference IS NOT NULL THEN
    SELECT p.* INTO v_payment
    FROM public.payments AS p
    WHERE p.reference = p_payment_reference
    FOR UPDATE;
  ELSE
    SELECT p.* INTO v_payment
    FROM public.payments AS p
    WHERE p.provider_reference = p_provider_reference
    FOR UPDATE;
  END IF;

  IF v_payment.provider_reference IS NOT NULL
     AND v_payment.provider_reference <> p_provider_reference THEN
    RAISE EXCEPTION 'Provider reference mismatch';
  END IF;
  IF v_payment.methode IS DISTINCT FROM 'paydunya_checkout'
     OR v_payment.montant <> p_amount
     OR v_payment.currency IS DISTINCT FROM 'XOF' THEN
    RAISE EXCEPTION 'Provider amount or currency mismatch';
  END IF;

  IF v_payment.statut = v_target_status
     AND v_payment.provider_event_id = p_provider_reference
     AND (
       (v_target_status = 'valide' AND v_payment.provider_confirmation_verified)
       OR v_target_status <> 'valide'
     ) THEN
    RETURN 'duplicate';
  END IF;
  IF v_payment.statut NOT IN ('initie', 'en_attente') THEN
    RAISE EXCEPTION 'Payment attempt is already final';
  END IF;
  IF v_payment.provider_event_id IS NOT NULL
     AND v_payment.provider_event_id <> p_provider_reference THEN
    RAISE EXCEPTION 'Provider event ID mismatch';
  END IF;

  SELECT o.total INTO v_order_total
  FROM public.orders AS o WHERE o.id = v_order_id;
  SELECT COALESCE(sum(oi.quantite::numeric * oi.prix_unitaire), 0), count(*)
  INTO v_items_total, v_item_count
  FROM public.order_items AS oi WHERE oi.commande_id = v_order_id;
  IF v_item_count = 0 OR v_items_total <> v_order_total OR v_items_total <> p_amount THEN
    RAISE EXCEPTION 'Verified provider amount no longer matches the order';
  END IF;

  IF v_target_status = 'valide' AND EXISTS (
    SELECT 1 FROM public.payments AS p
    WHERE p.commande_id = v_order_id
      AND p.id <> v_payment.id
      AND p.statut = 'valide'
      AND p.provider_confirmation_verified = true
  ) THEN
    RAISE EXCEPTION 'Order already has a verified payment';
  END IF;

  UPDATE public.payments
  SET statut = v_target_status,
      provider_reference = p_provider_reference,
      provider_event_id = p_provider_reference,
      provider_confirmed_at = CASE WHEN v_target_status = 'valide' THEN now() ELSE NULL END,
      provider_confirmation_verified = (v_target_status = 'valide'),
      updated_at = now()
  WHERE id = v_payment.id;

  IF v_target_status = 'valide' THEN
    -- Record receipt without changing orders.statut. If the order was already
    -- cancelled, refund/reconciliation remains a separate manual business action.
    UPDATE public.orders
    SET payment_status = 'paye', updated_at = now()
    WHERE id = v_order_id;
  END IF;

  RETURN 'applied';
END;
$$;

ALTER FUNCTION private.guard_order_payment_status() OWNER TO postgres;
ALTER FUNCTION public.apply_paydunya_confirmation(text, text, uuid, text, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_order_payment_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_paydunya_confirmation(text, text, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paydunya_confirmation(text, text, uuid, text, numeric) TO service_role;

DROP TRIGGER IF EXISTS payments_guard_attempts ON public.payments;
CREATE TRIGGER payments_guard_attempts
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.guard_payment_attempts();

DROP TRIGGER IF EXISTS orders_guard_payment_status ON public.orders;
CREATE TRIGGER orders_guard_payment_status
BEFORE UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.guard_order_payment_status();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Replace only project-owned policy names. Custom policies are retained;
-- restrictive boundaries below prevent them from widening read access or
-- granting authenticated clients payment writes.
DO $$
DECLARE
  v_policy_name text;
BEGIN
  FOR v_policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments'
      AND policyname IN (
        'payments_select', 'payments_insert', 'payments_update', 'payments_delete',
        'ac_payments_read_boundary', 'ac_payments_no_client_insert',
        'ac_payments_no_client_update', 'ac_payments_no_client_delete'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.payments', v_policy_name);
  END LOOP;
END;
$$;

CREATE POLICY "payments_select"
ON public.payments
FOR SELECT TO authenticated
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

CREATE POLICY "ac_payments_read_boundary"
ON public.payments
AS RESTRICTIVE
FOR SELECT TO authenticated
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
  WHERE table_schema = 'public' AND table_name = 'payments';
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
  provider_event_id, provider_confirmed_at, provider_confirmation_verified,
  created_at, updated_at
) ON TABLE public.payments TO authenticated;
