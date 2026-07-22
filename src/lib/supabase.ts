import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type UserRole = 'admin' | 'agriculteur' | 'fournisseur' | 'acheteur';

export interface Profile {
  id: string;
  user_id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: UserRole;
  region: string;
  adresse: string;
  avatar_url: string;
  bio: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  nom: string;
  description: string;
  created_at: string;
}

export interface Region {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  categorie_id: string | null;
  nom: string;
  description: string;
  prix: number;
  unite: string;
  stock: number;
  disponible: boolean;
  region: string;
  images: string[];
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  acheteur_id: string;
  seller_id: string | null;
  statut: 'en_attente' | 'confirmee' | 'expediee' | 'livree' | 'annulee';
  total: number;
  adresse_livraison: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  commande_id: string;
  produit_id: string;
  quantite: number;
  prix_unitaire: number;
  created_at: string;
}

export interface Payment {
  id: string;
  commande_id: string;
  user_id: string;
  montant: number;
  methode: 'orange_money' | 'wave' | 'free_money' | 'carte_bancaire';
  statut: 'en_attente' | 'valide' | 'echoue' | 'annule';
  reference: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  expediteur_id: string;
  destinataire_id: string;
  contenu: string;
  lu: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  titre: string;
  contenu: string;
  type: 'nouvelle_commande' | 'validation_commande' | 'annulation_commande' | 'nouveau_produit' | 'message' | 'paiement';
  lue: boolean;
  lien: string | null;
  created_at: string;
}
