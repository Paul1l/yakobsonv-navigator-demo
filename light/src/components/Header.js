import { el, esc } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { nav } from '../data/content.js';

export function Header({ onMenu }) {
  const root = el(`
    <header class="site-header" data-elevated="false">
      <div class="container site-header__inner">
        <a class="logo" href="#top">yakobsonv<span class="logo__dot">.</span><span class="sr-only"> — в начало страницы</span></a>
        <nav class="site-nav" aria-label="Основная навигация">
          <ul>${nav.map((item) => `<li><a href="#${item.id}">${esc(item.label)}</a></li>`).join('')}</ul>
        </nav>
        <button class="btn btn--primary btn--sm site-header__cta" type="button" data-contact data-source="header">Обсудить проект</button>
        <button class="icon-btn burger" type="button" aria-label="Открыть меню" aria-haspopup="dialog" aria-expanded="false" aria-controls="mobile-drawer">${icons.menu}</button>
      </div>
    </header>
  `);
  const burger = root.querySelector('.burger');
  let frame = 0;

  const update = () => {
    frame = 0;
    root.dataset.elevated = String(window.scrollY > 8);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const onBurger = () => onMenu(burger);

  return {
    el: root,
    burger,
    mount() {
      window.addEventListener('scroll', onScroll, { passive: true });
      burger.addEventListener('click', onBurger);
      update();
    },
    destroy() {
      window.removeEventListener('scroll', onScroll);
      burger.removeEventListener('click', onBurger);
      cancelAnimationFrame(frame);
    },
  };
}
