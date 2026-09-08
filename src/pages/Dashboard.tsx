import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Package, ShoppingBag, CreditCard, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase, Product, Order } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatDate, getStatusLabel, getStatusBadgeClass } from '../lib/utils';

interface Stats {
  totalUsers: number;
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<{ name: string; value: number }[]>([]);
  const [revenueData, setRevenueData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    async function fetchStats() {
      if (!user || !profile) return;

      const isAdmin = profile.role === 'admin';
      const isSeller = profile.role === 'agriculteur' || profile.role === 'fournisseur';

      const usersQuery = isAdmin
        ? supabase.from('profiles').select('id', { count: 'exact', head: true })
        : Promise.resolve({ count: null });
      const productsQuery = isAdmin
        ? supabase.from('products').select('id', { count: 'exact', head: true })
        : isSeller
          ? supabase.from('products').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
          : supabase.from('products').select('id', { count: 'exact', head: true }).eq('disponible', true);
      const ordersQuery = isAdmin
        ? supabase.from('orders').select('*')
        : isSeller
          ? supabase.from('orders').select('*').eq('seller_id', user.id)
          : supabase.from('orders').select('*').eq('acheteur_id', user.id);

      const [users, products, orders] = await Promise.all([
        usersQuery,
        productsQuery,
        ordersQuery,
      ]);

      const allOrders = orders.data ?? [];
      const revenue = allOrders
        .filter((o: Order) => o.statut === 'livree')
        .reduce((sum: number, o: Order) => sum + Number(o.total), 0);

      setStats({
        totalUsers: users.count ?? 0,
        totalProducts: products.count ?? 0,
        totalOrders: allOrders.length,
        totalRevenue: revenue,
        pendingOrders: allOrders.filter((o: Order) => o.statut === 'en_attente').length,
        completedOrders: allOrders.filter((o: Order) => o.statut === 'livree').length,
        cancelledOrders: allOrders.filter((o: Order) => o.statut === 'annulee').length,
      });

      setOrderStatusData([
        { name: 'En attente', value: allOrders.filter((o: Order) => o.statut === 'en_attente').length },
        { name: 'Confirmées', value: allOrders.filter((o: Order) => o.statut === 'confirmee').length },
        { name: 'Expédiées', value: allOrders.filter((o: Order) => o.statut === 'expediee').length },
        { name: 'Livrées', value: allOrders.filter((o: Order) => o.statut === 'livree').length },
        { name: 'Annulées', value: allOrders.filter((o: Order) => o.statut === 'annulee').length },
      ]);

      // Revenue by month (last 6 months)
      const now = new Date();
      const months: { name: string; value: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = d.toLocaleDateString('fr-FR', { month: 'short' });
        const monthRevenue = allOrders
          .filter((o: Order) => {
            const od = new Date(o.created_at);
            return o.statut === 'livree' && od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
          })
          .reduce((sum: number, o: Order) => sum + Number(o.total), 0);
        months.push({ name: monthName, value: monthRevenue });
      }
      setRevenueData(months);

      // Recent orders
      setRecentOrders(allOrders.slice(0, 5));

      // Recent products
      let productsListQuery = supabase.from('products').select('*').order('created_at', { ascending: false }).limit(5);
      if (isSeller) productsListQuery = productsListQuery.eq('user_id', user.id);
      if (!isAdmin && !isSeller) productsListQuery = productsListQuery.eq('disponible', true);
      const { data: prods } = await productsListQuery;
      setRecentProducts((prods ?? []) as Product[]);
    }

    fetchStats();
  }, [user, profile]);

  const isSeller = profile?.role === 'agriculteur' || profile?.role === 'fournisseur';
  const isBuyer = profile?.role === 'acheteur';
  const statCards = [
    ...(profile?.role === 'admin'
      ? [{ label: 'Utilisateurs inscrits', value: stats.totalUsers, icon: Users, color: 'bg-accent-500' }]
      : []),
    { label: isSeller ? 'Mes produits' : 'Produits disponibles', value: stats.totalProducts, icon: Package, color: 'bg-primary-500' },
    { label: isSeller ? 'Mes ventes' : isBuyer ? 'Mes achats' : 'Commandes', value: stats.totalOrders, icon: ShoppingBag, color: 'bg-secondary-500' },
    { label: isSeller ? 'Revenus de mes ventes' : 'Revenus (livraisons)', value: formatPrice(stats.totalRevenue), icon: TrendingUp, color: 'bg-success-500' },
  ];

  const COLORS = ['#f59e0b', '#0ea5e9', '#38bdf8', '#22c55e', '#ef4444'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Bonjour, {profile?.prenom} {profile?.nom}
        </h1>
        <p className="text-slate-500 mt-1">
          {profile?.role === 'admin'
            ? 'Voici un aperçu global de la plateforme'
            : isSeller
              ? 'Gérez vos produits et suivez vos ventes'
              : 'Suivez vos achats et découvrez les produits disponibles'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Order status quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-secondary-100 flex items-center justify-center">
            <Clock className="w-6 h-6 text-secondary-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">En attente</p>
            <p className="text-xl font-bold text-slate-900">{stats.pendingOrders}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Livrées</p>
            <p className="text-xl font-bold text-slate-900">{stats.completedOrders}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-error-100 flex items-center justify-center">
            <XCircle className="w-6 h-6 text-error-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Annulées</p>
            <p className="text-xl font-bold text-slate-900">{stats.cancelledOrders}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Revenus par mois</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatPrice(v)} />
              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-slate-900 mb-4">État des commandes</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={orderStatusData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={(entry) => `${entry.name}: ${entry.value}`}
              >
                {orderStatusData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Commandes récentes</h3>
            <Link to="/orders" className="text-sm text-primary-600 font-semibold hover:underline">
              Voir tout
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Aucune commande pour le moment</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {formatPrice(Number(order.total))}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(order.created_at)}</p>
                  </div>
                  <span className={getStatusBadgeClass(order.statut)}>{getStatusLabel(order.statut)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Produits récents</h3>
            <Link to="/products" className="text-sm text-primary-600 font-semibold hover:underline">
              Voir tout
            </Link>
          </div>
          {recentProducts.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Aucun produit pour le moment</p>
          ) : (
            <div className="space-y-3">
              {recentProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/products/${product.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.nom} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Package className="w-5 h-5 text-primary-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{product.nom}</p>
                      <p className="text-xs text-slate-500">{product.region}</p>
                    </div>
                  </div>
                  <p className="font-semibold text-slate-900 text-sm">{formatPrice(Number(product.prix))}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
