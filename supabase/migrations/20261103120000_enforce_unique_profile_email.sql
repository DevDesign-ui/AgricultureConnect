DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE deleted_at IS NULL
      AND email IS NOT NULL
      AND btrim(email) <> ''
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active Auth emails must be resolved before enforcing profile email uniqueness; no Auth accounts were changed.';
  END IF;
END;
$$;

UPDATE public.profiles AS profile
SET email = lower(btrim(auth_user.email)),
    updated_at = CASE
      WHEN profile.email IS DISTINCT FROM lower(btrim(auth_user.email)) THEN now()
      ELSE profile.updated_at
    END
FROM auth.users AS auth_user
WHERE auth_user.id = profile.user_id
  AND auth_user.email IS NOT NULL
  AND btrim(auth_user.email) <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate profile emails remain after synchronization with Auth; resolve them without deleting Auth accounts.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (email)'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_email_unique UNIQUE (email);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_normalized_unique
  ON public.profiles (lower(btrim(email)));