/*
# Ajout de seller_id à orders et création de la table regions

1. Modifications
- Ajout de seller_id (uuid) à la table orders pour identifier le vendeur.
- Création de la table regions pour stocker les régions géographiques.
- Ajout des politiques RLS nécessaires.

2. Sécurité
- RLS activée sur regions.
- Lecture publique des régions.
- Gestion des régions réservée aux administrateurs.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================
-- AJOUT DE seller_id À LA TABLE orders
-- =====================================================

-- Vérifier que la table orders existe avant modification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    AND table_name = 'orders'
  ) THEN

    ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS seller_id uuid 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_orders_seller_id 
    ON orders(seller_id);


    -- Politique SELECT pour acheteur et vendeur
    DROP POLICY IF EXISTS "orders_select" ON orders;

    CREATE POLICY "orders_select" 
    ON orders 
    FOR SELECT
    TO authenticated
    USING (
      auth.uid() = acheteur_id 
      OR auth.uid() = seller_id
    );


    -- Politique UPDATE pour acheteur et vendeur
    DROP POLICY IF EXISTS "orders_update" ON orders;

    CREATE POLICY "orders_update" 
    ON orders 
    FOR UPDATE
    TO authenticated
    USING (
      auth.uid() = acheteur_id 
      OR auth.uid() = seller_id
    )
    WITH CHECK (
      auth.uid() = acheteur_id 
      OR auth.uid() = seller_id
    );

  END IF;
END $$;



-- =====================================================
-- CREATION DE LA TABLE regions
-- =====================================================

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  created_at timestamptz DEFAULT now()
);


-- Activation RLS

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;


-- Lecture publique des régions

DROP POLICY IF EXISTS "anon_select_regions" ON regions;

CREATE POLICY "anon_select_regions"
ON regions
FOR SELECT
TO anon, authenticated
USING (true);



-- Ajout réservé aux administrateurs

DROP POLICY IF EXISTS "admin_insert_regions" ON regions;

CREATE POLICY "admin_insert_regions"
ON regions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);



-- Modification réservée aux administrateurs

DROP POLICY IF EXISTS "admin_update_regions" ON regions;

CREATE POLICY "admin_update_regions"
ON regions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);



-- Suppression réservée aux administrateurs

DROP POLICY IF EXISTS "admin_delete_regions" ON regions;

CREATE POLICY "admin_delete_regions"
ON regions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);