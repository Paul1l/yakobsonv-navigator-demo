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
import { watchThemeStorage } from './lib/theme.js';

// ?debug — служебный доступ к сцене для проверок (window.__jarvis, window.__app)
const debug = new URLSearchParams(window.location.search).has('debug');

export function createApp(container) {
  const drawer = MobileDrawer();
  const dialog = ContactDialog();
  const header = Header({ onMenu: (burger) => drawer.open(burger) });
  const sections = [Hero({ debug }), Solutions(), Cases(), Process(), ProjectCabinetDemo(), Pricing(), ContactSection()];
  const footer = Footer();
  const ambient = AmbientScene(); // фоновая сцена всей страницы — холст под содержимым, вне #app

  const main = document.createElement('main');
  main.id = 'main';
  main.tabIndex = -1;
  sections.forEach((section) => main.append(section.el));

  const parts = [header, ...sections, footer, drawer, dialog];
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
    }
    const { task, source, context } = button.dataset;
    dialog.open({ task, source, context }, trigger);
  };

  return {
    ambient,
    mount() {
      container.replaceChildren(header.el, main, footer.el, drawer.el, dialog.el);
      parts.forEach((part) => part.mount?.());
      container.before(ambient.el);
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
      parts.forEach((part) => part.destroy?.());
      container.replaceChildren();
    },
  };
}

const app = createApp(document.getElementById('app'));
app.mount();
if (debug) window.__app = app;
