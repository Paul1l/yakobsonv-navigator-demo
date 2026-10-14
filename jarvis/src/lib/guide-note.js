import { esc } from './dom.js';
import { stops } from '../data/guide.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Записка Джарвиса-гида вместо пояснительного абзаца раздела. Текст — обычный HTML (его читают экранные дикторы
 * и видно без анимации); слова обёрнуты в span с номером (--i) — по нему CSS проявляет их по очереди.
 * .guide-dock — точка, где зависает кольцо у этой остановки (положение задаёт CSS).
 */
export function guideNote(id) {
  const index = stops.findIndex((s) => s.id === id);
  if (index < 0) throw new Error(`guideNote: нет остановки ${id}`);
  const words = stops[index].text.split(/\s+/).filter(Boolean);
  return `
    <aside class="guide-note" id="guide-${id}" data-guide-stop="${id}" data-state="idle">
      <span class="guide-dock" aria-hidden="true"></span>
      <p class="guide-note__label" aria-hidden="true"><span class="guide-note__index">${pad(index + 1)}</span><span class="guide-note__total"> / ${pad(stops.length)}</span></p>
      <p class="guide-note__text">${words.map((w, i) => `<span class="guide-w" style="--i:${i}">${esc(w)}</span>`).join(' ')}</p>
    </aside>`;
}
