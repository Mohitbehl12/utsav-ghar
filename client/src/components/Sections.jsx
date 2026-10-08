import { Link } from 'react-router-dom';
import { SEGMENTS } from '@shared/festivals.js';
import { useStore } from '../state/store.jsx';
import { assetUrl } from '../lib/api.js';
import ProductArt from './ProductArt.jsx';
import FestiveSky from './FestiveSky.jsx';

export const segmentUrl = (s) => `/s/${s.slug}`;

/** Full-width hero, coloured by a store section's theme. */
export function ThemedHero({ theme, art = [], banner, eyebrow, title, titleHi, subtitle, chip, actions, facts, scene, compact = false }) {
  return (
    <section className={`thero ${compact ? 'thero--compact' : ''}`} style={theme ? { '--th-dark': theme.dark, '--th-mid': theme.mid, '--th-accent': theme.accent, '--th-primary': theme.primary } : undefined}>
      <FestiveSky density={compact ? 0.35 : 0.6} fireworks={!compact} />
      <div className="container thero__grid">
        <div className="thero__copy">
          {chip}
          {eyebrow && <p className="thero__eyebrow"><span aria-hidden="true">✦</span> {eyebrow}</p>}
          <h1>{title}{titleHi && <span className="thero__hi" lang="hi">{titleHi}</span>}</h1>
          {subtitle && <p className="thero__lede">{subtitle}</p>}
          {actions && <div className="thero__ctas">{actions}</div>}
          {facts?.length > 0 && <ul className="hero__facts">{facts.map(([b, t]) => <li key={b}><b>{b}</b><span>{t}</span></li>)}</ul>}
        </div>
        <div className="thero__art" aria-hidden="true">
          {banner ? <img src={assetUrl(banner)} alt="" className="thero__photo" /> : scene || (
            <div className="thero__orb">
              {art[0] && <ProductArt art={art[0]} bare className="thero__a1" />}
              {art[1] && <ProductArt art={art[1]} bare className="thero__a2" />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Tiles for the six store sections. */
export function SegmentTiles({ title = 'Shop by department' }) {
  const { categories } = useStore();
  return (
    <section className="section container" aria-label={title}>
      <div className="fstrip__head"><h2>{title}</h2></div>
      <div className="segtiles">
        {SEGMENTS.map((s) => {
          const n = categories.filter((c) => c.segment === s.slug).reduce((a, c) => a + (c.product_count || 0), 0);
          return (
            <Link key={s.slug} to={segmentUrl(s)} className="segtile" style={{ '--sc': s.theme.primary, '--sc-dark': s.theme.dark, '--sc-accent': s.theme.accent }}>
              <span className="segtile__art" aria-hidden="true">
                <ProductArt art={s.art[0]} bare />
                <ProductArt art={s.art[1]} bare />
              </span>
              <span className="segtile__name"><span aria-hidden="true">{s.icon}</span> {s.name}</span>
              <span className="segtile__desc">{s.tagline}</span>
              <span className="segtile__cta">{n ? `${n} products` : 'Explore'} →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
