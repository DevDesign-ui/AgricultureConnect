export const PAYMENT_METHODS = [
  'orange_money',
  'wave',
  'free_money',
  'carte_bancaire',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface OrderItemAmount {
  quantite: number | string;
  prix_unitaire: number | string;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string'
    && PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function isPayableOrderStatus(value: unknown): boolean {
  return value === 'en_attente' || value === 'confirmee';
}

export function calculateOrderAmount(items: OrderItemAmount[]): number {
  if (items.length === 0) {
    throw new Error('La commande ne contient aucun article.');
  }

  let total = 0;
  for (const item of items) {
    const quantity = Number(item.quantite);
    const unitPrice = Number(item.prix_unitaire);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error('Quantité de commande invalide.');
    }
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      throw new Error('Prix unitaire invalide pour une transaction en XOF.');
    }

    const lineTotal = quantity * unitPrice;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) {
      throw new Error('Le montant de la commande dépasse la précision prise en charge.');
    }
    total += lineTotal;
  }

  if (total <= 0) {
    throw new Error('Le montant de la commande doit être supérieur à zéro.');
  }
  return total;
}

export function matchesPersistedOrderTotal(itemsTotal: number, orderTotal: number | string): boolean {
  const persistedTotal = Number(orderTotal);
  return Number.isSafeInteger(persistedTotal) && persistedTotal === itemsTotal;
}
