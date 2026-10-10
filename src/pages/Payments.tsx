import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { AlertTriangle, CreditCard, CheckCircle, Clock, XCircle } from 'lucide-react';
import { supabase, Payment, Order } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatDate, getStatusLabel, getStatusBadgeClass } from '../lib/utils';
import { getPaymentDisplayStatus, isProviderConfirmedPayment } from '../lib/payment-status';
import { getPaymentFunctionErrorMessage } from '../lib/payment-errors';

const PAYMENT_METHODS = [
  { value: 'orange_money', label: 'Orange Money', color: 'bg-orange-500' },
  { value: 'wave', label: 'Wave', color: 'bg-blue-500' },
  { value: 'free_money', label: 'Free Money', color: 'bg-red-500' },
  { value: 'carte_bancaire', label: 'Carte bancaire', color: 'bg-slate-700' },
  { value: 'paydunya_checkout', label: 'PayDunya Checkout', color: 'bg-primary-600' },
] as const;

export default function Payments() {
  const { user } = useAuth();
  const location = useLocation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Pick<Order, 'id' | 'total' | 'statut' | 'payment_status'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    async function fetchPayments() {
      if (!user) {
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(true);
      const { data, error: paymentsError } = await supabase
        .from('payments')
        .select('id, commande_id, user_id, montant, currency, methode, statut, reference, provider_event_id, provider_confirmed_at, provider_confirmation_verified, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (paymentsError) {
        setError(`Impossible de charger l'historique des paiements : ${paymentsError.message}`);
        setLoading(false);
        return;
      }

      const allPayments = (data ?? []) as Payment[];
      const orderIds = allPayments.map((p) => p.commande_id);
      const { data: ordersData, error: ordersError } = orderIds.length > 0
        ? await supabase.from('orders').select('*').in('id', orderIds)
        : { data: [], error: null };
      if (ordersError) {
        setError(`Impossible de charger les commandes liées aux paiements : ${ordersError.message}`);
      }
      const ordMap: Record<string, Order> = {};
      (ordersData ?? []).forEach((o) => { ordMap[(o as Order).id] = o as Order; });
      setOrders(ordMap);
      setPayments(allPayments);
      setLoading(false);
    }
    fetchPayments();
  }, [user]);

  useEffect(() => {
    const state = location.state as { orderId?: string } | null;
    const requestedOrderId = state?.orderId;
    const currentUser = user;
    if (requestedOrderId && currentUser) {
      const requestedByUserId = currentUser.id;
      setOrderId(requestedOrderId);
      setSelectedOrder(null);
      setError(null);
      idempotencyKey.current = crypto.randomUUID();
      setShowModal(true);

      async function fetchSelectedOrder() {
        const { data, error: orderError } = await supabase
          .from('orders')
          .select('id, total, statut, payment_status')
          .eq('id', requestedOrderId)
          .eq('acheteur_id', requestedByUserId)
          .maybeSingle();

        if (orderError) {
          setError(`Impossible de vérifier la commande : ${orderError.message}`);
        } else if (!data) {
          setError('Commande introuvable ou non autorisée pour ce compte.');
        } else {
          setSelectedOrder(data as Pick<Order, 'id' | 'total' | 'statut' | 'payment_status'>);
        }
      }

      void fetchSelectedOrder();
    }
  }, [location.state, user]);

  const handlePayment = async () => {
    if (!user || !orderId || !selectedOrder || selectedOrder.payment_status === 'paye') return;
    setProcessing(true);
    setError(null);
    try {
      const key = idempotencyKey.current ?? crypto.randomUUID();
      idempotencyKey.current = key;
      const { data, error: invokeError } = await supabase.functions.invoke('payment-initiate', {
        body: { orderId, idempotencyKey: key },
      });
      if (invokeError) {
        throw new Error(await getPaymentFunctionErrorMessage(invokeError));
      }
      if (typeof data?.checkoutUrl !== 'string') {
        throw new Error(data?.message ?? 'Le prestataire n’a pas renvoyé de session de paiement.');
      }
      const destination = new URL(data.checkoutUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'app.paydunya.com'
          || !/^\/(?:sandbox-)?checkout\/invoice\/[A-Za-z0-9_-]+$/.test(destination.pathname)) {
        throw new Error('URL de paiement du prestataire invalide.');
      }
      window.location.assign(destination.toString());
    } catch (paymentError) {
      setError(paymentError instanceof Error
        ? paymentError.message
        : 'Erreur inattendue pendant l’initiation du paiement.');
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paiements</h1>
        <p className="text-slate-500 mt-1">Historique et gestion des paiements</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            La disponibilité d’Orange Money, Wave, Free Money et de la carte dépend de l’activation de chaque méthode sur le compte marchand PayDunya. Le paiement ne sera confirmé qu’après vérification de la notification fournisseur.
          </p>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700" role="alert">
          {error}
        </div>
      )}

      {/* Payment methods info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PAYMENT_METHODS.map((m) => (
          <div key={m.value} className="card flex items-center gap-3 py-3">
            <div className={`w-10 h-10 rounded-lg ${m.color} flex items-center justify-center`}>
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-700">{m.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : payments.length === 0 ? (
        <div className="card text-center py-12">
          <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucun paiement effectué</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${PAYMENT_METHODS.find(m => m.value === payment.methode)?.color ?? 'bg-slate-400'} flex items-center justify-center`}>
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{formatPrice(Number(payment.montant))}</p>
                  <p className="text-sm text-slate-500">
                    {PAYMENT_METHODS.find(m => m.value === payment.methode)?.label ?? payment.methode}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(payment.created_at)}</p>
                  {payment.reference && <p className="text-xs text-slate-400">Réf: {payment.reference}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isProviderConfirmedPayment(payment) && <CheckCircle className="w-5 h-5 text-primary-500" />}
                {payment.statut === 'valide' && !isProviderConfirmedPayment(payment) && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                {(payment.statut === 'initie' || payment.statut === 'en_attente') && <Clock className="w-5 h-5 text-secondary-500" />}
                {(payment.statut === 'echoue' || payment.statut === 'annule' || payment.statut === 'expiree') && <XCircle className="w-5 h-5 text-error-500" />}
                <span className={getStatusBadgeClass(getPaymentDisplayStatus(payment))}>
                  {getStatusLabel(getPaymentDisplayStatus(payment))}
                </span>
                {orders[payment.commande_id] && (
                  <Link to={`/orders/${payment.commande_id}`} className="text-sm text-primary-600 font-semibold hover:underline">
                    Voir commande
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-up">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Effectuer le paiement</h2>
              {selectedOrder?.payment_status === 'paye' ? (
                <p className="text-sm text-emerald-700 mb-4">Cette commande est déjà marquée payée après confirmation du prestataire.</p>
              ) : selectedOrder ? (
                <p className="text-slate-600 mb-4">
                  Montant issu de la commande :{' '}
                  <span className="font-bold text-primary-600">{formatPrice(Number(selectedOrder.total))}</span>
                </p>
              ) : (
                <p className="text-sm text-slate-500 mb-4">Vérification de la commande…</p>
              )}
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Les options réellement activées pour ce compte marchand seront affichées sur la page sécurisée PayDunya.
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} disabled={processing} className="btn-secondary flex-1">Annuler</button>
                <button onClick={handlePayment} disabled={processing || !selectedOrder || selectedOrder.payment_status === 'paye'} className="btn-primary flex-1">
                  {processing ? 'Préparation…' : 'Continuer vers PayDunya'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
