import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Package, MapPin, Filter, X } from 'lucide-react';
import { supabase, Product, Category, Region } from '../lib/supabase';
import { formatPrice } from '../lib/utils';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const [{ data: prods }, { data: cats }, { data: regs }] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('nom'),
        supabase.from('regions').select('*').order('name'),
      ]);
      setProducts((prods ?? []) as Product[]);
      setCategories((cats ?? []) as Category[]);
      setRegions((regs ?? []) as Region[]);
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchName && !p.nom.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCategory && p.categorie_id !== filterCategory) return false;
      if (filterRegion && p.region !== filterRegion) return false;
      if (filterMinPrice && Number(p.prix) < Number(filterMinPrice)) return false;
      if (filterMaxPrice && Number(p.prix) > Number(filterMaxPrice)) return false;
      if (filterAvailable && (!p.disponible || p.stock <= 0)) return false;
      return true;
    });
  }, [products, searchName, filterCategory, filterRegion, filterMinPrice, filterMaxPrice, filterAvailable]);

  const hasActiveFilters = filterCategory || filterRegion || filterMinPrice || filterMaxPrice || filterAvailable;

  const clearFilters = () => {
    setFilterCategory('');
    setFilterRegion('');
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterAvailable(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Produits agricoles</h1>
        <p className="text-slate-500 mt-1">Recherchez parmi tous les produits disponibles</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn ${showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Filter className="w-4 h-4" />
          Filtres
          {hasActiveFilters && (
            <span className="bg-white text-primary-600 text-xs rounded-full px-1.5 font-bold">
              {[filterCategory, filterRegion, filterMinPrice, filterMaxPrice, filterAvailable].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Filtres de recherche</h3>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-error-600 font-medium hover:underline flex items-center gap-1">
                <X className="w-4 h-4" /> Effacer
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Catégorie</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input">
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Région</label>
              <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} className="input">
                <option value="">Toutes</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Prix minimum</label>
              <input
                type="number"
                value={filterMinPrice}
                onChange={(e) => setFilterMinPrice(e.target.value)}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Prix maximum</label>
              <input
                type="number"
                value={filterMaxPrice}
                onChange={(e) => setFilterMaxPrice(e.target.value)}
                className="input"
                placeholder="∞"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterAvailable}
                onChange={(e) => setFilterAvailable(e.target.checked)}
                className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-slate-700">Disponible uniquement</span>
            </label>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-slate-500">
        {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} trouvé{filteredProducts.length > 1 ? 's' : ''}
      </p>

      {/* Products grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucun produit ne correspond à votre recherche</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-200"
            >
              <div className="aspect-square bg-slate-100 overflow-hidden">
                {product.images?.[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.nom}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-slate-300" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                  {product.nom}
                </h3>
                {product.region && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {product.region}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold text-primary-600">
                    {formatPrice(Number(product.prix))}
                    <span className="text-xs font-normal text-slate-500">/{product.unite}</span>
                  </p>
                  <span className={`badge ${product.disponible && product.stock > 0 ? 'badge-green' : 'badge-red'}`}>
                    {product.disponible && product.stock > 0 ? 'Disponible' : 'Rupture'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
