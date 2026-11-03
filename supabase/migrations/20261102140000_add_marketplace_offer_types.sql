-- Add marketplace activity types and optional details without changing existing offers.
BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS type_offre text NOT NULL DEFAULT 'produit_agricole',
  ADD COLUMN IF NOT EXISTS marque text,
  ADD COLUMN IF NOT EXISTS modele text,
  ADD COLUMN IF NOT EXISTS etat_materiel text,
  ADD COLUMN IF NOT EXISTS unite_tarifaire text,
  ADD COLUMN IF NOT EXISTS duree_minimum numeric,
  ADD COLUMN IF NOT EXISTS caution numeric,
  ADD COLUMN IF NOT EXISTS conditions_offre text,
  ADD COLUMN IF NOT EXISTS type_service text,
  ADD COLUMN IF NOT EXISTS zones_intervention text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_type_offre_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_type_offre_check
      CHECK (type_offre IN (
        'produit_agricole',
        'materiel_vente',
        'materiel_location',
        'service_agricole'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_etat_materiel_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_etat_materiel_check
      CHECK (etat_materiel IS NULL OR etat_materiel IN ('neuf', 'bon_etat', 'usage'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_unite_tarifaire_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_unite_tarifaire_check
      CHECK (
        unite_tarifaire IS NULL
        OR unite_tarifaire IN ('heure', 'jour', 'semaine', 'hectare', 'trajet', 'forfait')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_offer_numeric_details_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_offer_numeric_details_check
      CHECK (
        (duree_minimum IS NULL OR duree_minimum > 0)
        AND (caution IS NULL OR caution >= 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_service_type_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_service_type_check
      CHECK (
        type_service IS NULL
        OR type_service IN ('labour', 'semis', 'recolte', 'battage', 'irrigation', 'pulverisation', 'transport')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_rental_details_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_rental_details_check
      CHECK (
        type_offre <> 'materiel_location'
        OR (
          unite_tarifaire IS NOT NULL
          AND unite_tarifaire IN ('heure', 'jour', 'semaine')
          AND conditions_offre IS NOT NULL
          AND btrim(conditions_offre) <> ''
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_service_details_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_service_details_check
      CHECK (
        type_offre <> 'service_agricole'
        OR (
          type_service IS NOT NULL
          AND unite_tarifaire IS NOT NULL
          AND unite_tarifaire IN ('heure', 'hectare', 'trajet', 'forfait')
          AND conditions_offre IS NOT NULL
          AND btrim(conditions_offre) <> ''
          AND zones_intervention IS NOT NULL
          AND cardinality(zones_intervention) > 0
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS products_type_offre_created_at_idx
  ON public.products (type_offre, created_at DESC);

-- Keep the existing owner policies and add role/ownership boundaries for writes.
DROP POLICY IF EXISTS products_publisher_insert_boundary ON public.products;
CREATE POLICY products_publisher_insert_boundary
ON public.products
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'agriculteur', 'fournisseur')
  )
);

DROP POLICY IF EXISTS products_publisher_update_boundary ON public.products;
CREATE POLICY products_publisher_update_boundary
ON public.products
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'agriculteur', 'fournisseur')
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'agriculteur', 'fournisseur')
  )
);

DROP POLICY IF EXISTS products_publisher_delete_boundary ON public.products;
CREATE POLICY products_publisher_delete_boundary
ON public.products
AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'agriculteur', 'fournisseur')
  )
);

COMMIT;
