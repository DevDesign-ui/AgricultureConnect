-- Keep contact discovery and message access scoped to active messaging users.
-- Apply only after reviewing the target project's existing policies and grants.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_messaging_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.user_id = p_user_id
      AND p.is_active = true
      AND p.role IN ('admin', 'acheteur', 'agriculteur', 'fournisseur')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_messaging_contact(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.user_id = p_user_id
      AND p.is_active = true
      AND p.role IN ('acheteur', 'agriculteur', 'fournisseur')
  );
$$;

ALTER FUNCTION private.is_messaging_user(uuid) OWNER TO postgres;
ALTER FUNCTION private.is_messaging_contact(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_messaging_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_messaging_contact(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION private.guard_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expediteur_id IS DISTINCT FROM (SELECT auth.uid())
       OR NEW.expediteur_id = NEW.destinataire_id
       OR NOT private.is_messaging_user(NEW.expediteur_id)
       OR NOT private.is_messaging_contact(NEW.destinataire_id)
       OR NEW.contenu IS NULL
       OR btrim(NEW.contenu) = ''
       OR char_length(NEW.contenu) > 2000
       OR NEW.lu IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Invalid or unauthorized messaging insert'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.destinataire_id IS DISTINCT FROM (SELECT auth.uid())
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.expediteur_id IS DISTINCT FROM OLD.expediteur_id
       OR NEW.destinataire_id IS DISTINCT FROM OLD.destinataire_id
       OR NEW.contenu IS DISTINCT FROM OLD.contenu
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.lu IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only the recipient may mark a message as read'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION private.guard_messages() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_messages() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_guard_access ON public.messages;
CREATE TRIGGER messages_guard_access
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION private.guard_messages();

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;
DROP POLICY IF EXISTS "ac_messages_read_boundary" ON public.messages;
DROP POLICY IF EXISTS "ac_messages_insert_boundary" ON public.messages;
DROP POLICY IF EXISTS "ac_messages_update_boundary" ON public.messages;
DROP POLICY IF EXISTS "ac_messages_delete_boundary" ON public.messages;

CREATE POLICY "messages_select"
ON public.messages
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = expediteur_id
  OR (SELECT auth.uid()) = destinataire_id
);

CREATE POLICY "ac_messages_read_boundary"
ON public.messages
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = expediteur_id
  OR (SELECT auth.uid()) = destinataire_id
);

CREATE POLICY "messages_insert"
ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = expediteur_id
  AND expediteur_id <> destinataire_id
);

CREATE POLICY "ac_messages_insert_boundary"
ON public.messages
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = expediteur_id
  AND expediteur_id <> destinataire_id
);

CREATE POLICY "messages_update"
ON public.messages
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = destinataire_id)
WITH CHECK ((SELECT auth.uid()) = destinataire_id);

CREATE POLICY "ac_messages_update_boundary"
ON public.messages
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = destinataire_id)
WITH CHECK ((SELECT auth.uid()) = destinataire_id);

CREATE POLICY "messages_delete"
ON public.messages
FOR DELETE TO authenticated
USING (
  (SELECT auth.uid()) = expediteur_id
  OR (SELECT auth.uid()) = destinataire_id
);

CREATE POLICY "ac_messages_delete_boundary"
ON public.messages
AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  (SELECT auth.uid()) = expediteur_id
  OR (SELECT auth.uid()) = destinataire_id
);

REVOKE ALL ON TABLE public.messages FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, expediteur_id, destinataire_id, contenu, lu, created_at)
  ON TABLE public.messages FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, expediteur_id, destinataire_id, contenu, lu, created_at)
  ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.messages TO authenticated;
GRANT INSERT (expediteur_id, destinataire_id, contenu)
  ON TABLE public.messages TO authenticated;
GRANT UPDATE (lu) ON TABLE public.messages TO authenticated;
GRANT DELETE ON TABLE public.messages TO authenticated;
