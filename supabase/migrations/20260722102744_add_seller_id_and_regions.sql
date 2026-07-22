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
