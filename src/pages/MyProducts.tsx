import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Package, X, ImagePlus, Star } from 'lucide-react';
import { supabase, Product, Category, Region, ProductOfferType } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../lib/utils';
import {
  AGRICULTURAL_SERVICES,
  getOfferPriceUnit,
  getProductOfferType,
  PRODUCT_OFFER_LABELS,
  RENTAL_PRICE_UNITS,
  SERVICE_PRICE_UNITS,
} from '../lib/product-offers';

const PRODUCT_IMAGES_BUCKET = 'agriculture-product-images';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getProductImageStoragePath(url: string, userId: string, productId: string) {
  try {
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const objectPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    return objectPath.startsWith(`${userId}/${productId}/`) ? objectPath : null;
  } catch {
    return null;
  }
}

export default function MyProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    type_offre: 'produit_agricole' as ProductOfferType,
    nom: '',
    description: '',
    prix: '',
    stock: '',
    unite: 'kg',
    categorie_id: '',
    region: '',
    marque: '',
    modele: '',
    etat_materiel: '',
    unite_tarifaire: 'jour',
    duree_minimum: '',
    caution: '',
    conditions_offre: '',
    type_service: '',
    zones_intervention: [] as string[],
  });
  const [productImages, setProductImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

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
        type_offre: getProductOfferType(product),
        nom: product.nom,
        description: product.description,
        prix: String(product.prix),
        stock: String(product.stock),
        unite: product.unite,
        categorie_id: product.categorie_id ?? '',
        region: product.region,
        marque: product.marque ?? '',
        modele: product.modele ?? '',
        etat_materiel: product.etat_materiel ?? '',
        unite_tarifaire: product.unite_tarifaire ?? 'jour',
        duree_minimum: product.duree_minimum == null ? '' : String(product.duree_minimum),
        caution: product.caution == null ? '' : String(product.caution),
        conditions_offre: product.conditions_offre ?? '',
        type_service: product.type_service ?? '',
        zones_intervention: product.zones_intervention ?? [],
      });
      setProductImages(product.images ?? []);
    } else {
      setEditingProduct(null);
      setForm({
        type_offre: 'produit_agricole',
        nom: '',
        description: '',
        prix: '',
        stock: '',
        unite: 'kg',
        categorie_id: '',
        region: '',
        marque: '',
        modele: '',
        etat_materiel: '',
        unite_tarifaire: 'jour',
        duree_minimum: '',
        caution: '',
        conditions_offre: '',
        type_service: '',
        zones_intervention: [],
      });
      setProductImages([]);
    }
    setImageFiles([]);
    setImageUrl('');
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setFormError('');
    if (form.type_offre === 'service_agricole' && form.zones_intervention.length === 0) {
      setFormError('Sélectionnez au moins une zone d’intervention pour cette prestation.');
      return;
    }
    setSaving(true);
    const productId = editingProduct?.id ?? crypto.randomUUID();
    const uploadedPaths: string[] = [];
    let images = [...productImages];

    try {
      for (const file of imageFiles) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
          throw new Error(`Format non pris en charge pour « ${file.name} ». Utilisez JPG, PNG, WebP ou GIF.`);
        }
        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error(`« ${file.name} » dépasse la limite de 10 Mo.`);
        }

        const extension = file.name.split('.').pop()?.toLowerCase() || 'img';
        const objectPath = `${user.id}/${productId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .upload(objectPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        uploadedPaths.push(objectPath);
        const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(objectPath);
        images.push(data.publicUrl);
      }
    } catch (error) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(uploadedPaths);
        if (cleanupError) {
          console.error('Impossible de nettoyer les photos téléversées après une erreur.', cleanupError);
        }
      }
      setFormError(error instanceof Error ? error.message : 'Erreur lors du téléversement des photos.');
      setSaving(false);
      return;
    }

    const isRental = form.type_offre === 'materiel_location';
    const isService = form.type_offre === 'service_agricole';
    const isEquipment = isRental || form.type_offre === 'materiel_vente';
    const isPurchasable = form.type_offre === 'produit_agricole' || form.type_offre === 'materiel_vente';
    const stock = isPurchasable ? Number(form.stock) : 0;
    const payload = {
      nom: form.nom,
      description: form.description,
      prix: Number(form.prix),
      stock,
      unite: isPurchasable ? form.unite : 'offre',
      categorie_id: form.categorie_id || null,
      region: form.region,
      images,
      disponible: isPurchasable ? stock > 0 : true,
      type_offre: form.type_offre,
      marque: isEquipment ? form.marque.trim() || null : null,
      modele: isEquipment ? form.modele.trim() || null : null,
      etat_materiel: isEquipment ? form.etat_materiel || null : null,
      unite_tarifaire: isRental || isService ? form.unite_tarifaire : null,
      duree_minimum: isRental && form.duree_minimum ? Number(form.duree_minimum) : null,
      caution: isRental && form.caution ? Number(form.caution) : null,
      conditions_offre: isRental || isService ? form.conditions_offre.trim() : null,
      type_service: isService ? form.type_service : null,
      zones_intervention: isService ? form.zones_intervention : [],
    };

    try {
      if (editingProduct) {
        const { data, error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
          .eq('user_id', user.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Le produit n’a pas pu être mis à jour.');
      } else {
        const { error } = await supabase.from('products').insert({ ...payload, id: productId, user_id: user.id });
        if (error) throw error;
      }

      if (editingProduct) {
        const removedPaths = (editingProduct.images ?? [])
          .filter((url) => !images.includes(url))
          .map((url) => getProductImageStoragePath(url, user.id, editingProduct.id))
          .filter((path): path is string => path !== null);
        if (removedPaths.length > 0) {
          const { error: removalError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(removedPaths);
          if (removalError) {
            setNotice('Produit enregistré, mais certaines anciennes photos n’ont pas pu être supprimées du stockage.');
          }
        }
      }

      setShowModal(false);
      await fetchData();
    } catch (error) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(uploadedPaths);
        if (cleanupError) {
          console.error('Impossible de nettoyer les nouvelles photos après une erreur d’enregistrement.', cleanupError);
        }
      }
      setFormError(error instanceof Error ? error.message : 'Erreur lors de l’enregistrement du produit.');
    } finally {
      setSaving(false);
    }
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
          <h1 className="text-2xl font-bold text-slate-900">Mes offres</h1>
          <p className="text-slate-500 mt-1">Gérez vos produits, matériels et services agricoles</p>
        </div>
        <button onClick={() => openModal(null)} className="btn-primary">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {notice && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
          <button onClick={() => setNotice('')} className="ml-3 font-semibold underline">Fermer</button>
        </div>
      )}

      {products.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Vous n’avez pas encore publié d’offre</p>
          <button onClick={() => openModal(null)} className="btn-primary mt-4">
            <Plus className="w-4 h-4" /> Ajouter une offre
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
                <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                  {PRODUCT_OFFER_LABELS[getProductOfferType(product)]}
                </span>
                <h3 className="font-semibold text-slate-900 truncate">{product.nom}</h3>
                <p className="text-lg font-bold text-primary-600 mt-1">
                  {formatPrice(Number(product.prix))}
                  <span className="text-xs font-normal text-slate-500">/{getOfferPriceUnit(product)}</span>
                </p>
                {getProductOfferType(product) === 'produit_agricole' || getProductOfferType(product) === 'materiel_vente'
                  ? <p className="text-xs text-slate-500 mt-1">Stock: {product.stock} {product.unite}</p>
                  : <p className="text-xs text-amber-700 mt-1">Réservation non activée</p>}
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
                {editingProduct ? 'Modifier l’offre' : 'Ajouter une offre'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="label" htmlFor="offer-type">Type d’offre</label>
                <select
                  id="offer-type"
                  value={form.type_offre}
                  onChange={(e) => setForm({ ...form, type_offre: e.target.value as ProductOfferType })}
                  className="input"
                  disabled={Boolean(editingProduct)}
                >
                  {Object.entries(PRODUCT_OFFER_LABELS).map(([type, label]) => (
                    <option key={type} value={type}>{label}</option>
                  ))}
                </select>
                {editingProduct && (
                  <p className="mt-1 text-xs text-slate-500">
                    Le type d’une offre publiée ne peut pas être modifié. Créez une nouvelle offre pour un autre type d’activité.
                  </p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="offer-name">
                  {form.type_offre === 'service_agricole' ? 'Nom de la prestation' : 'Nom de l’offre'}
                </label>
                <input id="offer-name" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="input" placeholder={form.type_offre === 'produit_agricole' ? 'Ex: Tomates fraîches' : 'Nom de l’offre'} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" rows={3} placeholder="Description du produit" />
              </div>
              {form.type_offre === 'materiel_vente' || form.type_offre === 'materiel_location' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label" htmlFor="offer-brand">Marque</label>
                      <input id="offer-brand" value={form.marque} onChange={(e) => setForm({ ...form, marque: e.target.value })} className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="offer-model">Modèle</label>
                      <input id="offer-model" value={form.modele} onChange={(e) => setForm({ ...form, modele: e.target.value })} className="input" />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="equipment-condition">État du matériel</label>
                    <select id="equipment-condition" value={form.etat_materiel} onChange={(e) => setForm({ ...form, etat_materiel: e.target.value })} className="input">
                      <option value="">Non précisé</option>
                      <option value="neuf">Neuf</option>
                      <option value="bon_etat">Bon état</option>
                      <option value="usage">Occasion</option>
                    </select>
                  </div>
                </>
              ) : null}
              {form.type_offre === 'service_agricole' && (
                <div>
                  <label className="label" htmlFor="service-type">Type de prestation</label>
                  <select
                    id="service-type"
                    required
                    value={form.type_service}
                    onChange={(e) => setForm({ ...form, type_service: e.target.value })}
                    className="input"
                  >
                    <option value="">Sélectionnez une prestation</option>
                    {AGRICULTURAL_SERVICES.map((service) => (
                      <option key={service.value} value={service.value}>{service.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">
                    {form.type_offre === 'produit_agricole' || form.type_offre === 'materiel_vente' ? 'Prix (FCFA)' : 'Tarif (FCFA)'}
                  </label>
                  <input type="number" required min={0} value={form.prix} onChange={(e) => setForm({ ...form, prix: e.target.value })} className="input" placeholder="0" />
                </div>
                {(form.type_offre === 'produit_agricole' || form.type_offre === 'materiel_vente') && <div>
                  <label className="label">Unité</label>
                  <select value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })} className="input">
                    <option value="kg">kg</option>
                    <option value="sac">sac</option>
                    <option value="pièce">pièce</option>
                    <option value="litre">litre</option>
                    <option value="botte">botte</option>
                    {form.type_offre === 'materiel_vente' && <option value="unité">unité</option>}
                  </select>
                </div>}
              </div>
              {(form.type_offre === 'produit_agricole' || form.type_offre === 'materiel_vente') && <div>
                <label className="label">Stock</label>
                <input type="number" required min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="input" placeholder="0" />
              </div>}
              {(form.type_offre === 'materiel_location' || form.type_offre === 'service_agricole') && (
                <>
                  <div>
                    <label className="label" htmlFor="offer-price-unit">Unité de tarification</label>
                    <select
                      id="offer-price-unit"
                      required
                      value={form.unite_tarifaire}
                      onChange={(e) => setForm({ ...form, unite_tarifaire: e.target.value })}
                      className="input"
                    >
                      {(form.type_offre === 'materiel_location' ? RENTAL_PRICE_UNITS : SERVICE_PRICE_UNITS).map((unit) => (
                        <option key={unit} value={unit}>Par {unit}</option>
                      ))}
                    </select>
                  </div>
                  {form.type_offre === 'materiel_location' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="label" htmlFor="minimum-duration">Durée minimale (unités)</label>
                        <input id="minimum-duration" type="number" min="0.5" step="0.5" value={form.duree_minimum} onChange={(e) => setForm({ ...form, duree_minimum: e.target.value })} className="input" placeholder="Ex. 1" />
                      </div>
                      <div>
                        <label className="label" htmlFor="rental-deposit">Caution (FCFA, facultative)</label>
                        <input id="rental-deposit" type="number" min={0} value={form.caution} onChange={(e) => setForm({ ...form, caution: e.target.value })} className="input" placeholder="0" />
                      </div>
                    </div>
                  )}
                  {form.type_offre === 'service_agricole' && (
                    <fieldset>
                      <legend className="label">Zones d’intervention</legend>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {regions.filter((region) => region.name?.trim()).map((region) => (
                          <label key={region.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={form.zones_intervention.includes(region.name)}
                              onChange={(e) => setForm({
                                ...form,
                                zones_intervention: e.target.checked
                                  ? [...form.zones_intervention, region.name]
                                  : form.zones_intervention.filter((name) => name !== region.name),
                              })}
                              className="h-4 w-4 rounded text-primary-600"
                            />
                            {region.name}
                          </label>
                        ))}
                      </div>
                      {form.zones_intervention.length === 0 && (
                        <p className="mt-1 text-xs text-error-600">Sélectionnez au moins une région d’intervention.</p>
                      )}
                    </fieldset>
                  )}
                  <div>
                    <label className="label" htmlFor="offer-conditions">Conditions de l’offre</label>
                    <textarea
                      id="offer-conditions"
                      required
                      value={form.conditions_offre}
                      onChange={(e) => setForm({ ...form, conditions_offre: e.target.value })}
                      className="input"
                      rows={3}
                      placeholder="Précisez les conditions, limites ou modalités du tarif."
                    />
                  </div>
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    Les réservations ne sont pas encore activées. Cette fiche présente uniquement le tarif et les conditions.
                  </p>
                </>
              )}
              <div>
                <label className="label">Catégorie</label>
                <select required={!editingProduct} value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value })} className="input">
                  <option value="" disabled={!editingProduct}>
                    {categories.length > 0 ? 'Sélectionnez une catégorie' : 'Aucune catégorie disponible'}
                  </option>
                  {editingProduct && <option value="">Sans catégorie</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Région</label>
                <select required={!editingProduct && form.type_offre !== 'service_agricole'} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input">
                  <option value="" disabled>
                    {regions.length > 0 ? 'Sélectionnez une région' : 'Aucune région disponible'}
                  </option>
                  {editingProduct && <option value="">Sans région</option>}
                  {regions
                    .filter((r) => r.name?.trim() !== '')
                    .map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label">Photos du produit</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {productImages.map((url, index) => (
                    <div key={`${url}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                      <img src={url} alt={`${form.nom || 'Produit'} - photo ${index + 1}`} className="h-28 w-full object-cover" />
                      {index === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-2 py-1 text-xs font-semibold text-primary-700">
                          Principale
                        </span>
                      )}
                      <div className="absolute right-1.5 top-1.5 flex gap-1">
                        {index !== 0 && (
                          <button
                            type="button"
                            onClick={() => setProductImages((current) => [url, ...current.filter((_, itemIndex) => itemIndex !== index)])}
                            aria-label="Choisir comme photo principale"
                            title="Choisir comme photo principale"
                            className="rounded-full bg-white/90 p-1.5 text-amber-600 hover:bg-white"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setProductImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          aria-label="Supprimer cette photo"
                          title="Supprimer cette photo"
                          className="rounded-full bg-white/90 p-1.5 text-error-600 hover:bg-white"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {productImages.length === 0 && (
                  <p className="mb-3 text-sm text-slate-500">Aucune photo ajoutée. La première photo sera principale.</p>
                )}
                <label className="btn-secondary w-full cursor-pointer">
                  <ImagePlus className="h-4 w-4" /> Ajouter une ou plusieurs photos
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const selectedFiles = Array.from(event.target.files ?? []);
                      setImageFiles((current) => [...current, ...selectedFiles]);
                      event.target.value = '';
                    }}
                  />
                </label>
                {imageFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {imageFiles.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center justify-between text-sm text-slate-600">
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setImageFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                          aria-label={`Retirer ${file.name}`}
                          className="ml-2 text-error-600 hover:text-error-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    className="input"
                    placeholder="Ou ajouter une URL d’image https://..."
                    aria-label="URL d'une image"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      try {
                        const url = new URL(imageUrl.trim());
                        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
                        setProductImages((current) => [...current, url.toString()]);
                        setImageUrl('');
                        setFormError('');
                      } catch {
                        setFormError('Saisissez une URL d’image valide commençant par http:// ou https://.');
                      }
                    }}
                    disabled={!imageUrl.trim()}
                  >
                    Ajouter
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP ou GIF, 10 Mo maximum par photo.</p>
              </div>
              {formError && <p role="alert" className="text-sm text-error-600">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} disabled={saving} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Enregistrement...' : editingProduct ? 'Modifier' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
