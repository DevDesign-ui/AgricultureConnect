import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Package, MapPin, Filter, X } from 'lucide-react';
import { supabase, Product, Category, Region } from '../lib/supabase';
import { formatPrice } from '../lib/utils';
import {
  filterProductsByOfferType,
  getOfferPriceUnit,
  getProductOfferType,
  isOfferAvailable,
  PRODUCT_OFFER_TYPES,
  PRODUCT_OFFER_LABELS,
  type OfferCatalogFilter,
} from '../lib/product-offers';

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
  const [searchParams] = useSearchParams();
  const [offerFilter, setOfferFilter] = useState<OfferCatalogFilter>(() => {
    const requestedType = searchParams.get('type');
    return requestedType === 'tous'
      ? 'tous'
      : PRODUCT_OFFER_TYPES.find((type) => type === requestedType) ?? 'tous';
  });

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
    return filterProductsByOfferType(products, offerFilter).filter((p) => {
      if (searchName && !p.nom.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCategory && p.categorie_id !== filterCategory) return false;
      if (filterRegion && p.region !== filterRegion && !p.zones_intervention?.includes(filterRegion)) return false;
      if (filterMinPrice && Number(p.prix) < Number(filterMinPrice)) return false;
      if (filterMaxPrice && Number(p.prix) > Number(filterMaxPrice)) return false;
      if (filterAvailable && !isOfferAvailable(p)) return false;
      return true;
    });
  }, [products, offerFilter, searchName, filterCategory, filterRegion, filterMinPrice, filterMaxPrice, filterAvailable]);

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
        <h1 className="text-2xl font-bold text-slate-900">Marketplace agricole</h1>
        <p className="text-slate-500 mt-1">Produits, matériel et services agricoles au même endroit</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrer par activité">
        {([
          { key: 'tous', label: 'Tous' },
          { key: 'produit_agricole', label: PRODUCT_OFFER_LABELS.produit_agricole },
          { key: 'materiel_vente', label: PRODUCT_OFFER_LABELS.materiel_vente },
          { key: 'materiel_location', label: PRODUCT_OFFER_LABELS.materiel_location },
          { key: 'service_agricole', label: PRODUCT_OFFER_LABELS.service_agricole },
        ] as { key: OfferCatalogFilter; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            id={`catalog-tab-${tab.key}`}
            type="button"
            aria-pressed={offerFilter === tab.key}
            onClick={() => setOfferFilter(tab.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              offerFilter === tab.key
                ? 'bg-primary-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
              <span className="text-sm font-medium text-slate-700">Offres actives uniquement</span>
            </label>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-slate-500">
        {filteredProducts.length} offre{filteredProducts.length > 1 ? 's' : ''} trouvée{filteredProducts.length > 1 ? 's' : ''}
      </p>

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
                <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                  {PRODUCT_OFFER_LABELS[getProductOfferType(product)]}
                </span>
                <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                  {product.nom}
                </h3>
                {(product.marque || product.modele) && (
                  <p className="text-xs text-slate-500 mt-1">
                    {[product.marque, product.modele].filter(Boolean).join(' · ')}
                  </p>
                )}
                {product.type_service && (
                  <p className="text-xs text-slate-500 mt-1">
                    {product.type_service.charAt(0).toUpperCase() + product.type_service.slice(1)}
                  </p>
                )}
                {product.region && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {product.region}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold text-primary-600">
                    {formatPrice(Number(product.prix))}
                    <span className="text-xs font-normal text-slate-500">/{getOfferPriceUnit(product)}</span>
                  </p>
                  <span className={`badge ${isOfferAvailable(product) ? 'badge-green' : 'badge-red'}`}>
                    {isOfferAvailable(product)
                      ? getProductOfferType(product) === 'materiel_location' || getProductOfferType(product) === 'service_agricole'
                        ? 'Offre publiée'
                        : 'Disponible'
                      : 'Indisponible'}
                  </span>
                </div>
                {(getProductOfferType(product) === 'materiel_location' || getProductOfferType(product) === 'service_agricole') && (
                  <p className="mt-2 text-xs font-medium text-amber-700">Réservation non activée</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
