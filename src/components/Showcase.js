import { el, esc } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { createShowcase } from '../lib/showcase.js';
import { directions, showcase as config } from '../data/directions.js';
import { JarvisScene } from './JarvisScene.js';

const ICON = { stop: icons.pause, resume: icons.play, replay: icons.undo, start: icons.play };

/**
 * Интерактивная орбита первого экрана: три направления (Сайт / Трафик / Автоматизация) как вкладки вокруг
 * сцены и карточка выбранного направления под ней.
 * - Метки неподвижны; при выборе подсвечивается сектор орбиты в сторону метки (JarvisScene.setFocus).
 * - Компьютер с мышью: короткий автообзор, один проход (интервал — data/directions.js, showcase.interval);
 *   наведение на орбиту или карточку временно останавливает его, на метку — показывает тему через 200 мс.
 * - Клик, тап, клавиатура и «Подробнее» — ручной режим; автосмена — только кнопкой показа.
 * - Сенсорный экран и «уменьшить движение» — без автообзора; при reduced motion кнопки показа нет.
 * Логика таймера — lib/showcase.js; подробности открывает ServiceDialog (onDetails).
 * Тексты и кнопки — обычные HTML-элементы; холст сцены нажатия не перехватывает.
 */
export function Showcase({ debug = false, onDetails = () => {} } = {}) {
  const scene = JarvisScene({ debug });
  const total = directions.length;
  const root = el(`
    <div class="showcase" data-mode="auto" data-paused="false" data-intro>
      <p class="showcase__hint" id="showcase-hint">${esc(config.hint)}</p>
      <div class="showcase__stage">
        <button class="scene__toggle" type="button">
          <span class="scene__toggle-icon" data-icon aria-hidden="true"></span>
          <span class="scene__toggle-text" data-label></span>
        </button>
        <div class="showcase__topics" role="tablist" aria-labelledby="showcase-hint">
          ${directions
            .map(
              (d, i) => `
            <button class="topic topic--${d.id}" type="button" role="tab" id="topic-${d.id}" data-topic="${d.id}"
              aria-selected="${i === 0}" aria-controls="showcase-panel-${d.id}" tabindex="${i === 0 ? 0 : -1}">
              <span class="topic__mark" aria-hidden="true"></span><span class="topic__label">${esc(d.label)}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="showcase__slot">
        ${directions
          .map(
            (d, i) => `
          <section class="showcase__panel" role="tabpanel" id="showcase-panel-${d.id}" aria-labelledby="topic-${d.id}"
            data-panel="${d.id}" data-active="${i === 0}"${i === 0 ? '' : ' inert'}>
            <p class="showcase__count">${i + 1} из ${total}</p>
            <h2 class="showcase__title">${esc(d.title)}</h2>
            <p class="showcase__text">${esc(d.text)}</p>
            <button class="showcase__more" type="button" data-details="${d.id}" aria-haspopup="dialog">${esc(config.more)}${icons.arrow}</button>
          </section>`,
          )
          .join('')}
      </div>
    </div>
  `);
  const stage = root.querySelector('.showcase__stage');
  stage.querySelector('.scene__toggle').after(scene.el);
  const slot = root.querySelector('.showcase__slot');
  const tabs = [...root.querySelectorAll('.topic')];
  const panels = [...root.querySelectorAll('.showcase__panel')];
  const toggle = root.querySelector('.scene__toggle');
  const toggleLabel = toggle.querySelector('[data-label]');
  const toggleIcon = toggle.querySelector('[data-icon]');

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const autoplayAllowed = () => fineQuery.matches && !reduceQuery.matches;

  let current = 0;
  let angles = directions.map((d) => d.angle);
  let observer = null;
  let introDone = false;
  let mounted = false;

  // Угол подсветки — по фактическому положению метки относительно центра сцены; если метки стоят рядом
  // под орбитой (телефон) — запасной угол из данных
  function measureAngles() {
    const c = scene.canvas.getBoundingClientRect();
    if (!c.width) return;
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    const R = 0.34 * Math.min(c.width, c.height);
    angles = tabs.map((tab, i) => {
      const r = tab.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      return Math.hypot(dx, dy) < R * 1.8 && r.width ? Math.atan2(dy, dx) : directions[i].angle;
    });
  }

  function show(index, { animate = true } = {}) {
    current = index;
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel, i) => {
      const on = i === index;
      panel.dataset.active = String(on);
      panel.toggleAttribute('inert', !on);
      panel.classList.remove('is-entering');
      if (on && animate && introDone && !reduceQuery.matches) {
        void panel.offsetWidth; // перезапуск CSS-анимации появления
        panel.classList.add('is-entering');
      }
    });
    scene.setFocus(angles[index]);
  }

  function renderState(state) {
    root.dataset.mode = state.mode;
    root.dataset.paused = String(state.userPaused);
    const label = config.labels[state.action];
    toggleLabel.textContent = label;
    toggleIcon.innerHTML = ICON[state.action];
    toggle.title = label;
    toggle.hidden = reduceQuery.matches;
    // остановка показа останавливает и декоративное движение
    scene.setPaused(state.userPaused);
  }

  const controller = createShowcase({
    count: total,
    interval: config.interval,
    hoverDelay: config.hoverDelay,
    autoplay: autoplayAllowed(),
    onChange: (index) => show(index),
    onState: renderState,
  });

  // --- события ---
  const indexOf = (node) => tabs.indexOf(node.closest('.topic'));

  const onClick = (event) => {
    const tab = event.target.closest('.topic');
    if (tab) {
      tab.classList.remove('is-previewing');
      controller.select(indexOf(tab));
      return;
    }
    const more = event.target.closest('[data-details]');
    if (more) {
      const index = directions.findIndex((d) => d.id === more.dataset.details);
      controller.openDetails();
      onDetails(directions[index], more);
      return;
    }
    if (event.target.closest('.scene__toggle')) controller.toggle();
  };

  // Вкладки: стрелки, Home/End — выбор следует за фокусом
  const onKeydown = (event) => {
    const i = indexOf(event.target);
    if (i < 0) return;
    const keys = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: total - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (keys[event.key] + total) % total;
    controller.select(next);
    tabs[next].focus();
  };

  // Клавиатурный фокус внутри блока — автосмена останавливается. Кроме самой кнопки показа: она и есть
  // управление показом, и с клавиатуры «Остановить показ» должно останавливать, а не превращаться в «Повторить»
  const onFocusIn = (event) => {
    if (event.target === toggle) return;
    if (event.target.matches?.(':focus-visible')) controller.keyboard();
  };

  // Наведение мышью: на блок — пауза автосмены; на метку — показ темы с задержкой
  const isMouse = (event) => event.pointerType === 'mouse';
  const onEnter = (event) => isMouse(event) && controller.setHover(true);
  const onLeave = (event) => isMouse(event) && controller.setHover(false);
  const onOver = (event) => {
    if (!isMouse(event)) return;
    const tab = event.target.closest('.topic');
    if (!tab || tab.contains(event.relatedTarget)) return;
    tab.classList.add('is-previewing');
    controller.preview(indexOf(tab));
  };
  const onOut = (event) => {
    if (!isMouse(event)) return;
    const tab = event.target.closest('.topic');
    if (!tab || tab.contains(event.relatedTarget)) return;
    tab.classList.remove('is-previewing');
    controller.cancelPreview();
  };

  const onAnimationEnd = (event) => event.target.classList?.remove('is-entering', 'is-intro');

  // Первое появление карточки в области просмотра: она раскрывается из области орбиты (один раз).
  // Пока у .showcase есть data-intro, CSS держит карточку скрытой — поэтому атрибут снимается и без анимации.
  function playIntro() {
    if (introDone) return;
    introDone = true;
    if (!reduceQuery.matches) panels[current].classList.add('is-intro');
    root.removeAttribute('data-intro');
  }

  const onVisibility = () => controller.setActive(!document.hidden);
  const onResize = () => {
    measureAngles();
    scene.setFocus(angles[current]);
  };
  const onMediaChange = () => {
    if (!autoplayAllowed()) controller.disableAutoplay();
    renderState(controller.state);
    onResize();
  };

  return {
    el: root,
    scene,
    controller,
    // ServiceDialog закрылся — выбранная тема и положение страницы сохраняются
    detailsClosed: () => controller.closeDetails(),
    mount() {
      if (mounted) return;
      mounted = true;
      scene.mount();
      measureAngles();
      show(0, { animate: false });
      renderState(controller.state);
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', onKeydown);
      root.addEventListener('focusin', onFocusIn);
      root.addEventListener('pointerenter', onEnter);
      root.addEventListener('pointerleave', onLeave);
      root.addEventListener('pointerover', onOver);
      root.addEventListener('pointerout', onOut);
      root.addEventListener('animationend', onAnimationEnd);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('resize', onResize);
      reduceQuery.addEventListener('change', onMediaChange);
      fineQuery.addEventListener('change', onMediaChange);
      // Автосмена — только пока блок на экране (наблюдается весь блок); первое раскрытие карточки — когда на экране
      // сама карточка (на телефоне она ниже первого экрана)
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.target === root) controller.setVisible(entry.intersectionRatio >= 0.25);
              else if (entry.intersectionRatio >= 0.3) playIntro();
            }
          },
          { threshold: [0, 0.25, 0.3] },
        );
        observer.observe(root);
        observer.observe(slot);
      } else playIntro();
      window.addEventListener('beforeprint', playIntro);
      controller.setActive(!document.hidden);
      if (debug) window.__showcase = { get state() { return { ...controller.state, current, angles: angles.map((a) => Math.round(a * 100) / 100) }; } };
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      controller.destroy();
      observer?.disconnect();
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('animationend', onAnimationEnd);
      window.removeEventListener('beforeprint', playIntro);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      reduceQuery.removeEventListener('change', onMediaChange);
      fineQuery.removeEventListener('change', onMediaChange);
      scene.destroy();
      if (debug) delete window.__showcase;
    },
  };
}
