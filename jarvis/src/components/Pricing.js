import { el, esc, rich, formatRub } from '../lib/dom.js';
import { guideNote } from '../lib/guide-note.js';
import { icons } from '../lib/icons.js';
import { pricing } from '../data/content.js';

export function Pricing() {
  const root = el(`
    <section class="section" id="pricing" aria-labelledby="pricing-title">
      <div class="container">
        <header class="section-head">
          <p class="eyebrow">${esc(pricing.eyebrow)}</p>
          <h2 class="section-title" id="pricing-title">${rich(pricing.title)}</h2>
          ${guideNote('pricing')}
        </header>
        <div class="pricing__grid">
          ${pricing.plans.map(renderPlan).join('')}
        </div>
        <div class="pricing__note">
          <p>${esc(pricing.note)}</p>
          <button class="btn btn--ghost btn--sm" type="button" data-contact data-task="unknown"
            data-source="pricing:custom" data-context="Оценка разработки или внедрения ИИ">${esc(pricing.noteCta)}${icons.arrow}</button>
        </div>
      </div>
    </section>
  `);
  return { el: root };
}

function renderPlan(plan) {
  const price = `${formatRub(plan.price)} ₽`;
  const context = `Тариф «${plan.name}» — от ${price} ${plan.period}`;
  return `
    <article class="card glow plan">
      <h3 class="plan__name">${esc(plan.name)}</h3>
      <p class="plan__price">
        <span class="plan__from">от</span>
        <span class="plan__amount">${esc(price)}</span>
        <span class="plan__period">${esc(plan.period)}</span>
      </p>
      <p class="plan__desc">${esc(plan.desc)}</p>
      <ul class="checklist">${plan.includes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
      <button class="btn btn--ghost" type="button" data-contact data-task="seo"
        data-source="pricing:${plan.id}" data-context="${esc(context)}">Обсудить тариф<span class="sr-only"> «${esc(plan.name)}»</span></button>
    </article>
  `;
}
