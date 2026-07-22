import { supabase } from '../lib/supabase';

export async function createNotification(
  userId: string,
  type: 'nouvelle_commande' | 'validation_commande' | 'annulation_commande' | 'nouveau_produit' | 'message' | 'paiement',
  titre: string,
  contenu: string,
  lien: string | null = null
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    titre,
    contenu,
    lien,
    lue: false,
  });
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(price);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusLabel(statut: string): string {
  const labels: Record<string, string> = {
    en_attente: 'En attente',
    confirmee: 'Confirmée',
    expediee: 'Expédiée',
    livree: 'Livrée',
    annulee: 'Annulée',
    valide: 'Validé',
    echoue: 'Échoué',
    annule: 'Annulé',
  };
  return labels[statut] ?? statut;
}

export function getStatusBadgeClass(statut: string): string {
  const classes: Record<string, string> = {
    en_attente: 'badge-yellow',
    confirmee: 'badge-blue',
    expediee: 'badge-blue',
    livree: 'badge-green',
    annulee: 'badge-red',
    valide: 'badge-green',
    echoue: 'badge-red',
    annule: 'badge-red',
  };
  return classes[statut] ?? 'badge-gray';
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrateur',
    agriculteur: 'Agriculteur',
    fournisseur: 'Fournisseur',
    acheteur: 'Acheteur',
  };
  return labels[role] ?? role;
}
