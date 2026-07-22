import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, CreditCard, CheckCircle, XCircle, Truck, Package } from 'lucide-react';
import { supabase, Order, OrderItem, Product, Profile, Payment } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatDate, getStatusLabel, getStatusBadgeClass, createNotification } from '../lib/utils';

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<(OrderItem & { product?: Product })[]>([]);
  const [buyer, setBuyer] = useState<Profile | null>(null);
  const [seller, setSeller] = useState<Profile | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      if (!id) return;
      const { data: orderData } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (!orderData) { setLoading(false); return; }
      const ord = orderData as Order;
      setOrder(ord);

      const [itemsRes, buyerRes, sellerRes, paymentRes] = await Promise.all([
        supabase.from('order_items').select('*').eq('commande_id', id),
        ord.acheteur_id ? supabase.from('profiles').select('*').eq('user_id', ord.acheteur_id).maybeSingle() : Promise.resolve({ data: null }),
        ord.seller_id ? supabase.from('profiles').select('*').eq('user_id', ord.seller_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('payments').select('*').eq('commande_id', id).maybeSingle(),
      ]);

      // Fetch products for items
      const orderItems = (itemsRes.data ?? []) as OrderItem[];
      const productIds = orderItems.map((i) => i.produit_id);
      const { data: products } = await supabase.from('products').select('*').in('id', productIds);
      const prodMap: Record<string, Product> = {};
      (products ?? []).forEach((p) => { prodMap[(p as Product).id] = p as Product; });

      setItems(orderItems.map((i) => ({ ...i, product: prodMap[i.produit_id] })));
      if (buyerRes.data) setBuyer(buyerRes.data as Profile);
      if (sellerRes.data) setSeller(sellerRes.data as Profile);
      if (paymentRes.data) setPayment(paymentRes.data as Payment);
      setLoading(false);
    }
    fetchOrder();
  }, [id]);

  const updateStatus = async (newStatus: Order['statut']) => {
    if (!order || !user) return;
    setUpdating(true);
    await supabase.from('orders').update({ statut: newStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
    setOrder({ ...order, statut: newStatus });

    // Notify the other party
    const isSeller = order.seller_id === user.id;
    const notifyUserId = isSeller ? order.acheteur_id : order.seller_id;
    if (notifyUserId) {
      const notifType = newStatus === 'annulee' ? 'annulation_commande' : 'validation_commande';
      const titre = newStatus === 'annulee' ? 'Commande annulée' : 'Commande mise à jour';
      const contenu = `Votre commande a été mise à jour: ${getStatusLabel(newStatus)}`;
      await createNotification(notifyUserId, notifType, titre, contenu, `/orders/${order.id}`);
    }
    setUpdating(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-500">Commande introuvable</p>
        <Link to="/orders" className="text-primary-600 font-semibold mt-2 inline-block">Retour</Link>
      </div>
    );
  }

  const isSeller = order.seller_id === user?.id;
  const isBuyer = order.acheteur_id === user?.id;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Link to="/orders" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>

      {/* Order header */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Commande</h1>
            <p className="text-sm text-slate-500">{formatDate(order.created_at)}</p>
          </div>
          <span className={getStatusBadgeClass(order.statut)}>{getStatusLabel(order.statut)}</span>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500">Acheteur</p>
            <p className="font-semibold text-slate-900">{buyer ? `${buyer.prenom} ${buyer.nom}` : 'N/A'}</p>
            <p className="text-xs text-slate-500">{buyer?.telephone}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Vendeur</p>
            <p className="font-semibold text-slate-900">{seller ? `${seller.prenom} ${seller.nom}` : 'N/A'}</p>
            <p className="text-xs text-slate-500">{seller?.telephone}</p>
          </div>
        </div>
        {order.adresse_livraison && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Adresse de livraison</p>
            <p className="text-sm text-slate-700">{order.adresse_livraison}</p>
          </div>
        )}
      </div>

      {/* Order items */}
      <div className="card">
        <h3 className="font-semibold text-slate-900 mb-4">Articles</h3>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              {item.product?.images?.[0] ? (
                <img src={item.product.images[0]} alt={item.product.nom} className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary-600" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-slate-900 text-sm">{item.product?.nom ?? 'Produit'}</p>
                <p className="text-xs text-slate-500">{item.quantite} × {formatPrice(Number(item.prix_unitaire))}</p>
              </div>
              <p className="font-semibold text-slate-900">{formatPrice(Number(item.prix_unitaire) * item.quantite)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-xl font-bold text-primary-600">{formatPrice(Number(order.total))}</span>
        </div>
      </div>

      {/* Payment info */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Paiement</h3>
          <CreditCard className="w-5 h-5 text-slate-400" />
        </div>
        {payment ? (
          <div>
            <p className="text-sm text-slate-600">Méthode: {payment.methode}</p>
            <p className="text-sm text-slate-600">Référence: {payment.reference || 'N/A'}</p>
            <span className={`${getStatusBadgeClass(payment.statut)} mt-2 inline-block`}>{getStatusLabel(payment.statut)}</span>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500 mb-3">Aucun paiement enregistré</p>
            {isBuyer && order.statut !== 'annulee' && (
              <Link to="/payments" state={{ orderId: order.id, amount: order.total }} className="btn-primary">
                <CreditCard className="w-4 h-4" /> Effectuer le paiement
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {(isSeller || isBuyer) && order.statut !== 'annulee' && order.statut !== 'livree' && (
        <div className="card">
          <h3 className="font-semibold text-slate-900 mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {isSeller && order.statut === 'en_attente' && (
              <button onClick={() => updateStatus('confirmee')} disabled={updating} className="btn-primary">
                <CheckCircle className="w-4 h-4" /> Confirmer
              </button>
            )}
            {isSeller && order.statut === 'confirmee' && (
              <button onClick={() => updateStatus('expediee')} disabled={updating} className="btn-primary">
                <Truck className="w-4 h-4" /> Marquer expédiée
              </button>
            )}
            {isSeller && order.statut === 'expediee' && (
              <button onClick={() => updateStatus('livree')} disabled={updating} className="btn-primary">
                <CheckCircle className="w-4 h-4" /> Marquer livrée
              </button>
            )}
            {(isSeller || isBuyer) && (
              <button onClick={() => updateStatus('annulee')} disabled={updating} className="btn-danger">
                <XCircle className="w-4 h-4" /> Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
