import { attachGlow } from './lib/glow.js';
import { Header } from './components/Header.js';
import { MobileDrawer } from './components/MobileDrawer.js';
import { Hero } from './components/Hero.js';
import { Solutions } from './components/Solutions.js';
import { Cases } from './components/Cases.js';
import { Process } from './components/Process.js';
import { ProjectCabinetDemo } from './components/ProjectCabinetDemo.js';
import { Pricing } from './components/Pricing.js';
import { ContactSection } from './components/ContactSection.js';
import { ContactDialog } from './components/ContactDialog.js';
import { Footer } from './components/Footer.js';
import { AmbientScene } from './components/AmbientScene.js';
import { Guide } from './components/Guide.js';
import { ServiceDialog } from './components/ServiceDialog.js';
import { watchThemeStorage } from './lib/theme.js';

// ?debug — служебный доступ к сцене для проверок (window.__jarvis, window.__app)
const debug = new URLSearchParams(window.location.search).has('debug');

export function createApp(container) {
  const drawer = MobileDrawer();
  const dialog = ContactDialog();
  // Подробности направления с первого экрана; после закрытия показ остаётся в ручном режиме на той же теме
  const details = ServiceDialog({ onClose: () => hero.showcase.detailsClosed() });
  const header = Header({ onMenu: (burger) => drawer.open(burger) });
  const hero = Hero({ debug, onDetails: (direction, trigger) => details.open(direction, trigger) });
  const sections = [hero, Solutions(), Cases(), Process(), ProjectCabinetDemo(), Pricing(), ContactSection()];
  const footer = Footer();
  // Джарвис-гид: фоновое кольцо летает по разделам и «произносит» их пояснительный текст
  const guide = Guide();
  const ambient = AmbientScene({ guide }); // фоновая сцена всей страницы — холст под содержимым, вне #app

  const main = document.createElement('main');
  main.id = 'main';
  main.tabIndex = -1;
  sections.forEach((section) => main.append(section.el));

  const parts = [header, ...sections, footer, drawer, dialog, details];
  let detachGlow = null;
  let unwatchTheme = null;

  // Все кнопки «Обсудить …» помечены data-contact: задача, источник и контекст — в data-атрибутах
  const onContactClick = async (event) => {
    const button = event.target.closest('[data-contact]');
    if (!button || dialog.el.contains(button)) return;
    let trigger = button;
    if (drawer.contains(button)) {
      await drawer.close({ restoreFocus: false });
      trigger = header.burger;
    } else if (details.contains(button)) {
      // «Обсудить задачу» из подробностей: окно подробностей закрывается, после формы фокус — на «Подробнее»
      const from = details.trigger;
      await details.close({ restoreFocus: false });
      trigger = from ?? button;
    }
    const { task, source, context } = button.dataset;
    dialog.open({ task, source, context }, trigger);
  };

  return {
    ambient,
    guide,
    mount() {
      container.replaceChildren(header.el, main, footer.el, drawer.el, dialog.el, details.el);
      parts.forEach((part) => part.mount?.());
      container.before(ambient.el);
      guide.mount();
      ambient.mount();
      document.addEventListener('click', onContactClick);
      detachGlow = attachGlow(container);
      unwatchTheme = watchThemeStorage();
    },
    destroy() {
      document.removeEventListener('click', onContactClick);
      detachGlow?.();
      unwatchTheme?.();
      ambient.destroy();
      guide.destroy();
      parts.forEach((part) => part.destroy?.());
      container.replaceChildren();
    },
  };
}

const app = createApp(document.getElementById('app'));
app.mount();
if (debug) window.__app = app;
