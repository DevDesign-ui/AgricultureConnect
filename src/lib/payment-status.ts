import type { Payment } from './supabase';

export function isProviderConfirmedPayment(
  payment: Pick<Payment, 'statut' | 'provider_event_id' | 'provider_confirmed_at' | 'provider_confirmation_verified'>
): boolean {
  return payment.statut === 'valide'
    && payment.provider_confirmation_verified === true
    && Boolean(payment.provider_event_id)
    && Boolean(payment.provider_confirmed_at);
}

export function getPaymentDisplayStatus(
  payment: Pick<Payment, 'statut' | 'provider_event_id' | 'provider_confirmed_at' | 'provider_confirmation_verified'>
): string {
  return payment.statut === 'valide' && !isProviderConfirmedPayment(payment)
    ? 'non_verifie'
    : payment.statut;
}
