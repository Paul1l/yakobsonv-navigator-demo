import { el, esc, rich } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { hero, site } from '../data/content.js';
import { JarvisScene } from './JarvisScene.js';

export function Hero({ debug = false } = {}) {
  const scene = JarvisScene({ debug });
  // Порядок в разметке: текст и основная кнопка, затем графика — так же на телефоне
  const root = el(`
    <section class="hero" id="top" aria-labelledby="hero-title">
      <div class="container hero__grid">
        <div class="hero__copy">
          <p class="eyebrow">${esc(hero.eyebrow)}</p>
          <h1 class="hero__title" id="hero-title">${rich(hero.title)}</h1>
          <p class="hero__lead">${esc(hero.lead)}</p>
          <div class="hero__actions">
            <button class="btn btn--primary" type="button" data-contact data-source="hero">${esc(hero.primary)}${icons.arrow}</button>
            <a class="btn btn--ghost" href="#cases">${esc(hero.secondary)}</a>
          </div>
          <p class="hero__meta"><span class="hero__dot" aria-hidden="true"></span>${esc(site.owner)} · ${esc(site.responseTime)}</p>
        </div>
        <div class="hero__visual" data-slot="scene"></div>
      </div>
    </section>
  `);
  root.querySelector('[data-slot="scene"]').append(scene.el);
  return { el: root, mount: () => scene.mount(), destroy: () => scene.destroy() };
}
