import { el, esc, goToSection } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { createModal } from '../lib/modal.js';
import { directions } from '../data/directions.js';

// Число кейса: рост «было → стало» или масштаб
const caseMetric = (c) =>
  c.kind === 'growth' ? `${esc(c.from)} <span class="case__arrow" aria-hidden="true">→</span> ${esc(c.to)}` : esc(c.value);

function renderBody(d) {
  const index = directions.indexOf(d) + 1;
  const c = d.case;
  return `
    <div class="modal__head">
      <p class="eyebrow">Направление · ${index} из ${directions.length}</p>
      <h2 class="modal__title" id="service-title" tabindex="-1" data-autofocus>${esc(d.title)}</h2>
      <p class="modal__context" id="service-context">${esc(d.text)}</p>
    </div>
    <section class="service-modal__block">
      <h3 class="label">Кому подходит</h3>
      <p>${esc(d.audience)}</p>
    </section>
    <section class="service-modal__block">
      <h3 class="label">Что входит</h3>
      <ul class="service-modal__list">${d.includes.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </section>
    ${
      c
        ? `<section class="service-modal__case">
      <h3 class="label">Кейс</h3>
      <p class="service-modal__metric">${caseMetric(c)}</p>
      <p class="service-modal__case-text">${esc(c.metricLabel)} · ${esc(c.tags.join(', '))}</p>
      <p class="service-modal__note">${esc(c.note)}</p>
      <a class="link-arrow" href="#cases" data-section-link>Смотреть кейс${icons.arrow}</a>
    </section>`
        : ''
    }
    <div class="service-modal__actions">
      <button class="btn btn--primary" type="button" data-contact data-task="${esc(d.task)}" data-source="showcase"
        data-context="${esc(`Направление: ${d.title}`)}">Обсудить задачу${icons.arrow}</button>
      <a class="btn btn--ghost" href="${esc(d.href)}" data-section-link data-solution="${esc(d.solutionId)}">${esc(d.hrefLabel)}</a>
    </div>
  `;
}

/**
 * Подробности направления: кому подходит, состав работ, кейс (если есть), ссылка на раздел и «Обсудить задачу».
 * Открывается только нажатием «Подробнее» (не наведением). Фокус — на заголовок окна, Escape и кнопка закрывают,
 * фокус возвращается на «Подробнее»; фон недоступен (<dialog> showModal), прокрутка страницы заблокирована
 * и после закрытия остаётся на месте. Ссылки на разделы закрывают окно и ведут к разделу.
 */
export function ServiceDialog({ onClose = () => {} } = {}) {
  const root = el(`
    <dialog class="modal service-modal" aria-labelledby="service-title" aria-describedby="service-context">
      <div class="modal__panel">
        <button class="icon-btn modal__close" type="button" data-close aria-label="Закрыть">${icons.close}</button>
        <div class="service-modal__scroll" data-slot="body"></div>
      </div>
    </dialog>
  `);
  const body = root.querySelector('[data-slot="body"]');
  let trigger = null;
  let current = null;

  const modal = createModal(root, { onClose: () => onClose(current) });

  const onClick = async (event) => {
    if (event.target.closest('[data-close]')) {
      modal.close();
      return;
    }
    const link = event.target.closest('a[data-section-link]');
    if (!link) return;
    // переход к разделу страницы: окно закрывается без возврата фокуса, фокус уходит в раздел
    event.preventDefault();
    const id = link.hash.slice(1);
    const solution = link.dataset.solution;
    await modal.close({ restoreFocus: false });
    if (solution) document.dispatchEvent(new CustomEvent('solutionselect', { detail: { id: solution } }));
    goToSection(id);
  };

  return {
    el: root,
    get trigger() {
      return trigger;
    },
    get current() {
      return current;
    },
    contains: (node) => root.contains(node),
    open(direction, from) {
      current = direction;
      trigger = from;
      body.innerHTML = renderBody(direction);
      modal.open(from);
    },
    close: (options) => modal.close(options),
    mount() {
      root.addEventListener('click', onClick);
    },
    destroy() {
      root.removeEventListener('click', onClick);
      modal.destroy();
    },
  };
}
