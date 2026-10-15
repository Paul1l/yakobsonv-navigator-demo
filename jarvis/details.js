// Интерактивный попап направления: «проваливаешься» в него из кнопки и смотришь всю информацию.
// Вкладки: Обзор · Что входит · Как работаем · Кейс · Стоимость; переход к соседним направлениям стрелками.
// Нативный <dialog> + showModal(): фон недоступен, Escape закрывает, фокус возвращается на кнопку, открывшую окно.
// Данные — topics.js. Без таймеров: анимации — CSS и requestAnimationFrame (счётчик цифр кейса).
import { topics, order, process } from './topics.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rub = (n) => new Intl.NumberFormat('ru-RU').format(n);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
// «Без анимации» на странице и системное уменьшение движения отключают и анимации окна
const still = () => reduce.matches || document.documentElement.classList.contains('motion-off');

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'includes', label: 'Что входит' },
  { id: 'process', label: 'Как работаем' },
  { id: 'case', label: 'Кейс' },
  { id: 'pricing', label: 'Стоимость' },
];

function overviewPanel(t) {
  return `
    <p class="dlg-text">${esc(t.audience)}</p>
    <div class="dlg-outcome"><span class="dlg-kicker">Результат</span><p>${esc(t.outcome)}</p></div>`;
}

function includesPanel(t) {
  return `<ol class="dlg-checks">${t.includes.map((item, i) => `<li style="--i:${i}"><span class="dlg-check" aria-hidden="true"></span>${esc(item)}</li>`).join('')}</ol>`;
}

function processPanel(active) {
  return `
    <div class="dlg-steps" role="group" aria-label="Этапы работы">
      ${process.map((s, i) => `<button type="button" class="dlg-step" data-step="${i}" aria-pressed="${i === active}"><span class="dlg-step__num">0${i + 1}</span><span class="dlg-step__title">${esc(s.title)}</span></button>`).join('')}
    </div>
    <div class="dlg-step-body" aria-live="polite"></div>`;
}

function stepBody(i) {
  const s = process[i];
  return `<p class="dlg-text">${esc(s.text)}</p><p class="dlg-result"><span class="dlg-kicker">Итог этапа</span> ${esc(s.result)}</p>`;
}

function casePanel(t) {
  const c = t.case;
  const metric =
    c.kind === 'growth'
      ? `<span class="dlg-count" data-to="${c.from}">${c.from}</span><span class="dlg-arrow" aria-hidden="true">→</span><span class="dlg-count" data-to="${c.to}">${c.to}</span>`
      : `<span><span class="dlg-count" data-to="${c.value}">${rub(c.value)}</span>${esc(c.suffix || '')}</span>`;
  const bars =
    c.kind === 'growth'
      ? `<div class="dlg-bars" aria-hidden="true">
          <span class="dlg-bar"><span>До</span><i style="--w:${((c.from / c.to) * 100).toFixed(1)}%"></i><b>${c.from}</b></span>
          <span class="dlg-bar is-after"><span>После</span><i style="--w:100%"></i><b>${c.to}</b></span>
        </div>`
      : '';
  return `
    <div class="dlg-case">
      <p class="dlg-tags">${c.tags.map((x) => `<span>${esc(x)}</span>`).join('')}</p>
      <p class="dlg-metric">${metric}</p>
      <p class="dlg-metric-label">${esc(c.label)}</p>
      ${bars}
      <p class="dlg-text">${esc(c.text)}</p>
      <p class="dlg-note">${esc(c.note)}</p>
    </div>`;
}

function pricingPanel(t, active) {
  const p = t.pricing;
  const plans = p.plans
    ? `<div class="dlg-plans">${p.plans
        .map(
          (pl, i) => `
        <button type="button" class="dlg-plan" data-plan="${i}" aria-pressed="${i === active}">
          <span class="dlg-plan__name">${esc(pl.name)}</span>
          <span class="dlg-plan__price">от ${rub(pl.price)} ₽</span>
          <span class="dlg-plan__period">${esc(pl.period)}</span>
        </button>`,
        )
        .join('')}</div><div class="dlg-plan-body" aria-live="polite"></div>`
    : '';
  return `${plans}<p class="dlg-note">${esc(p.note)}</p>`;
}

function planBody(t, i) {
  const pl = t.pricing.plans[i];
  return `<p class="dlg-text">${esc(pl.desc)}</p><ul class="dlg-mini">${pl.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

export function createDetails(dialog, { onContact }) {
  let current = null;
  let tab = 'overview';
  let wanted = 'overview'; // вкладка, выбранная человеком: сохраняется при переходе через направление без неё
  let step = 0;
  const plan = {}; // выбранный тариф по направлению
  let openedAt = 0;
  let downOnBackdrop = false;
  let trigger = null;
  let countFrame = 0;

  dialog.innerHTML = `
    <div class="dialog-shell">
      <div class="dialog-top">
        <span class="eyebrow" id="detail-category"></span>
        <div class="dlg-nav">
          <button type="button" class="icon-button" data-go="-1" aria-label="Предыдущее направление">←</button>
          <span class="dlg-pos" id="detail-pos" aria-live="polite"></span>
          <button type="button" class="icon-button" data-go="1" aria-label="Следующее направление">→</button>
          <button class="dialog-close icon-button" id="dialog-close" type="button" aria-label="Закрыть подробности">×</button>
        </div>
      </div>
      <div class="dlg-body" id="detail-body">
        <h2 id="detail-title" tabindex="-1"></h2>
        <p class="dlg-lead" id="detail-description"></p>
        <div class="dlg-tabs" role="tablist" aria-label="Разделы подробностей"></div>
        <div class="dlg-panel" id="detail-panel" role="tabpanel" tabindex="0"></div>
      </div>
      <div class="dialog-bottom">
        <p>Объём работ определяем под вашу задачу.</p>
        <button type="button" class="button button-dark" id="dialog-contact">Обсудить задачу <span aria-hidden="true">↗</span></button>
      </div>
    </div>`;
  dialog.setAttribute('aria-labelledby', 'detail-title');
  const $ = (sel) => dialog.querySelector(sel);
  const tabsEl = $('.dlg-tabs');
  const panel = $('#detail-panel');

  const availableTabs = (t) => TABS.filter((x) => x.id !== 'case' || t.case);

  // Счётчик цифр кейса: от нуля до значения за ~0.9 с (без таймеров; при reduced motion — сразу)
  function runCounters() {
    cancelAnimationFrame(countFrame);
    const els = [...panel.querySelectorAll('.dlg-count')];
    if (!els.length || still()) return;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 900);
      const e = 1 - (1 - k) ** 3;
      els.forEach((el) => {
        el.textContent = rub(Math.round(Number(el.dataset.to) * e));
      });
      if (k < 1) countFrame = requestAnimationFrame(step);
    };
    countFrame = requestAnimationFrame(step);
  }

  function renderTab(id, { focus = false, user = false } = {}) {
    const t = topics[current];
    if (user) wanted = id;
    const tabs = availableTabs(t);
    if (!tabs.some((x) => x.id === id)) id = 'overview';
    tab = id;
    tabsEl.querySelectorAll('[role="tab"]').forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      // на телефоне вкладки прокручиваются вбок — выбранная не должна оставаться обрезанной у края
      if (on) {
        const box = tabsEl.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        if (r.left < box.left || r.right > box.right) tabsEl.scrollLeft += r.left < box.left ? r.left - box.left - 16 : r.right - box.right + 16;
      }
    });
    panel.setAttribute('aria-labelledby', `dtab-${id}`);
    const planIndex = plan[current] ?? 0;
    panel.innerHTML =
      id === 'overview' ? overviewPanel(t) : id === 'includes' ? includesPanel(t) : id === 'process' ? processPanel(step) : id === 'case' ? casePanel(t) : pricingPanel(t, planIndex);
    if (id === 'process') panel.querySelector('.dlg-step-body').innerHTML = stepBody(step);
    if (id === 'pricing' && t.pricing.plans) panel.querySelector('.dlg-plan-body').innerHTML = planBody(t, planIndex);
    // низкий экран (телефон боком): если содержимое вкладки ушло за край, подтягиваем вкладки к верху окна
    if (user) {
      const body = $('#detail-body');
      const b = body.getBoundingClientRect();
      if (panel.getBoundingClientRect().top > b.bottom - 80) body.scrollTop += tabsEl.getBoundingClientRect().top - b.top;
    }
    panel.classList.remove('is-in');
    void panel.offsetWidth; // перезапуск анимации смены вкладки
    panel.classList.add('is-in');
    if (id === 'case') runCounters();
  }

  function renderTopic(id, { dir = 0 } = {}) {
    current = id;
    const t = topics[id];
    const index = order.indexOf(id);
    $('#detail-category').textContent = t.category;
    $('#detail-pos').textContent = `${index + 1} / ${order.length}`;
    $('#detail-title').textContent = t.title;
    $('#detail-description').textContent = t.description;
    tabsEl.innerHTML = availableTabs(t)
      .map((x) => `<button type="button" role="tab" id="dtab-${x.id}" data-tab="${x.id}" aria-controls="detail-panel">${x.label}</button>`)
      .join('');
    const body = $('#detail-body');
    body.dataset.dir = String(dir);
    body.classList.remove('is-switching');
    void body.offsetWidth;
    if (dir) body.classList.add('is-switching');
    renderTab(wanted);
  }

  function go(delta) {
    const i = order.indexOf(current);
    renderTopic(order[(i + delta + order.length) % order.length], { dir: delta });
  }

  // «Нырок»: окно вырастает из точки нажатой кнопки
  function open(id, from) {
    trigger = from ?? null;
    wanted = 'overview';
    step = 0;
    renderTopic(id);
    $('#detail-body').scrollTop = 0;
    dialog.classList.remove('is-diving');
    dialog.showModal();
    openedAt = performance.now();
    document.documentElement.classList.add('modal-open');
    // «нырок» начинается в центре нажатой кнопки: сдвиг от центра окна до центра кнопки
    const r = from?.getBoundingClientRect();
    const d = dialog.getBoundingClientRect();
    dialog.style.setProperty('--from-x', r ? `${Math.round(r.left + r.width / 2 - (d.left + d.width / 2))}px` : '0px');
    dialog.style.setProperty('--from-y', r ? `${Math.round(r.top + r.height / 2 - (d.top + d.height / 2))}px` : '0px');
    void dialog.offsetWidth;
    if (!still()) dialog.classList.add('is-diving');
    $('#detail-title').focus({ preventScroll: true });
  }

  const outside = (event) => {
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => {
    downOnBackdrop = event.target === dialog && outside(event);
  });

  dialog.addEventListener('click', (event) => {
    const t = event.target;
    if (t === dialog) {
      // закрываем, только если и нажатие, и отпускание были на фоне (протаскивание выделения из окна не закрывает),
      // и не сразу после открытия (второй щелчок двойного клика по кнопке приходится на фон)
      if (downOnBackdrop && outside(event) && performance.now() - openedAt > 400) dialog.close();
      return;
    }
    const go_ = t.closest('[data-go]');
    if (go_) return go(Number(go_.dataset.go));
    if (t.closest('#dialog-close')) return dialog.close();
    if (t.closest('#dialog-contact')) {
      trigger = null;
      dialog.close();
      onContact?.();
      return;
    }
    const tabBtn = t.closest('[role="tab"]');
    if (tabBtn) return renderTab(tabBtn.dataset.tab, { user: true });
    const stepBtn = t.closest('.dlg-step');
    if (stepBtn) {
      step = Number(stepBtn.dataset.step);
      panel.querySelectorAll('.dlg-step').forEach((b) => b.setAttribute('aria-pressed', String(b === stepBtn)));
      panel.querySelector('.dlg-step-body').innerHTML = stepBody(step);
      return;
    }
    const planBtn = t.closest('.dlg-plan');
    if (planBtn) {
      plan[current] = Number(planBtn.dataset.plan);
      panel.querySelectorAll('.dlg-plan').forEach((b) => b.setAttribute('aria-pressed', String(b === planBtn)));
      panel.querySelector('.dlg-plan-body').innerHTML = planBody(topics[current], plan[current]);
    }
  });

  // Клавиатура: стрелки по вкладкам (выбор следует за фокусом), Home/End
  dialog.addEventListener('keydown', (event) => {
    const tabBtn = event.target.closest?.('[role="tab"]');
    if (!tabBtn) return;
    const ids = [...tabsEl.querySelectorAll('[role="tab"]')].map((b) => b.dataset.tab);
    const i = ids.indexOf(tabBtn.dataset.tab);
    const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 };
    if (!(event.key in map)) return;
    event.preventDefault();
    renderTab(ids[(map[event.key] + ids.length) % ids.length], { focus: true, user: true });
  });

  dialog.addEventListener('close', () => {
    cancelAnimationFrame(countFrame);
    document.documentElement.classList.remove('modal-open');
    dialog.classList.remove('is-diving');
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });

  return { open, get current() { return current; }, get tab() { return tab; } };
}
