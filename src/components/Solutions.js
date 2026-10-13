import { el, esc, rich } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { statement, solutions } from '../data/content.js';

// Строка «Одна задача — одна система», три решения с раскрываемым описанием и строка CMS.
export function Solutions() {
  const root = el(`
    <div>
      <section class="statement" aria-labelledby="statement-title">
        <div class="container statement__inner">
          <h2 class="statement__title" id="statement-title">${rich(statement.title)}</h2>
          <p class="statement__text">${esc(statement.text)}</p>
        </div>
      </section>
      <section class="section" id="solutions" aria-labelledby="solutions-title">
        <div class="container">
          <header class="section-head">
            <p class="eyebrow">${esc(solutions.eyebrow)}</p>
            <h2 class="section-title" id="solutions-title">${rich(solutions.title)}</h2>
            <p class="section-lead">${esc(solutions.lead)}</p>
          </header>
          <div class="solutions__grid">
            ${solutions.items.map(renderItem).join('')}
          </div>
          <div class="platforms">
            <p class="label">${esc(solutions.platformsLabel)}</p>
            <ul class="platforms__list">${solutions.platforms.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          </div>
        </div>
      </section>
    </div>
  `);

  const items = solutions.items.map((item) => ({
    id: item.id,
    card: root.querySelector(`[data-card="${item.id}"]`),
    trigger: root.querySelector(`[data-solution="${item.id}"]`),
    panel: root.querySelector(`#solution-panel-${item.id}`),
  }));
  let current = null;

  function select(id) {
    current = id;
    for (const item of items) {
      const open = item.id === id;
      item.trigger.setAttribute('aria-expanded', String(open));
      item.panel.hidden = !open;
      item.card.classList.toggle('is-selected', open);
    }
  }

  const onClick = (event) => {
    const trigger = event.target.closest('[data-solution]');
    if (!trigger) return;
    const card = trigger.closest('[data-card]');
    const before = card.getBoundingClientRect().top;
    const id = trigger.dataset.solution;
    select(current === id ? null : id);
    // На телефоне закрытие верхней панели сдвигает карточку — возвращаем её на место
    const shift = card.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' });
  };

  // Десктоп: первое решение раскрыто под карточками. Телефон: все свёрнуты, чтобы были видны три варианта
  select(window.matchMedia('(min-width: 900px)').matches ? solutions.items[0].id : null);

  // Переход из подробностей направления на первом экране («Состав работ и результат»): раскрыть то же решение
  const onExternalSelect = (event) => {
    if (items.some((item) => item.id === event.detail?.id)) select(event.detail.id);
  };

  return {
    el: root,
    mount() {
      root.addEventListener('click', onClick);
      document.addEventListener('solutionselect', onExternalSelect);
    },
    destroy() {
      root.removeEventListener('click', onClick);
      document.removeEventListener('solutionselect', onExternalSelect);
    },
  };
}

function renderItem(item) {
  return `
    <article class="card glow solution-card" data-card="${item.id}">
      <span class="solution-card__num" aria-hidden="true">${esc(item.number)}</span>
      <h3 class="solution-card__title">
        <button class="solution-card__trigger" type="button" id="solution-trigger-${item.id}"
          data-solution="${item.id}" aria-expanded="false" aria-controls="solution-panel-${item.id}">${esc(item.title)}</button>
      </h3>
      <p class="solution-card__summary">${esc(item.summary)}</p>
      <span class="solution-card__more" aria-hidden="true">Что входит${icons.chevron}</span>
    </article>
    <div class="card solution-panel" id="solution-panel-${item.id}" role="region" aria-labelledby="solution-trigger-${item.id}" hidden>
      <p class="solution-panel__title" aria-hidden="true">${esc(item.title)}</p>
      <div class="solution-panel__col">
        <p class="label">Что входит</p>
        <ul class="checklist">${item.includes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
      </div>
      <div class="solution-panel__col">
        <p class="label">Результат</p>
        <p class="solution-panel__outcome">${esc(item.outcome)}</p>
        <button class="btn btn--primary" type="button" data-contact data-task="${item.task}"
          data-source="solution:${item.id}" data-context="${esc(item.title)}">${esc(item.cta)}${icons.arrow}</button>
      </div>
    </div>
  `;
}
