import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Eye } from 'lucide-react';
import { supabase, Order, Profile } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatDate, getStatusLabel, getStatusBadgeClass } from '../lib/utils';

export default function Orders() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'acheteur' | 'vendeur'>('all');

  useEffect(() => {
    async function fetchOrders() {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('*')
        .or(`acheteur_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      const allOrders = (data ?? []) as Order[];

      // Fetch related profiles
      const userIds = new Set<string>();
      allOrders.forEach((o) => {
        userIds.add(o.acheteur_id);
        if (o.seller_id) userIds.add(o.seller_id);
      });
      const { data: profs } = await supabase.from('profiles').select('*').in('user_id', Array.from(userIds));
      const profMap: Record<string, Profile> = {};
      (profs ?? []).forEach((p) => {
        profMap[(p as Profile).user_id] = p as Profile;
      });
      setProfiles(profMap);
      setOrders(allOrders);
      setLoading(false);
    }
    fetchOrders();
  }, [user]);

  const filteredOrders = orders.filter((o) => {
    if (filter === 'acheteur') return o.acheteur_id === user?.id;
    if (filter === 'vendeur') return o.seller_id === user?.id;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Commandes</h1>
        <p className="text-slate-500 mt-1">Suivez et gérez vos commandes</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'Toutes' },
          { key: 'acheteur', label: 'Mes achats' },
          { key: 'vendeur', label: 'Mes ventes' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as typeof filter)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              filter === tab.key ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card text-center py-12">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucune commande</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isBuyer = order.acheteur_id === user?.id;
            const otherId = isBuyer ? order.seller_id : order.acheteur_id;
            const otherProfile = otherId ? profiles[otherId] : null;
            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="card flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{formatPrice(Number(order.total))}</p>
                    <p className="text-sm text-slate-500">
                      {isBuyer ? 'Acheté de' : 'Vendu à'} {otherProfile ? `${otherProfile.prenom} ${otherProfile.nom}` : 'Utilisateur'}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(order.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={getStatusBadgeClass(order.statut)}>{getStatusLabel(order.statut)}</span>
                  <Eye className="w-5 h-5 text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
