import { el, esc, rich } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { TASK_FILTERS, countTasks, filterTasks, toggleTask } from '../lib/tasks.js';
import { cabinet } from '../data/content.js';
import { demoTasks } from '../data/demo-tasks.js';

const EMPTY = {
  active: 'В работе ничего нет — все задачи выполнены.',
  done: 'Выполненных задач пока нет.',
  all: 'Задач нет.',
};

// Демо кабинета: вкладки со счётчиками, отметка выполнения и возврат задачи.
// Состояние живёт только в этом компоненте и не сохраняется.
export function ProjectCabinetDemo() {
  const root = el(`
    <section class="section" id="cabinet" aria-labelledby="cabinet-title">
      <div class="container">
        <header class="section-head">
          <p class="eyebrow">${esc(cabinet.eyebrow)}</p>
          <h2 class="section-title" id="cabinet-title">${rich(cabinet.title)}</h2>
          <p class="section-lead">${esc(cabinet.lead)}</p>
        </header>
        <div class="card cabinet">
          <div class="cabinet__top">
            <div>
              <p class="cabinet__project">${esc(cabinet.project)}</p>
              <p class="cabinet__summary" data-summary></p>
            </div>
            <span class="badge-demo" title="Демонстрационный режим">ДЕМО</span>
          </div>
          <div class="cabinet__progress" aria-hidden="true"><span data-progress></span></div>
          <div class="cabinet__body">
            <div class="cabinet__tabs" role="tablist" aria-label="Задачи по статусу">
              ${TASK_FILTERS.map(
                (f) => `<button class="tab" type="button" role="tab" id="cabinet-tab-${f.id}" data-filter="${f.id}"
                  aria-controls="cabinet-panel" aria-selected="false" tabindex="-1">
                  <span>${esc(f.label)}</span><span class="tab__count" data-count="${f.id}">0</span>
                </button>`,
              ).join('')}
            </div>
            <div class="cabinet__panel" id="cabinet-panel" role="tabpanel" tabindex="-1">
              <ul class="task-list" data-list></ul>
              <p class="task-empty" data-empty hidden></p>
            </div>
          </div>
          <p class="cabinet__note">${esc(cabinet.note)}</p>
          <p class="sr-only" aria-live="polite" data-live></p>
        </div>
      </div>
    </section>
  `);

  const tablist = root.querySelector('[role="tablist"]');
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panel = root.querySelector('#cabinet-panel');
  const list = root.querySelector('[data-list]');
  const empty = root.querySelector('[data-empty]');
  const live = root.querySelector('[data-live]');
  const verticalQuery = window.matchMedia('(min-width: 900px)');

  let tasks = demoTasks.map((task) => ({ ...task }));
  let filter = 'active';
  let lastToggleAt = 0;

  function renderCounts() {
    const counts = countTasks(tasks);
    for (const f of TASK_FILTERS) root.querySelector(`[data-count="${f.id}"]`).textContent = counts[f.id];
    root.querySelector('[data-summary]').textContent = `Выполнено ${counts.done} из ${counts.all} задач`;
    root.querySelector('[data-progress]').style.setProperty('--p', `${(counts.done / counts.all) * 100}%`);
  }

  function renderList() {
    const visible = filterTasks(tasks, filter);
    list.innerHTML = visible.map(renderTask).join('');
    empty.hidden = visible.length > 0;
    empty.textContent = EMPTY[filter];
  }

  function selectTab(id, { focus = false } = {}) {
    filter = id;
    for (const tab of tabs) {
      const selected = tab.dataset.filter === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) {
        panel.setAttribute('aria-labelledby', tab.id);
        if (focus) tab.focus();
      }
    }
    renderList();
  }

  function toggle(id) {
    const index = filterTasks(tasks, filter).findIndex((t) => t.id === id);
    tasks = toggleTask(tasks, id);
    const task = tasks.find((t) => t.id === id);
    live.textContent = task.status === 'done'
      ? `Задача «${task.title}» отмечена выполненной.`
      : `Задача «${task.title}» возвращена в работу.`;
    renderCounts();
    renderList();
    // Фокус не теряется: та же задача, следующая в списке или сама панель
    const same = list.querySelector(`[data-toggle="${id}"]`);
    const buttons = [...list.querySelectorAll('[data-toggle]')];
    const next = same || buttons[Math.min(index, buttons.length - 1)];
    (next || panel).focus();
  }

  const onClick = (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) {
      selectTab(tab.dataset.filter);
      return;
    }
    const button = event.target.closest('[data-toggle]');
    if (!button) return;
    // После переключения строки сдвигаются: второй клик двойного щелчка или быстрый повторный тап
    // попал бы в кнопку соседней задачи
    const now = performance.now();
    if (event.detail > 1 || now - lastToggleAt < 250) return;
    lastToggleAt = now;
    toggle(button.dataset.toggle);
  };

  const onKeydown = (event) => {
    if (!event.target.closest('[role="tab"]')) return;
    const i = tabs.indexOf(document.activeElement);
    const keys = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (keys[event.key] + tabs.length) % tabs.length;
    selectTab(tabs[next].dataset.filter, { focus: true });
  };

  const syncOrientation = () =>
    tablist.setAttribute('aria-orientation', verticalQuery.matches ? 'vertical' : 'horizontal');

  renderCounts();
  selectTab(filter);
  syncOrientation();

  return {
    el: root,
    mount() {
      root.addEventListener('click', onClick);
      tablist.addEventListener('keydown', onKeydown);
      verticalQuery.addEventListener('change', syncOrientation);
    },
    destroy() {
      root.removeEventListener('click', onClick);
      tablist.removeEventListener('keydown', onKeydown);
      verticalQuery.removeEventListener('change', syncOrientation);
    },
  };
}

function renderTask(task) {
  const done = task.status === 'done';
  return `
    <li class="task" data-status="${task.status}">
      <span class="task__mark" aria-hidden="true">${icons.check}</span>
      <div>
        <p class="task__title">${esc(task.title)}</p>
        <p class="task__meta"><span class="tag">${esc(task.area)}</span><span>${done ? 'Выполнено' : 'В работе'} · ${esc(task.when)}</span></p>
      </div>
      <button class="task__btn" type="button" data-toggle="${task.id}">
        ${done ? icons.undo : icons.check}<span>${done ? 'Вернуть' : 'Готово'}</span><span class="sr-only">${done ? ' в работу' : ' — отметить выполненной'}: ${esc(task.title)}</span>
      </button>
    </li>
  `;
}
