import { el, esc } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { nav } from '../data/content.js';
import { toggleTheme, syncToggle } from '../lib/theme.js';

export function Header({ onMenu }) {
  const root = el(`
    <header class="site-header" data-elevated="false">
      <div class="container site-header__inner">
        <a class="logo" href="#top">yakobsonv<span class="logo__dot">.</span><span class="sr-only"> — в начало страницы</span></a>
        <nav class="site-nav" aria-label="Основная навигация">
          <ul>${nav.map((item) => `<li><a href="#${item.id}">${esc(item.label)}</a></li>`).join('')}</ul>
        </nav>
        <button class="icon-btn theme-toggle" type="button" aria-pressed="false" aria-label="Тёмная тема" title="Тёмная тема"><span class="theme-toggle__icon theme-toggle__icon--moon">${icons.moon}</span><span class="theme-toggle__icon theme-toggle__icon--sun">${icons.sun}</span></button>
        <button class="btn btn--primary btn--sm site-header__cta" type="button" data-contact data-source="header">Обсудить проект</button>
        <button class="icon-btn burger" type="button" aria-label="Открыть меню" aria-haspopup="dialog" aria-expanded="false" aria-controls="mobile-drawer">${icons.menu}</button>
      </div>
    </header>
  `);
  const burger = root.querySelector('.burger');
  const themeButton = root.querySelector('.theme-toggle');
  const onTheme = () => toggleTheme();
  const onThemeChange = () => syncToggle(themeButton);
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
      themeButton.addEventListener('click', onTheme);
      document.addEventListener('themechange', onThemeChange);
      syncToggle(themeButton);
      update();
    },
    destroy() {
      window.removeEventListener('scroll', onScroll);
      burger.removeEventListener('click', onBurger);
      themeButton.removeEventListener('click', onTheme);
      document.removeEventListener('themechange', onThemeChange);
      cancelAnimationFrame(frame);
    },
  };
}
