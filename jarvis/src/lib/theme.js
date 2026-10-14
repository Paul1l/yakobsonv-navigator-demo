// Тема страницы: светлая по умолчанию, тёмная — по выбору посетителя (переключатель в шапке и в меню).
// Выбор хранится в localStorage; до загрузки стилей его применяет встроенный скрипт в index.html — без вспышки.
// Смена темы: атрибут data-theme на <html> (токены — src/styles/tokens.css) и событие 'themechange' на document.

export const THEME_KEY = 'yakobsonv-theme';
export const THEMES = Object.freeze(['light', 'dark']);
// Цвет строки браузера (meta theme-color) — фон темы
const THEME_COLOR = Object.freeze({ light: '#f4f3ef', dark: '#0e0d0b' });

/** Сохранённое значение → тема; всё непонятное — светлая. */
export const resolveTheme = (stored) => (stored === 'dark' ? 'dark' : 'light');

export function readTheme() {
  try {
    return resolveTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'light'; // хранилище недоступно (приватный режим) — тема живёт до перезагрузки
  }
}

export const currentTheme = () => resolveTheme(document.documentElement.dataset.theme);

export function applyTheme(theme, { persist = true } = {}) {
  const next = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* без хранилища — только до перезагрузки */
    }
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  return next;
}

/** Тему сменили в другой вкладке того же сайта — применяем без повторной записи (событие storage). */
export function watchThemeStorage() {
  const onStorage = (event) => {
    if (event.key === THEME_KEY && resolveTheme(event.newValue) !== currentTheme()) applyTheme(event.newValue, { persist: false });
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export const toggleTheme = () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');

/** Палитра сцены из токенов темы (--scene-rgb, --scene-deep-rgb: «r g b») в формате 'r,g,b' для Canvas. */
export function scenePalette(fallback) {
  const css = getComputedStyle(document.documentElement);
  const read = (name, def) => {
    const v = css.getPropertyValue(name).trim();
    return /^\d{1,3}[ ,]+\d{1,3}[ ,]+\d{1,3}$/.test(v) ? v.split(/[ ,]+/).join(',') : def;
  };
  return { base: read('--scene-rgb', fallback.base), deep: read('--scene-deep-rgb', fallback.deep) };
}

/** Состояние кнопки-переключателя «Тёмная тема»: подпись постоянная, aria-pressed = тёмная включена. */
export function syncToggle(button) {
  button.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
}
