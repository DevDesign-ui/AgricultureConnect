import { useEffect, useState } from 'react';
import { Users, Package, ShoppingBag, Tag, MapPin, Trash2, Plus, X, Settings } from 'lucide-react';
import { supabase, Profile, Product, Order, Category, Region } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatDate, getRoleLabel, getStatusLabel, getStatusBadgeClass } from '../lib/utils';

type Tab = 'stats' | 'users' | 'products' | 'orders' | 'categories' | 'regions';

export default function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('stats');
  const [users, setUsers] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newRegName, setNewRegName] = useState('');
  const [newRegCode, setNewRegCode] = useState('');

  async function fetchData() {
    const [{ data: u }, { data: p }, { data: o }, { data: c }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('nom'),
      supabase.from('regions').select('*').order('name'),
    ]);
    setUsers((u ?? []) as Profile[]);
    setProducts((p ?? []) as Product[]);
    setOrders((o ?? []) as Order[]);
    setCategories((c ?? []) as Category[]);
    setRegions((r ?? []) as Region[]);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const updateRole = async (userId: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('user_id', userId);
    fetchData();
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    await supabase.from('profiles').update({ is_active: !isActive }).eq('user_id', userId);
    fetchData();
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('categories').insert({ nom: newCatName, description: newCatDesc });
    setNewCatName(''); setNewCatDesc(''); setShowCatModal(false);
    fetchData();
  };

  const addRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('regions').insert({ name: newRegName, code: newRegCode });
    setNewRegName(''); setNewRegCode(''); setShowRegModal(false);
    fetchData();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    await supabase.from('categories').delete().eq('id', id);
    fetchData();
  };

  const deleteRegion = async (id: string) => {
    if (!confirm('Supprimer cette région ?')) return;
    await supabase.from('regions').delete().eq('id', id);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'stats', label: 'Statistiques', icon: Settings },
    { key: 'users', label: 'Utilisateurs', icon: Users },
    { key: 'products', label: 'Produits', icon: Package },
    { key: 'orders', label: 'Commandes', icon: ShoppingBag },
    { key: 'categories', label: 'Catégories', icon: Tag },
    { key: 'regions', label: 'Régions', icon: MapPin },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
        <p className="text-slate-500 mt-1">Gérez la plateforme AgricultureConnect</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Stats tab */}
      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Utilisateurs</p>
                  <p className="text-2xl font-bold text-slate-900">{users.length}</p>
                </div>
                <Users className="w-8 h-8 text-accent-500" />
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Produits</p>
                  <p className="text-2xl font-bold text-slate-900">{products.length}</p>
                </div>
                <Package className="w-8 h-8 text-primary-500" />
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Commandes</p>
                  <p className="text-2xl font-bold text-slate-900">{orders.length}</p>
                </div>
                <ShoppingBag className="w-8 h-8 text-secondary-500" />
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Revenus</p>
                  <p className="text-2xl font-bold text-slate-900">{formatPrice(orders.filter(o => o.statut === 'livree').reduce((s, o) => s + Number(o.total), 0))}</p>
                </div>
                <Settings className="w-8 h-8 text-success-500" />
              </div>
            </div>
          </div>

          {/* Role distribution */}
          <div className="card">
            <h3 className="font-semibold text-slate-900 mb-4">Répartition par rôle</h3>
            <div className="space-y-2">
              {['admin', 'agriculteur', 'fournisseur', 'acheteur'].map((role) => {
                const count = users.filter(u => u.role === role).length;
                const pct = users.length > 0 ? (count / users.length) * 100 : 0;
                return (
                  <div key={role}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{getRoleLabel(role)}</span>
                      <span className="text-slate-500">{count}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-primary-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="pb-3 font-semibold text-slate-700">Nom</th>
                <th className="pb-3 font-semibold text-slate-700">Email</th>
                <th className="pb-3 font-semibold text-slate-700">Rôle</th>
                <th className="pb-3 font-semibold text-slate-700">Région</th>
                <th className="pb-3 font-semibold text-slate-700">Inscrit le</th>
                <th className="pb-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-3 font-medium text-slate-900">{u.prenom} {u.nom}</td>
                  <td className="py-3 text-slate-600">{u.email}</td>
                  <td className="py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.user_id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1"
                    >
                      <option value="admin">Admin</option>
                      <option value="agriculteur">Agriculteur</option>
                      <option value="fournisseur">Fournisseur</option>
                      <option value="acheteur">Acheteur</option>
                    </select>
                  </td>
                  <td className="py-3 text-slate-600">{u.region || '-'}</td>
                  <td className="py-3 text-slate-500">{formatDate(u.created_at)}</td>
                  <td className="py-3">
                    <button onClick={() => toggleActive(u.user_id, true)} className="text-xs text-error-600 hover:underline">
                      Suspendre
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Products tab */}
      {tab === 'products' && (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{p.nom}</p>
                  <p className="text-xs text-slate-500">{p.region} - Stock: {p.stock}</p>
                </div>
              </div>
              <p className="font-semibold text-slate-900">{formatPrice(Number(p.prix))}</p>
            </div>
          ))}
        </div>
      )}

      {/* Orders tab */}
      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{formatPrice(Number(o.total))}</p>
                <p className="text-xs text-slate-500">{formatDate(o.created_at)}</p>
              </div>
              <span className={getStatusBadgeClass(o.statut)}>{getStatusLabel(o.statut)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Categories tab */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCatModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((c) => (
              <div key={c.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{c.nom}</p>
                  {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                </div>
                <button onClick={() => deleteCategory(c.id)} className="text-error-500 hover:text-error-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regions tab */}
      {tab === 'regions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowRegModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {regions.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  {r.code && <p className="text-xs text-slate-500">{r.code}</p>}
                </div>
                <button onClick={() => deleteRegion(r.id)} className="text-error-500 hover:text-error-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Nouvelle catégorie</h2>
              <button onClick={() => setShowCatModal(false)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={addCategory} className="p-6 space-y-4">
              <div>
                <label className="label">Nom</label>
                <input required value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="input" placeholder="Ex: Légumes" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} className="input" rows={2} />
              </div>
              <button type="submit" className="btn-primary w-full">Ajouter</button>
            </form>
          </div>
        </div>
      )}

      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Nouvelle région</h2>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={addRegion} className="p-6 space-y-4">
              <div>
                <label className="label">Nom</label>
                <input required value={newRegName} onChange={(e) => setNewRegName(e.target.value)} className="input" placeholder="Ex: Dakar" />
              </div>
              <div>
                <label className="label">Code</label>
                <input value={newRegCode} onChange={(e) => setNewRegCode(e.target.value)} className="input" placeholder="Ex: DK" />
              </div>
              <button type="submit" className="btn-primary w-full">Ajouter</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
