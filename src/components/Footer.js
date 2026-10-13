import { el, esc } from '../lib/dom.js';
import { nav, site, footer } from '../data/content.js';

export function Footer() {
  const year = new Date().getFullYear();
  const root = el(`
    <footer class="site-footer">
      <div class="container">
        <div class="site-footer__grid">
          <div>
            <a class="logo" href="#top">yakobsonv<span class="logo__dot">.</span><span class="sr-only"> — в начало страницы</span></a>
            <p class="site-footer__tagline">${esc(footer.tagline)}</p>
          </div>
          <nav aria-label="Разделы в подвале">
            <p class="label site-footer__title">Разделы</p>
            <ul class="site-footer__links">
              ${nav.map((item) => `<li><a href="#${item.id}">${esc(item.label)}</a></li>`).join('')}
              <li><a href="#contact">Контакт</a></li>
            </ul>
          </nav>
          <div>
            <p class="label site-footer__title">Связаться</p>
            <ul class="site-footer__links">
              <li><a href="${site.telegram.href}" target="_blank" rel="noopener">Telegram ${esc(site.telegram.label)}</a></li>
              <li><a href="mailto:${site.email}">${esc(site.email)}</a></li>
              ${site.privacyHref ? `<li><a href="${esc(site.privacyHref)}">Политика обработки персональных данных</a></li>` : ''}
            </ul>
          </div>
        </div>
        <div class="site-footer__bottom">
          <p>© ${year} ${esc(site.owner)}</p>
          <p>${esc(footer.prototypeNote)}</p>
        </div>
      </div>
    </footer>
  `);
  return { el: root };
}
