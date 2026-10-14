const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Неразрывные пробелы: тире не начинает строку, короткие предлоги не остаются в конце строки.
const typo = (value) =>
  value
    .replace(/ — /g, ' — ')
    .replace(/(^|[\s>])(в|с|к|о|у|и|а|от|до|на|по|за|из|не) /gi, '$1$2 ');

// Разметка заголовков из контента: *слова* → serif italic, \n → перенос строки.
export const rich = (value) =>
  typo(esc(value))
    .replace(/\*(.+?)\*/g, '<em class="serif">$1</em>')
    .replace(/\n/g, '<br>');

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const formatRub = (value) => new Intl.NumberFormat('ru-RU').format(value);

// Переход к разделу с учётом reduced motion; фокус переносится на заголовок раздела.
export function goToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  history.pushState(null, '', `#${id}`);
  const heading = target.querySelector('h1, h2') || target;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}
