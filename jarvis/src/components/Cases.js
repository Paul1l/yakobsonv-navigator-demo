import { el, esc, rich } from '../lib/dom.js';
import { guideNote } from '../lib/guide-note.js';
import { icons } from '../lib/icons.js';
import { cases } from '../data/content.js';

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);

export function Cases() {
  const root = el(`
    <section class="section" id="cases" aria-labelledby="cases-title">
      <div class="container">
        <header class="section-head">
          <p class="eyebrow">${esc(cases.eyebrow)}</p>
          <h2 class="section-title" id="cases-title">${rich(cases.title)}</h2>
          ${guideNote('cases')}
        </header>
        <div class="cases__grid">${cases.items.map(renderCase).join('')}</div>
      </div>
    </section>
  `);

  const onClick = (event) => {
    const toggle = event.target.closest('[data-case-toggle]');
    if (!toggle) return;
    const details = root.querySelector(`#${toggle.getAttribute('aria-controls')}`);
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-text]').textContent = open ? 'Свернуть' : 'Подробнее о кейсе';
    details.hidden = !open;
  };

  return {
    el: root,
    mount: () => root.addEventListener('click', onClick),
    destroy: () => root.removeEventListener('click', onClick),
  };
}

function renderCase(item) {
  const metric =
    item.kind === 'growth'
      ? `<span>${fmt(item.from)}</span><span class="case__arrow" aria-hidden="true">→</span><span class="sr-only">выросло до</span><span>${fmt(item.to)}</span>`
      : `<span>${esc(item.value)}</span>`;

  const visual =
    item.kind === 'growth'
      ? `<div class="case__visual" aria-hidden="true">
          <div class="bar"><span>До</span><span class="bar__track"><span class="bar__fill" style="--w:${((item.from / item.to) * 100).toFixed(1)}%"></span></span><span class="bar__value">${fmt(item.from)}</span></div>
          <div class="bar bar--after"><span>После</span><span class="bar__track"><span class="bar__fill" style="--w:100%"></span></span><span class="bar__value">${fmt(item.to)}</span></div>
        </div>`
      : '';

  return `
    <article class="card glow case">
      <h3 class="case__tags">${item.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('<span class="sr-only">, </span>')}</h3>
      <p class="case__metric">${metric}</p>
      <p class="case__metric-label">${esc(item.metricLabel)}</p>
      ${visual}
      <p class="case__text">${esc(item.text)}</p>
      <div class="case__details" id="case-details-${item.id}" hidden>
        <dl class="facts">${item.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <p class="case__note">${esc(item.note)}</p>
      </div>
      <div class="case__actions">
        <button class="btn btn--text case__toggle" type="button" data-case-toggle
          aria-expanded="false" aria-controls="case-details-${item.id}"><span data-text>Подробнее о кейсе</span>${icons.chevron}</button>
        <button class="btn btn--ghost btn--sm" type="button" data-contact data-task="${item.task}"
          data-source="case:${item.id}" data-context="Похожая задача: ${esc(item.tags.join(', '))}">Обсудить похожую задачу</button>
      </div>
    </article>
  `;
}
