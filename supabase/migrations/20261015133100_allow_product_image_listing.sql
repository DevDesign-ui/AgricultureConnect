-- Authenticated users may list images only for products visible in the catalogue.
DROP POLICY IF EXISTS "product_images_product_read" ON storage.objects;
CREATE POLICY "product_images_product_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agriculture-product-images'
    AND EXISTS (
      SELECT 1
      FROM public.products
      WHERE products.id::text = (storage.foldername(name))[2]
        AND products.user_id::text = (storage.foldername(name))[1]
    )
  );
