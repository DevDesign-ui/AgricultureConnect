import type { Product } from './supabase';

export const PRODUCT_IMAGES_BUCKET = 'agriculture-product-images';

type ProductImageFile = {
  id: string | null;
  name: string;
};

export interface ProductImageStorage {
  from(bucket: string): {
    list(
      path: string,
      options: { limit: number; offset: number; sortBy: { column: 'name'; order: 'asc' } }
    ): Promise<{ data: ProductImageFile[] | null; error: Error | null }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  };
}

export async function loadProductImages(
  storage: ProductImageStorage,
  product: Pick<Product, 'id' | 'user_id' | 'images'>
): Promise<string[]> {
  const images: string[] = [];
  const seen = new Set<string>();
  const addImage = (url: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push(url);
    }
  };

  for (const url of product.images ?? []) addImage(url);

  const folder = `${product.user_id}/${product.id}`;
  const bucket = storage.from(PRODUCT_IMAGES_BUCKET);
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await bucket.list(folder, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;

    for (const file of data ?? []) {
      if (file.id) {
        addImage(bucket.getPublicUrl(`${folder}/${file.name}`).data.publicUrl);
      }
    }

    if (!data || data.length < pageSize) break;
    offset += data.length;
  }

  return images;
}
