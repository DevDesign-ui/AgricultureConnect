/*
# Robust signup profile creation for production

This migration makes profile creation resilient in production when email confirmation
is enabled in Supabase Auth.

- Creates a database trigger on auth.users insert
- Automatically creates/updates the public.profiles row from auth metadata
- Defines complete RLS policies for the profiles table
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure the profiles table exists before we apply policies.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nom text NOT NULL,
  prenom text NOT NULL,
  telephone text,
  role text NOT NULL CHECK (role IN ('admin', 'agriculteur', 'fournisseur', 'acheteur')) DEFAULT 'acheteur',
  region text,
  adresse text,
  avatar_url text,
  bio text,
  latitude double precision,
  longitude double precision,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger function: create a profile automatically when a new auth user is registered.
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
  IF v_role NOT IN ('admin', 'agriculteur', 'fournisseur', 'acheteur') THEN
    v_role := 'acheteur';
  END IF;

  INSERT INTO public.profiles (
    user_id,
    email,
    nom,
    prenom,
    telephone,
    role,
    region,
    adresse,
    avatar_url,
    bio,
    latitude,
    longitude,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_nom, ''),
    COALESCE(v_prenom, ''),
    COALESCE(v_telephone, ''),
    v_role,
    COALESCE(v_region, ''),
    '',
    NULL,
    '',
    NULL,
    NULL,
    true,
    now(),
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- RLS policies for profiles.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles admin_profile
    WHERE admin_profile.user_id = auth.uid()
      AND admin_profile.role = 'admin'
  )
);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND email IS NOT NULL
  AND nom IS NOT NULL
  AND prenom IS NOT NULL
);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles admin_profile
    WHERE admin_profile.user_id = auth.uid()
      AND admin_profile.role = 'admin'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles admin_profile
    WHERE admin_profile.user_id = auth.uid()
      AND admin_profile.role = 'admin'
  )
);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles admin_profile
    WHERE admin_profile.user_id = auth.uid()
      AND admin_profile.role = 'admin'
  )
);
