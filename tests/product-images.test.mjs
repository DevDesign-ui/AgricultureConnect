import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductImages, PRODUCT_IMAGES_BUCKET } from '../src/lib/productImages.ts';

test('loads every stored photo for a product after its record is reloaded', async () => {
  const product = {
    id: 'product-123',
    user_id: 'seller-456',
    images: ['https://project.supabase.co/storage/v1/object/public/agriculture-product-images/seller-456/product-123/main.png'],
  };
  const storedFiles = [
    { id: 'file-1', name: 'main.png' },
    { id: 'file-2', name: 'detail-one.png' },
    { id: 'file-3', name: 'detail-two.png' },
  ];
  const listedFolders = [];
  const storage = {
    from(bucketName) {
      assert.equal(bucketName, PRODUCT_IMAGES_BUCKET);
      return {
        async list(folder, options) {
          listedFolders.push(folder);
          assert.deepEqual(options, {
            limit: 100,
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
          });
          return { data: storedFiles, error: null };
        },
        getPublicUrl(path) {
          return {
            data: {
              publicUrl: `https://project.supabase.co/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`,
            },
          };
        },
      };
    },
  };

  const images = await loadProductImages(storage, product);

  assert.deepEqual(listedFolders, ['seller-456/product-123']);
  assert.equal(images.length, 3);
  assert.deepEqual(images, [
    product.images[0],
    `https://project.supabase.co/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/seller-456/product-123/detail-one.png`,
    `https://project.supabase.co/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/seller-456/product-123/detail-two.png`,
  ]);
});

test('propagates Storage listing errors so the gallery can report them', async () => {
  const storageError = new Error('Storage listing denied');
  const storage = {
    from() {
      return {
        async list() {
          return { data: null, error: storageError };
        },
        getPublicUrl() {
          throw new Error('A URL must not be requested after a listing error');
        },
      };
    },
  };

  await assert.rejects(
    loadProductImages(storage, { id: 'product-123', user_id: 'seller-456', images: [] }),
    storageError
  );
});
