CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_current_user_admin()
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
    WHERE p.user_id = (SELECT auth.uid())
      AND p.role = 'admin'
  );
$$;

ALTER FUNCTION private.is_current_user_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_current_user_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_current_user_admin() FROM anon;
REVOKE ALL ON FUNCTION private.is_current_user_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.is_current_user_admin() TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_profile_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin'
       AND NOT private.is_current_user_admin() THEN
      RAISE EXCEPTION 'Only an administrator may assign the admin role'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role
        AND NOT private.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only an administrator may change a profile role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.guard_profile_role_changes() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_profile_role_changes() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS profiles_guard_role_changes ON public.profiles;
CREATE TRIGGER profiles_guard_role_changes
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.guard_profile_role_changes();

ALTER POLICY "profiles_select" ON public.profiles
USING (
  (SELECT auth.uid()) = user_id
  OR (SELECT private.is_current_user_admin())
);

ALTER POLICY "profiles_insert" ON public.profiles
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (role <> 'admin' OR (SELECT private.is_current_user_admin()))
);

ALTER POLICY "profiles_update" ON public.profiles
USING (
  (SELECT auth.uid()) = user_id
  OR (SELECT private.is_current_user_admin())
)
WITH CHECK (
  ((SELECT auth.uid()) = user_id AND role <> 'admin')
  OR (SELECT private.is_current_user_admin())
);

ALTER POLICY "profiles_delete" ON public.profiles
USING (
  (SELECT private.is_current_user_admin())
);