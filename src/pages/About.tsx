import { Link } from 'react-router-dom';
import type { SyntheticEvent } from 'react';
import {
  Accessibility,
  ArrowRight,
  Handshake,
  Lightbulb,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Store,
  Wheat,
} from 'lucide-react';
import './About.css';

function hideUnavailableImage(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  image.hidden = true;
  image.parentElement?.classList.add('about-image-fallback');
}

const actors = [
  {
    number: '01',
    title: 'Producteurs',
    description:
      'Présentez vos récoltes, valorisez vos produits et développez de nouvelles possibilités de mise en relation avec des acheteurs.',
    icon: Sprout,
    tone: 'producer',
    image: 'https://images.pexels.com/photos/35246303/pexels-photo-35246303.jpeg?auto=compress&cs=tinysrgb&w=900',
    imageAlt: 'Un agriculteur travaille dans une rizière verdoyante.',
  },
  {
    number: '02',
    title: 'Vendeurs',
    description:
      'Mettez votre catalogue en valeur et facilitez la découverte de vos produits par les clients.',
    icon: Store,
    tone: 'seller',
    image: 'https://images.pexels.com/photos/38524672/pexels-photo-38524672.jpeg?auto=compress&cs=tinysrgb&w=900',
    imageAlt: 'Des légumes frais disposés sur un étal de marché à Kawo, au Nigeria.',
  },
  {
    number: '03',
    title: 'Acheteurs',
    description:
      'Découvrez les produits agricoles disponibles et identifiez plus facilement les offres adaptées à vos besoins.',
    icon: ShoppingBasket,
    tone: 'buyer',
    image: 'https://images.pexels.com/photos/27991265/pexels-photo-27991265.jpeg?auto=compress&cs=tinysrgb&w=900',
    imageAlt: 'Des commerçants et des clients se retrouvent sur un marché animé à Ibadan, au Nigeria.',
  },
];

const values = [
  {
    title: 'Accessibilité',
    description: 'Une expérience simple et intuitive pour chacun.',
    icon: Accessibility,
  },
  {
    title: 'Confiance',
    description: 'Des échanges transparents et responsables.',
    icon: ShieldCheck,
  },
  {
    title: 'Innovation',
    description: 'La technologie mise au service du secteur agricole.',
    icon: Lightbulb,
  },
  {
    title: 'Valorisation',
    description: 'Plus de visibilité pour les productions agricoles.',
    icon: Wheat,
  },
  {
    title: 'Collaboration',
    description: 'Des acteurs rapprochés et de nouvelles opportunités.',
    icon: Handshake,
  },
];

export default function About() {
  return (
    <main className="about-page" id="debut">
      <a className="about-skip-link" href="#contenu">
        Aller au contenu principal
      </a>

      <header className="about-header">
        <Link className="about-brand" to="/a-propos" aria-label="AgricultureConnect, À propos">
          <span className="about-brand-mark" aria-hidden="true">
            <Sprout />
          </span>
          <span>Agriculture<span>Connect</span></span>
        </Link>
        <nav className="about-nav" aria-label="Navigation de la page">
          <a href="#notre-mission">Notre mission</a>
          <a href="#nos-valeurs">Nos valeurs</a>
          <Link className="about-nav-cta" to="/login">Se connecter</Link>
        </nav>
      </header>

      <section className="about-hero" aria-labelledby="about-title">
        <img
          className="about-hero-image"
          src="https://images.pexels.com/photos/34705724/pexels-photo-34705724.jpeg?auto=compress&cs=tinysrgb&w=2000"
          alt="Une agricultrice nigériane souriante présente sa récolte de tomates dans un champ."
          onError={hideUnavailableImage}
        />
        <div className="about-hero-shade" aria-hidden="true" />
        <div className="about-hero-content" id="contenu">
          <p className="about-eyebrow about-eyebrow-light">Des liens plus forts, des récoltes valorisées</p>
          <h1 id="about-title">Le numérique au service de l’agriculture</h1>
          <p className="about-hero-intro">
            Connecter les producteurs, valoriser les récoltes et faciliter les échanges pour construire une agriculture pleine d’opportunités.
          </p>
          <div className="about-actions">
            <Link className="about-button about-button-light" to="/products">
              Découvrir les produits <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="about-button about-button-outline" to="/register">
              Rejoindre AgricultureConnect
            </Link>
          </div>
          <p className="about-hero-caption">Producteurs <span /> Vendeurs <span /> Acheteurs</p>
        </div>
      </section>

      <section className="about-intro about-section" aria-labelledby="about-who-title">
        <div className="about-section-label">
          <span>01</span>
          <p className="about-eyebrow">Qui sommes-nous ?</p>
        </div>
        <div className="about-intro-copy">
          <h2 id="about-who-title">Une plateforme qui rapproche les acteurs agricoles.</h2>
          <p>
            AgricultureConnect est une plateforme numérique qui facilite la mise en relation entre producteurs agricoles, vendeurs et acheteurs.
          </p>
          <p>
            Notre ambition : simplifier la commercialisation des produits agricoles, favoriser les échanges et contribuer à la transformation numérique du secteur.
          </p>
        </div>
        <aside className="about-intro-note">
          <div className="about-intro-photo">
            <img
              src="https://images.pexels.com/photos/35246303/pexels-photo-35246303.jpeg?auto=compress&cs=tinysrgb&w=900"
              alt="Un agriculteur travaille dans une rizière verdoyante."
              loading="lazy"
              onError={hideUnavailableImage}
            />
            <span>Du champ au marché</span>
          </div>
          <div className="about-intro-note-copy">
            <Sprout aria-hidden="true" />
            <p>Des productions locales mieux visibles. Des échanges plus simples. Des opportunités à portée de main.</p>
          </div>
        </aside>
      </section>

      <section className="about-why" aria-labelledby="about-why-title">
        <div className="about-why-inner">
          <div className="about-why-heading">
            <p className="about-eyebrow">Pourquoi AgricultureConnect ?</p>
            <h2 id="about-why-title">Faire tomber les barrières entre l’offre et la demande.</h2>
          </div>
          <div className="about-why-copy">
            <p>
              Certains produits agricoles manquent de visibilité. Trouver des acheteurs reste difficile et l’accès à certaines opportunités commerciales est limité.
            </p>
            <p>
              AgricultureConnect est un outil numérique pensé pour faciliter les échanges entre les acteurs agricoles et rendre les offres plus faciles à découvrir.
            </p>
          </div>
          <div className="about-challenges" aria-label="Défis auxquels répond la plateforme">
            <div><span>01</span><p>Visibilité des produits</p></div>
            <div><span>02</span><p>Accès aux acheteurs</p></div>
            <div><span>03</span><p>Opportunités commerciales</p></div>
          </div>
        </div>
      </section>

      <section className="about-actors about-section" aria-labelledby="about-actors-title">
        <div className="about-heading-centered">
          <p className="about-eyebrow">Une plateforme pour chaque acteur</p>
          <h2 id="about-actors-title">Chacun a sa place dans la chaîne.</h2>
          <p className="about-heading-intro">
            Des récoltes aux étals, chaque acteur contribue à faire circuler les produits agricoles.
          </p>
        </div>
        <div className="about-actor-grid">
          {actors.map(({ number, title, description, icon: Icon, tone, image, imageAlt }) => (
            <article className={`about-actor-card about-actor-${tone}`} key={title}>
              <div className="about-actor-image-wrap">
                <img src={image} alt={imageAlt} loading="lazy" onError={hideUnavailableImage} />
                <span className="about-actor-number">{number}</span>
              </div>
              <div className="about-actor-card-content">
                <div className="about-actor-title-row">
                  <h3>{title}</h3>
                  <span className="about-actor-icon"><Icon aria-hidden="true" /></span>
                </div>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-purpose" id="notre-mission" aria-label="Notre mission et notre vision">
        <article className="about-purpose-block about-mission">
          <div className="about-purpose-kicker">
            <p className="about-eyebrow">Notre mission</p>
            <Sprout aria-hidden="true" />
          </div>
          <h2>Faire circuler les opportunités.</h2>
          <p>
            Faciliter les échanges entre les acteurs agricoles en mettant le numérique au service de la visibilité des produits, de la commercialisation et de l’accès aux opportunités du marché.
          </p>
        </article>
        <article className="about-purpose-block about-vision">
          <div className="about-purpose-kicker">
            <p className="about-eyebrow">Notre vision</p>
            <Wheat aria-hidden="true" />
          </div>
          <h2>Une agriculture connectée et compétitive.</h2>
          <p>
            Contribuer à construire une agriculture plus connectée, accessible et compétitive, qui valorise les productions locales et favorise les relations entre producteurs, vendeurs et acheteurs.
          </p>
        </article>
      </section>

      <section className="about-values about-section" id="nos-valeurs" aria-labelledby="about-values-title">
        <div className="about-values-heading">
          <div>
            <p className="about-eyebrow">Ce qui nous guide</p>
            <h2 id="about-values-title">Nos valeurs</h2>
          </div>
          <p>Des principes concrets pour faire grandir la confiance et les échanges.</p>
        </div>
        <div className="about-values-grid">
          {values.map(({ title, description, icon: Icon }) => (
            <article className="about-value" key={title}>
              <span className="about-value-icon"><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-cta" aria-labelledby="about-cta-title">
        <div className="about-cta-inner">
          <p className="about-eyebrow about-eyebrow-light">La suite se construit ensemble</p>
          <h2 id="about-cta-title">Ensemble, faisons grandir les opportunités agricoles.</h2>
          <p>
            Que vous soyez producteur, vendeur ou acheteur, AgricultureConnect vous invite à découvrir une nouvelle manière de connecter les acteurs agricoles grâce au numérique.
          </p>
          <div className="about-actions">
            <Link className="about-button about-button-light" to="/products">
              Découvrir les produits <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="about-button about-button-outline" to="/register">
              Rejoindre AgricultureConnect
            </Link>
          </div>
        </div>
        <div className="about-cta-mark" aria-hidden="true"><Sprout /></div>
      </section>

      <footer className="about-footer">
        <Link className="about-brand" to="/a-propos">
          <span className="about-brand-mark" aria-hidden="true"><Sprout /></span>
          <span>Agriculture<span>Connect</span></span>
        </Link>
        <p>Le numérique au service des échanges agricoles.</p>
        <a href="#debut">Retour en haut ↑</a>
      </footer>
    </main>
  );
}