/*
# Ajout de la colonne seller_id à orders et création de la table regions

1. Modifications
- Ajout de `seller_id` (uuid) à la table `orders` pour identifier le vendeur.
- Création de la table `regions` pour stocker les régions géographiques.
- Ajout d'une politique RLS pour que les vendeurs puissent voir leurs commandes.

2. Sécurité
- RLS activée sur `regions` avec lecture publique (anon + authenticated).
- Politique SELECT mise à jour sur `orders` pour inclure le vendeur.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Créer la table profiles si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nom text NOT NULL,
  prenom text NOT NULL,
  telephone text,
  role text NOT NULL CHECK (role IN ('admin', 'agriculteur', 'fournisseur', 'acheteur')),
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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND email IS NOT NULL
    AND nom IS NOT NULL
    AND prenom IS NOT NULL
  );

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Ajouter seller_id à orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);

-- Mettre à jour la politique SELECT sur orders pour inclure le vendeur
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT
  TO authenticated USING (auth.uid() = acheteur_id OR auth.uid() = seller_id);

-- Mettre à jour la politique UPDATE sur orders pour inclure le vendeur
DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE
  TO authenticated USING (auth.uid() = acheteur_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = acheteur_id OR auth.uid() = seller_id);

-- Créer la table regions
CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_regions" ON regions;
CREATE POLICY "anon_select_regions" ON regions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_regions" ON regions;
CREATE POLICY "admin_insert_regions" ON regions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_regions" ON regions;
CREATE POLICY "admin_update_regions" ON regions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_regions" ON regions;
CREATE POLICY "admin_delete_regions" ON regions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
  );
