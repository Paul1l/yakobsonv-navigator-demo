import { el, esc, goToSection } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { createModal } from '../lib/modal.js';
import { nav, site } from '../data/content.js';
import { toggleTheme, syncToggle } from '../lib/theme.js';

// Выдвижное меню для телефона: блокирует прокрутку, закрывается по Esc, по подложке,
// по кнопке и при переходе по ссылке; фокус удерживается внутри и возвращается на кнопку меню.
export function MobileDrawer() {
  const root = el(`
    <dialog class="drawer" id="mobile-drawer" aria-label="Меню">
      <div class="drawer__panel">
        <div class="drawer__head">
          <span class="logo" aria-hidden="true">yakobsonv<span class="logo__dot">.</span></span>
          <button class="icon-btn" type="button" data-close aria-label="Закрыть меню">${icons.close}</button>
        </div>
        <nav aria-label="Разделы">
          <ul class="drawer__nav">
            ${nav.map((item) => `<li><a href="#${item.id}" data-nav>${esc(item.label)}${icons.arrow}</a></li>`).join('')}
          </ul>
        </nav>
        <button class="btn btn--primary btn--block" type="button" data-contact data-source="drawer">Обсудить проект</button>
        <button class="drawer__theme" type="button" aria-pressed="false"><span class="drawer__theme-icon">${icons.moon}</span><span data-label>Тёмная тема</span></button>
        <div class="drawer__contacts">
          <a href="${site.telegram.href}" target="_blank" rel="noopener">Telegram ${esc(site.telegram.label)}</a>
          <a href="mailto:${site.email}">${esc(site.email)}</a>
        </div>
      </div>
    </dialog>
  `);
  let trigger = null;
  const desktopQuery = window.matchMedia('(min-width: 900px)');

  // Окно расширили до десктопа (поворот планшета): меню там не нужно, бургер скрыт
  const onDesktop = (event) => {
    if (event.matches) modal.close({ restoreFocus: false });
  };

  const modal = createModal(root, {
    onOpen: () => trigger?.setAttribute('aria-expanded', 'true'),
    onClose: () => trigger?.setAttribute('aria-expanded', 'false'),
  });

  const themeButton = root.querySelector('.drawer__theme');
  const onThemeChange = () => syncToggle(themeButton);

  const onClick = (event) => {
    if (event.target.closest('.drawer__theme')) {
      toggleTheme();
      return;
    }
    if (event.target.closest('[data-close]')) {
      modal.close();
      return;
    }
    const link = event.target.closest('a[data-nav]');
    if (link) {
      event.preventDefault();
      const id = link.hash.slice(1);
      modal.close({ restoreFocus: false }).then(() => goToSection(id));
    }
  };

  return {
    el: root,
    open(from) {
      trigger = from;
      modal.open(from);
    },
    close: (options) => modal.close(options),
    contains: (node) => root.contains(node),
    mount() {
      root.addEventListener('click', onClick);
      desktopQuery.addEventListener('change', onDesktop);
      document.addEventListener('themechange', onThemeChange);
      syncToggle(themeButton);
    },
    destroy() {
      root.removeEventListener('click', onClick);
      desktopQuery.removeEventListener('change', onDesktop);
      document.removeEventListener('themechange', onThemeChange);
      modal.destroy();
    },
  };
}
