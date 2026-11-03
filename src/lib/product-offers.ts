import type { Product, ProductOfferType } from './supabase';

export const PRODUCT_OFFER_TYPES: ProductOfferType[] = [
  'produit_agricole',
  'materiel_vente',
  'materiel_location',
  'service_agricole',
];

export const PRODUCT_OFFER_LABELS: Record<ProductOfferType, string> = {
  produit_agricole: 'Produits agricoles',
  materiel_vente: 'Matériel à vendre',
  materiel_location: 'Matériel à louer',
  service_agricole: 'Services agricoles',
};

export const AGRICULTURAL_SERVICES = [
  { value: 'labour', label: 'Labour' },
  { value: 'semis', label: 'Semis' },
  { value: 'recolte', label: 'Récolte' },
  { value: 'battage', label: 'Battage' },
  { value: 'irrigation', label: 'Irrigation' },
  { value: 'pulverisation', label: 'Pulvérisation' },
  { value: 'transport', label: 'Transport' },
] as const;

export type AgriculturalServiceType = (typeof AGRICULTURAL_SERVICES)[number]['value'];

export const RENTAL_PRICE_UNITS = ['heure', 'jour', 'semaine'] as const;
export const SERVICE_PRICE_UNITS = ['heure', 'hectare', 'trajet', 'forfait'] as const;

export type OfferCatalogFilter = 'tous' | ProductOfferType;

export function getProductOfferType(product: Pick<Product, 'type_offre'>): ProductOfferType {
  return product.type_offre && PRODUCT_OFFER_TYPES.includes(product.type_offre)
    ? product.type_offre
    : 'produit_agricole';
}

export function isPurchasableOffer(product: Pick<Product, 'type_offre'>): boolean {
  const type = getProductOfferType(product);
  return type === 'produit_agricole' || type === 'materiel_vente';
}

export function isOfferAvailable(product: Pick<Product, 'type_offre' | 'disponible' | 'stock'>): boolean {
  if (!product.disponible) return false;
  return isPurchasableOffer(product) ? product.stock > 0 : true;
}

export function getOfferPriceUnit(
  product: Pick<Product, 'type_offre' | 'unite' | 'unite_tarifaire'>
): string {
  const type = getProductOfferType(product);
  return type === 'materiel_location' || type === 'service_agricole'
    ? product.unite_tarifaire || 'forfait'
    : product.unite;
}

export function filterProductsByOfferType<T extends Pick<Product, 'type_offre'>>(
  products: T[],
  filter: OfferCatalogFilter
): T[] {
  if (filter === 'tous') return products;
  return products.filter((product) => getProductOfferType(product) === filter);
}
