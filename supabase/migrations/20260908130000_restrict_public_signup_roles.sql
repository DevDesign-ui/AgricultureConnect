-- Public registration must never grant administrator privileges.
-- Administrators can still be assigned manually from the admin interface.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_nom text := COALESCE(NEW.raw_user_meta_data ->> 'nom', '');
  v_prenom text := COALESCE(NEW.raw_user_meta_data ->> 'prenom', '');
  v_telephone text := COALESCE(NEW.raw_user_meta_data ->> 'telephone', '');
  v_region text := COALESCE(NEW.raw_user_meta_data ->> 'region', '');
  v_role text := lower(COALESCE(NEW.raw_user_meta_data ->> 'role', 'acheteur'));
BEGIN
  IF v_role NOT IN ('agriculteur', 'fournisseur', 'acheteur') THEN
    v_role := 'acheteur';
  END IF;

  INSERT INTO public.profiles (
    user_id, email, nom, prenom, telephone, role, region,
    adresse, avatar_url, bio, latitude, longitude, is_active,
    created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_nom, v_prenom, v_telephone, v_role, v_region,
    '', NULL, '', NULL, NULL, true, now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    nom = EXCLUDED.nom,
    prenom = EXCLUDED.prenom,
    telephone = EXCLUDED.telephone,
    role = EXCLUDED.role,
    region = EXCLUDED.region,
    updated_at = now();

  RETURN NEW;
END;
$$;
