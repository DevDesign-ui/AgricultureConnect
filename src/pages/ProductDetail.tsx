import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Package, ShoppingBag, MessageSquare, User } from 'lucide-react';
import { supabase, Product, Profile } from '../lib/supabase';
import { loadProductImages } from '../lib/productImages';
import { useAuth } from '../context/AuthContext';
import { formatPrice, createNotification } from '../lib/utils';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState('');
  const [seller, setSeller] = useState<Profile | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadError, setLoadError] = useState('');
  const [galleryError, setGalleryError] = useState('');

  useEffect(() => {
    async function fetchProduct() {
      if (!id) return;
      try {
        const { data, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (productError) throw productError;
        if (data) {
          const productData = data as Product;
          setProduct(productData);
          setSelectedImage(productData.images?.[0] ?? '');
          if (productData.user_id) {
            const { data: sellerData } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', productData.user_id)
              .maybeSingle();
            if (sellerData) setSeller(sellerData as Profile);
          }

          try {
            const images = await loadProductImages(supabase.storage, productData);
            setProduct({ ...productData, images });
            setSelectedImage(images[0] ?? '');
          } catch (galleryLoadError) {
            console.error('Impossible de charger toutes les photos du produit.', galleryLoadError);
            setGalleryError('Impossible de charger toutes les photos. Les photos déjà enregistrées restent disponibles.');
          }
        }
      } catch (productLoadError) {
        console.error('Impossible de charger le produit.', productLoadError);
        setLoadError('Une erreur est survenue lors du chargement du produit.');
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  const handleOrder = async () => {
    if (!user || !profile || !product) return;
    setError('');
    setSuccess('');

    if (product.user_id === user.id) {
      setError('Vous ne pouvez pas commander votre propre produit');
      return;
    }
    if (quantity > product.stock) {
      setError('Quantité supérieure au stock disponible');
      return;
    }

    setOrdering(true);
    try {
      const total = Number(product.prix) * quantity;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          acheteur_id: user.id,
          seller_id: product.user_id,
          statut: 'en_attente',
          total,
          adresse_livraison: profile.adresse || profile.region || '',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order item
      const { error: itemError } = await supabase.from('order_items').insert({
        commande_id: order.id,
        produit_id: product.id,
        quantite: quantity,
        prix_unitaire: Number(product.prix),
      });

      if (itemError) throw itemError;

      // Update stock
      const newStock = product.stock - quantity;
      await supabase
        .from('products')
        .update({ stock: newStock, disponible: newStock > 0 })
        .eq('id', product.id);

      // Notify seller
      await createNotification(
        product.user_id,
        'nouvelle_commande',
        'Nouvelle commande',
        `Vous avez reçu une commande pour ${quantity} ${product.unite} de ${product.nom}`,
        `/orders/${order.id}`
      );

      setSuccess('Commande créée avec succès ! Le vendeur a été notifié.');
      setTimeout(() => navigate(`/orders/${order.id}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la commande');
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="card text-center py-12">
        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p role={loadError ? 'alert' : undefined} className="text-slate-500">{loadError || 'Produit introuvable'}</p>
        <Link to="/products" className="text-primary-600 font-semibold mt-2 inline-block">
          Retour aux produits
        </Link>
      </div>
    );
  }

  const productImages = product.images ?? [];
  const activeImage = productImages.includes(selectedImage) ? selectedImage : productImages[0];

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link to="/products" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Product photo gallery */}
        <div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {activeImage ? (
              <img src={activeImage} alt={product.nom} className="w-full h-80 object-cover" />
            ) : (
              <div className="w-full h-80 flex items-center justify-center bg-slate-100">
                <Package className="w-16 h-16 text-slate-300" />
              </div>
            )}
          </div>
          {productImages.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Galerie de photos du produit">
              {productImages.slice(1).map((image, index) => (
                <button
                  key={`${image}-${index + 1}`}
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  aria-label={`Afficher la photo ${index + 2}`}
                  aria-pressed={activeImage === image}
                  className={`overflow-hidden rounded-lg border-2 ${activeImage === image ? 'border-primary-600' : 'border-transparent'}`}
                >
                  <img src={image} alt={`${product.nom} - photo ${index + 2}`} className="h-20 w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {galleryError && <p role="status" className="mt-2 text-sm text-amber-700">{galleryError}</p>}
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{product.nom}</h1>
            {product.region && (
              <p className="text-slate-500 flex items-center gap-1 mt-1">
                <MapPin className="w-4 h-4" /> {product.region}
              </p>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary-600">{formatPrice(Number(product.prix))}</span>
            <span className="text-slate-500">/ {product.unite}</span>
          </div>

          <div>
            <span className={`badge ${product.disponible && product.stock > 0 ? 'badge-green' : 'badge-red'}`}>
              {product.disponible && product.stock > 0 ? `En stock (${product.stock} ${product.unite})` : 'Rupture de stock'}
            </span>
          </div>

          {product.description && (
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Description</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Seller info */}
          {seller && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Vendeur</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{seller.prenom} {seller.nom}</p>
                  <p className="text-xs text-slate-500">{seller.telephone}</p>
                </div>
                <Link
                  to="/messages"
                  state={{ receiverId: seller.user_id, receiverName: `${seller.prenom} ${seller.nom}` }}
                  className="ml-auto btn-ghost"
                >
                  <MessageSquare className="w-4 h-4" /> Contacter
                </Link>
              </div>
            </div>
          )}

          {/* Order section */}
          {user && product.user_id !== user.id && (
            <div className="p-4 rounded-lg border-2 border-primary-200 bg-primary-50">
              <h3 className="font-semibold text-slate-900 mb-3">Passer commande</h3>
              {error && <p className="text-sm text-error-600 mb-2">{error}</p>}
              {success && <p className="text-sm text-primary-600 mb-2">{success}</p>}
              <div className="flex items-center gap-3">
                <div>
                  <label className="label">Quantité ({product.unite})</label>
                  <input
                    type="number"
                    min={1}
                    max={product.stock}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="input w-24"
                  />
                </div>
                <div className="flex-1">
                  <label className="label">Total</label>
                  <p className="text-xl font-bold text-primary-600">{formatPrice(Number(product.prix) * quantity)}</p>
                </div>
              </div>
              <button
                onClick={handleOrder}
                disabled={ordering || !product.disponible || product.stock <= 0}
                className="btn-primary w-full mt-3"
              >
                <ShoppingBag className="w-4 h-4" />
                {ordering ? 'Création...' : 'Commander'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
