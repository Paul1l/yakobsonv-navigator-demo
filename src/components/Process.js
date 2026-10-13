import { el, esc, rich } from '../lib/dom.js';
import { processSteps } from '../data/content.js';

export function Process() {
  const root = el(`
    <section class="section" id="process" aria-labelledby="process-title">
      <div class="container">
        <header class="section-head">
          <p class="eyebrow">${esc(processSteps.eyebrow)}</p>
          <h2 class="section-title" id="process-title">${rich(processSteps.title)}</h2>
          <p class="section-lead">${esc(processSteps.lead)}</p>
        </header>
        <ol class="process__list">
          ${processSteps.steps
            .map(
              (step, i) => `
            <li class="card glow step">
              <span class="step__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
              <h3 class="step__title"><span class="sr-only">Этап ${i + 1}. </span>${esc(step.title)}</h3>
              <p class="step__text">${esc(step.text)}</p>
              <p class="step__result"><span>Итог этапа</span>${esc(step.result)}</p>
            </li>`,
            )
            .join('')}
        </ol>
      </div>
    </section>
  `);
  return { el: root };
}
