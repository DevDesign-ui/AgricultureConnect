-- Allow administrators to view all orders for platform-wide dashboard statistics.
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = acheteur_id
    OR auth.uid() = seller_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
