import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { CreditCard, CheckCircle, Clock, XCircle } from 'lucide-react';
import { supabase, Payment, Order } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatDate, getStatusLabel, getStatusBadgeClass, createNotification } from '../lib/utils';

const PAYMENT_METHODS = [
  { value: 'orange_money', label: 'Orange Money', color: 'bg-orange-500' },
  { value: 'wave', label: 'Wave', color: 'bg-blue-500' },
  { value: 'free_money', label: 'Free Money', color: 'bg-red-500' },
  { value: 'carte_bancaire', label: 'Carte bancaire', color: 'bg-slate-700' },
];

export default function Payments() {
  const { user } = useAuth();
  const location = useLocation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('orange_money');
  const [processing, setProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);

  useEffect(() => {
    async function fetchPayments() {
      if (!user) return;
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const allPayments = (data ?? []) as Payment[];

      const orderIds = allPayments.map((p) => p.commande_id);
      const { data: ordersData } = await supabase.from('orders').select('*').in('id', orderIds);
      const ordMap: Record<string, Order> = {};
      (ordersData ?? []).forEach((o) => { ordMap[(o as Order).id] = o as Order; });
      setOrders(ordMap);
      setPayments(allPayments);
      setLoading(false);
    }
    fetchPayments();
  }, [user]);

  useEffect(() => {
    const state = location.state as { orderId?: string; amount?: number } | null;
    if (state?.orderId && state?.amount) {
      setOrderId(state.orderId);
      setAmount(state.amount);
      setShowModal(true);
    }
  }, [location.state]);

  const handlePayment = async () => {
    if (!user || !orderId) return;
    setProcessing(true);
    const reference = `PAY-${Date.now()}`;
    const { data, error } = await supabase.from('payments').insert({
      commande_id: orderId,
      user_id: user.id,
      montant: amount,
      methode: selectedMethod,
      statut: 'valide',
      reference,
    }).select().single();

    if (!error && data) {
      // Notify seller
      const order = orders[orderId];
      if (order?.seller_id) {
        await createNotification(
          order.seller_id,
          'paiement',
          'Paiement reçu',
          `Un paiement de ${formatPrice(amount)} a été effectué pour votre commande`,
          `/orders/${orderId}`
        );
      }
      setShowModal(false);
      setOrderId(null);
      // Refresh
      const { data: refreshed } = await supabase.from('payments').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      setPayments((refreshed ?? []) as Payment[]);
    }
    setProcessing(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paiements</h1>
        <p className="text-slate-500 mt-1">Historique et gestion des paiements</p>
      </div>

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
                {payment.statut === 'valide' && <CheckCircle className="w-5 h-5 text-primary-500" />}
                {payment.statut === 'en_attente' && <Clock className="w-5 h-5 text-secondary-500" />}
                {payment.statut === 'echoue' && <XCircle className="w-5 h-5 text-error-500" />}
                <span className={getStatusBadgeClass(payment.statut)}>{getStatusLabel(payment.statut)}</span>
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
              <p className="text-slate-600 mb-4">Montant: <span className="font-bold text-primary-600">{formatPrice(amount)}</span></p>
              <label className="label">Choisir le mode de paiement</label>
              <div className="space-y-2">
                {PAYMENT_METHODS.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedMethod === m.value ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input type="radio" name="method" value={m.value} checked={selectedMethod === m.value} onChange={(e) => setSelectedMethod(e.target.value)} className="sr-only" />
                    <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center`}>
                      <CreditCard className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-slate-700">{m.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuler</button>
                <button onClick={handlePayment} disabled={processing} className="btn-primary flex-1">
                  {processing ? 'Traitement...' : 'Payer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
