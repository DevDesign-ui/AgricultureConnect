import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Package, X } from 'lucide-react';
import { supabase, Product, Category, Region } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../lib/utils';

export default function MyProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    nom: '',
    description: '',
    prix: '',
    stock: '',
    unite: 'kg',
    categorie_id: '',
    region: '',
    image_url: '',
  });

  async function fetchData() {
    if (!user) return;
    const [{ data: prods }, { data: cats }, { data: regs }] = await Promise.all([
      supabase.from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('nom'),
      supabase.from('regions').select('*').order('name'),
    ]);
    setProducts((prods ?? []) as Product[]);
    setCategories((cats ?? []) as Category[]);
    setRegions((regs ?? []) as Region[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, [user]);

  const openModal = (product: Product | null) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        nom: product.nom,
        description: product.description,
        prix: String(product.prix),
        stock: String(product.stock),
        unite: product.unite,
        categorie_id: product.categorie_id ?? '',
        region: product.region,
        image_url: product.images?.[0] ?? '',
      });
    } else {
      setEditingProduct(null);
      setForm({ nom: '', description: '', prix: '', stock: '', unite: 'kg', categorie_id: '', region: '', image_url: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const images = form.image_url ? [form.image_url] : [];
    const payload = {
      nom: form.nom,
      description: form.description,
      prix: Number(form.prix),
      stock: Number(form.stock),
      unite: form.unite,
      categorie_id: form.categorie_id || null,
      region: form.region,
      images,
      disponible: Number(form.stock) > 0,
    };

    if (editingProduct) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id);
    } else {
      await supabase.from('products').insert({ ...payload, user_id: user.id });
    }
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce produit ?')) return;
    await supabase.from('products').delete().eq('id', id);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes produits</h1>
          <p className="text-slate-500 mt-1">Gérez vos produits agricoles</p>
        </div>
        <button onClick={() => openModal(null)} className="btn-primary">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {products.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Vous n'avez pas encore de produits</p>
          <button onClick={() => openModal(null)} className="btn-primary mt-4">
            <Plus className="w-4 h-4" /> Ajouter un produit
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="aspect-square bg-slate-100 overflow-hidden">
                {product.images?.[0] ? (
                  <img src={product.images[0]} alt={product.nom} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-slate-300" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 truncate">{product.nom}</h3>
                <p className="text-lg font-bold text-primary-600 mt-1">{formatPrice(Number(product.prix))}<span className="text-xs font-normal text-slate-500">/{product.unite}</span></p>
                <p className="text-xs text-slate-500 mt-1">Stock: {product.stock} {product.unite}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openModal(product)} className="btn-secondary flex-1">
                    <Edit2 className="w-4 h-4" /> Modifier
                  </button>
                  <button onClick={() => handleDelete(product.id)} className="btn-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">
                {editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="label">Nom du produit</label>
                <input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="input" placeholder="Ex: Tomates fraîches" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" rows={3} placeholder="Description du produit" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Prix (FCFA)</label>
                  <input type="number" required min={0} value={form.prix} onChange={(e) => setForm({ ...form, prix: e.target.value })} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Unité</label>
                  <select value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })} className="input">
                    <option value="kg">kg</option>
                    <option value="sac">sac</option>
                    <option value="pièce">pièce</option>
                    <option value="litre">litre</option>
                    <option value="botte">botte</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Stock</label>
                <input type="number" required min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="input" placeholder="0" />
              </div>
              <div>
                <label className="label">Catégorie</label>
                <select value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value })} className="input">
                  <option value="">Sans catégorie</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Région</label>
                <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input">
                  <option value="">Sans région</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">URL de l'image</label>
                <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="input" placeholder="https://..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" className="btn-primary flex-1">{editingProduct ? 'Modifier' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
