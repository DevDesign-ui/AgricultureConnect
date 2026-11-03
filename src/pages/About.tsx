import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  Handshake,
  Lightbulb,
  Menu,
  Package,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Tractor,
  Truck,
  Wheat,
  Wrench,
  X,
} from 'lucide-react';
import './About.css';

const fallbackImage =
  'https://images.pexels.com/photos/30483244/pexels-photo-30483244/free-photo-of-women-harvesting-crops-in-a-rural-setting.jpeg?auto=compress&cs=tinysrgb&w=1200';

const activities = [
  {
    title: 'Produits agricoles',
    description: 'Céréales, fruits, légumes, semences et autres produits frais.',
    action: 'Voir les produits',
    href: '/products?type=produit_agricole',
    image:
      'https://images.pexels.com/photos/2252584/pexels-photo-2252584.jpeg?auto=compress&cs=tinysrgb&w=900',
    alt: 'Des légumes frais colorés proposés sur un marché.',
    icon: ShoppingBasket,
    tone: 'gold',
  },
  {
    title: 'Vente de matériels',
    description: 'Tracteurs, moissonneuses, motoculteurs et équipements.',
    action: 'Voir le matériel',
    href: '/products?type=materiel_vente',
    image:
     'https://sc04.alicdn.com/kf/H3c3089ccefdb46c6b3f820461e5fdd25L.jpg',
    alt: 'Un tracteur équipé d’un semoir pour préparer les cultures.',
    icon: Tractor,
    tone: 'blue',
  },
  {
    title: 'Location de matériels',
    description: 'Des équipements proposés à l’heure, à la journée ou à la semaine.',
    action: 'Découvrir la location',
    href: '/products?type=materiel_location',
    image:
      'https://images.pexels.com/photos/1595104/pexels-photo-1595104.jpeg?auto=compress&cs=tinysrgb&w=900',
    alt: 'Machine agricole utilisée dans un champ.',
    icon: Wrench,
    tone: 'green',
  },
  {
    title: 'Services agricoles',
    description: 'Labour, semis, récolte, irrigation, pulvérisation et transport.',
    action: 'Découvrir les services',
    href: '/products?type=service_agricole',
    image:
      'https://images.pexels.com/photos/30483244/pexels-photo-30483244/free-photo-of-women-harvesting-crops-in-a-rural-setting.jpeg?auto=compress&cs=tinysrgb&w=900',
    alt: 'Des agricultrices travaillent dans un champ cultivé.',
    icon: Truck,
    tone: 'green',
  },
];

const values = [
  { title: 'Accessibilité', text: 'Une plateforme pensée pour tous les acteurs agricoles.', icon: Sprout },
  { title: 'Confiance', text: 'Des offres claires et des échanges plus transparents.', icon: ShieldCheck },
  { title: 'Innovation', text: 'Le numérique au service des besoins du terrain.', icon: Lightbulb },
  { title: 'Valorisation', text: 'Plus de visibilité pour les productions locales.', icon: Wheat },
  { title: 'Collaboration', text: 'Des liens renforcés entre les métiers agricoles.', icon: Handshake },
];

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === 'true') {
    image.hidden = true;
    return;
  }
  if (image.classList.contains('home-hero-image')) {
    image.parentElement?.querySelector('.home-hero-photo-credit')?.setAttribute('hidden', '');
  }
  image.dataset.fallbackApplied = 'true';
  image.src = fallbackImage;
}

export default function About() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="home-page" id="top">
      <a className="home-skip-link" href="#main-content">Aller au contenu principal</a>

      <header className="home-header">
        <div className="home-header-inner">
          <Link className="home-brand" to="/" aria-label="AgricultureConnect, accueil" onClick={closeMenu}>
            <span className="home-brand-mark" aria-hidden="true"><Sprout /></span>
            <span>Agriculture<span className="home-brand-accent">Connect</span></span>
          </Link>

          <button
            type="button"
            className="home-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="home-navigation"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>

          <nav
            className={`home-navigation${menuOpen ? ' is-open' : ''}`}
            id="home-navigation"
            aria-label="Navigation principale"
          >
            <Link to="/" aria-current="page" onClick={closeMenu}></Link>
             {/*
            <Link to="/a-propos" onClick={closeMenu}>À propos</Link> 
           <Link to="/products?type=produit_agricole" onClick={closeMenu}>Produits</Link>
            <Link to="/products?type=materiel_vente" onClick={closeMenu}>Machines</Link>
            <Link to="/products?type=service_agricole" onClick={closeMenu}>Services</Link>
            */}
            <Link className="home-login-link" to="/dashboard" onClick={closeMenu}>Retour dans la plateforme</Link>
          </nav>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <img
          className="home-hero-image"
  src="https://www.entraid.com/wp-content/uploads/2023/07/GP-Achat_Photo-tracteur-6R.jpg"
  alt="Paysage agricole avec des champs cultivés."
  onError={handleImageError}
        />
        <div className="home-hero-shade" aria-hidden="true" />
       
        <div className="home-hero-content" id="main-content">
          <p className="home-kicker home-kicker-light">Des liens plus forts, une agriculture prospère</p>
          <h1 id="home-title">Le numérique au service de <span>l’agriculture</span></h1>
          <p className="home-hero-description">
            AgricultureConnect rassemble les produits, les machines et les services agricoles pour connecter producteurs, fournisseurs et acheteurs.
          </p>
          <div className="home-hero-actions">
            <Link className="home-button home-button-gold" to="/products">
              Découvrir la plateforme <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="home-button home-button-outline" to="/register">
              Rejoindre AgricultureConnect
            </Link>
          </div>
          <p className="home-hero-caption">Producteurs <span /> Fournisseurs <span /> Acheteurs</p>
        </div>
        <a className="home-scroll-cue" href="#activites" aria-label="Découvrir les activités">
          <ArrowDown aria-hidden="true" />
        </a>
        <div className="home-hero-wave" aria-hidden="true"><span /><span /></div>
      </section>

      <section className="home-section home-activities" id="activites" aria-labelledby="activities-title">
        <div className="home-section-heading">
          <p className="home-kicker">Notre plateforme</p>
          <h2 id="activities-title">Une solution complète pour le monde agricole</h2>
          <p>Quatre activités complémentaires pour répondre aux besoins de la filière.</p>
        </div>
        <div className="home-activity-grid">
          {activities.map((activity) => {
            const Icon = activity.icon;
            return (
              <article className="home-activity-card" key={activity.title}>
                <Link
                  className="home-activity-image"
                  to={activity.href}
                  aria-label={`${activity.action} : ${activity.title}`}
                >
                  <img src={activity.image} alt={activity.alt} loading="lazy" decoding="async" onError={handleImageError} />
                </Link>
                <span className={`home-activity-icon tone-${activity.tone}`} aria-hidden="true"><Icon /></span>
                <div className="home-activity-copy">
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                  <Link className="home-text-link" to={activity.href}>
                    {activity.action} <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        <p className="home-booking-note">
          Les offres de location et de services sont consultables dans le catalogue; la réservation en ligne n’est pas encore activée.
        </p>
      </section>

      <section className="home-section home-about" aria-labelledby="home-about-title">
        <div className="home-about-copy">
          <p className="home-kicker">Qui sommes-nous ?</p>
          <h2 id="home-about-title">Une plateforme qui rapproche les acteurs agricoles.</h2>
          <p>
            AgricultureConnect facilite la mise en relation entre producteurs, fournisseurs et acheteurs. Notre ambition : simplifier les échanges et contribuer au développement d’une agriculture durable en Afrique.
          </p>
          <Link className="home-button home-button-green" to="/a-propos">
            En savoir plus <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="home-about-visual">
          <img
            src="https://images.pexels.com/photos/30255157/pexels-photo-30255157/free-photo-of-aerial-view-of-patchwork-farms-in-mau-narok-kenya.jpeg?auto=compress&cs=tinysrgb&w=1200"
            alt="Parcelles agricoles cultivées dans un paysage rural africain."
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
          <span className="home-photo-caption"><Sprout aria-hidden="true" /> Du champ au marché</span>
        </div>
      </section>

      <section className="home-why" aria-labelledby="why-title">
        <div className="home-why-inner">
          <div className="home-why-copy">
            <p className="home-kicker">Pourquoi AgricultureConnect ?</p>
            <h2 id="why-title">Faire grandir les opportunités agricoles.</h2>
            <ul>
              <li><span><Package aria-hidden="true" /></span>Accédez aux produits, équipements et services agricoles.</li>
              <li><span><ShieldCheck aria-hidden="true" /></span>Découvrez des offres détaillées et des informations utiles.</li>
              <li><span><Handshake aria-hidden="true" /></span>Renforcez les échanges entre les acteurs du secteur.</li>
            </ul>
          </div>
          <div className="home-why-photo">
            <img
              src="https://images.pexels.com/photos/30483244/pexels-photo-30483244/free-photo-of-women-harvesting-crops-in-a-rural-setting.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Des travailleuses agricoles récoltent des cultures dans un champ."
              loading="lazy"
              decoding="async"
              onError={handleImageError}
            />
            <span>La force du travail collectif</span>
          </div>
        </div>
      </section>

      <section className="home-section home-values" aria-labelledby="values-title">
        <div className="home-section-heading">
          <p className="home-kicker">Nos valeurs</p>
          <h2 id="values-title">Des principes qui nous guident</h2>
        </div>
        <div className="home-value-grid">
          {values.map(({ title, text, icon: Icon }) => (
            <article className="home-value" key={title}>
              <span className="home-value-icon"><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-cta" aria-labelledby="home-cta-title">
        <div className="home-cta-image" aria-hidden="true">
          <img
            src="https://images.pexels.com/photos/30255157/pexels-photo-30255157/free-photo-of-aerial-view-of-patchwork-farms-in-mau-narok-kenya.jpeg?auto=compress&cs=tinysrgb&w=1400"
            alt=""
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
        </div>
        <div className="home-cta-content">
          <span className="home-cta-icon"><Handshake aria-hidden="true" /></span>
          <div>
            <h2 id="home-cta-title">Ensemble, bâtissons une agriculture connectée et prospère !</h2>
            <p>Rejoignez AgricultureConnect pour vendre, acheter, louer et découvrir des services agricoles.</p>
          </div>
          <Link className="home-button home-button-gold" to="/register">
            Rejoindre maintenant <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand">
            <Link className="home-brand" to="/" aria-label="AgricultureConnect, accueil">
              <span className="home-brand-mark" aria-hidden="true"><Sprout /></span>
              <span>Agriculture<span className="home-brand-accent">Connect</span></span>
            </Link>
            <p>Le numérique au service des échanges agricoles.</p>
          </div>
          <nav className="home-footer-links" aria-label="Liens de pied de page">
            <Link to="/a-propos">À propos</Link>
            <Link to="/products?type=produit_agricole">Produits</Link>
            <Link to="/products?type=materiel_vente">Machines</Link>
            <Link to="/products?type=service_agricole">Services</Link>
          </nav>
          <a className="home-back-top" href="#top">Retour en haut <ArrowDown aria-hidden="true" /></a>
        </div>
        <div className="home-footer-bottom">© {new Date().getFullYear()} AgricultureConnect. Tous droits réservés.</div>
      </footer>
    </main>
  );
}
