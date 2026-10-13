import { el } from '../lib/dom.js';
import { createRenderer, DEFAULT_PALETTE } from '../scene/renderer.js';
import { scenePalette } from '../lib/theme.js';
import { heroClock } from '../scene/clock.js';
import { createLoop } from '../scene/loop.js';
import { createMagnetState, aimMagnet, releaseMagnet, stepMagnet, expApproach } from '../scene/magnet.js';

const STATIC_TIME = 1.7; // кадр для статичного варианта
const FOCUS_RATE = 12; // скорость проявления подсветки сектора, 1/с (≈ 0,25 с)

/**
 * Декоративная сцена: кольцо из нитей и сетчатое ядро.
 * Цикл работает только когда сцена видна, вкладка активна и анимация не на паузе.
 * Магнитная реакция — только для мыши; касания и прокрутку не перехватывает.
 * Подписи направлений и кнопка показа — в Showcase; сцена только рисует и принимает команды:
 * setPaused (кнопка показа) и setFocus (подсветка сектора выбранного направления).
 */
export function JarvisScene({ debug = false } = {}) {
  const root = el(`
    <div class="scene">
      <canvas class="scene__canvas" aria-hidden="true"></canvas>
    </div>
  `);
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const renderer = createRenderer(undefined, scenePalette(DEFAULT_PALETTE));
  const magnet = createMagnetState();
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let t = STATIC_TIME;
  let userPaused = false; // остановка показа посетителем
  let paused = reduceQuery.matches; // фактическая пауза: посетитель или reduced motion — статичный вариант
  let inView = false;
  let pageVisible = !document.hidden;
  let mounted = false;
  let resizeObserver = null;
  let intersectionObserver = null;
  let handoff = 0; // 0…1: доля, на которую кольцо уже передано фоновой сцене (AmbientScene, событие 'scenehandoff')
  // Подсвеченные секторы орбиты: выбранный проявляется, прежний гаснет
  const highlights = [];

  const loop = createLoop((dt) => {
    t += dt;
    stepMagnet(magnet, dt);
    stepHighlights(dt);
    render();
  });

  function stepHighlights(dt) {
    for (let i = highlights.length - 1; i >= 0; i--) {
      const h = highlights[i];
      h.k = dt > 0 ? expApproach(h.k, h.target, FOCUS_RATE, dt) : h.target;
      if (h.target === 0 && h.k < 0.01) highlights.splice(i, 1);
    }
  }

  function render() {
    heroClock.t = t; // фоновая сцена подхватывает кольцо с этого же кадра
    if (!ctx || !width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderer.draw(ctx, { width, height, t, magnet, highlights });
  }

  function sync() {
    if (mounted && !paused && inView && pageVisible && width > 0 && handoff < 1) loop.start();
    else loop.stop();
  }

  function resize(w, h) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = w;
    height = h;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    render();
    sync();
  }

  function applyPaused() {
    const next = userPaused || reduceQuery.matches;
    if (next === paused && mounted) return;
    paused = next;
    if (paused) {
      // На паузе магнитная реакция выключена: форма сразу возвращается к фоновой
      releaseMagnet(magnet);
      magnet.strength = 0;
      stepHighlights(0);
    }
    sync();
    render();
    // остановка показа останавливает и фоновую сцену страницы
    document.dispatchEvent(new CustomEvent('scenepause', { detail: { paused } }));
  }

  function setPaused(value) {
    userPaused = Boolean(value);
    applyPaused();
  }

  // Подсветка сектора орбиты в направлении метки (угол в радианах, 0 — справа, по часовой); null — снять
  function setFocus(angle) {
    let found = false;
    for (const h of highlights) {
      const same = angle !== null && Math.abs(h.angle - angle) < 1e-3;
      h.target = same ? 1 : 0;
      found ||= same;
    }
    if (angle !== null && !found) highlights.push({ angle, k: 0, target: 1 });
    // без бегущего цикла (пауза, reduced motion, вне экрана) — сразу итоговое состояние
    if (!loop.running) {
      stepHighlights(0);
      render();
    }
  }

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse' || paused) return;
    const rect = canvas.getBoundingClientRect();
    aimMagnet(magnet, event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerLeave = (event) => {
    if (event.pointerType === 'mouse') releaseMagnet(magnet);
  };

  const onVisibility = () => {
    pageVisible = !document.hidden;
    sync();
  };

  const onReduceChange = () => applyPaused();

  // Прокрутка уводит кольцо с первого экрана: фоновая сцена подхватывает его на том же месте, а здесь кольцо
  // растворяется; когда передача завершена, свой цикл не нужен. Метки направлений остаются — это кнопки.
  const onHandoff = (event) => {
    handoff = event.detail.progress;
    canvas.style.opacity = handoff > 0 ? String(1 - handoff) : '';
    sync();
  };

  // Тема сменилась — сцена перекрашивается в цвета темы (бирюза / шампань)
  const onThemeChange = () => {
    renderer.setPalette(scenePalette(DEFAULT_PALETTE));
    render();
  };

  function mount() {
    if (mounted) return;
    mounted = true;
    root.addEventListener('pointermove', onPointerMove, { passive: true });
    root.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    reduceQuery.addEventListener('change', onReduceChange);
    document.addEventListener('themechange', onThemeChange);
    document.addEventListener('scenehandoff', onHandoff);

    resizeObserver = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1].contentRect;
      if (box.width !== width || box.height !== height) resize(box.width, box.height);
    });
    resizeObserver.observe(root);

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { rootMargin: '64px' },
    );
    intersectionObserver.observe(root);

    if (debug) {
      window.__jarvis = {
        get state() {
          return {
            running: loop.running,
            paused,
            userPaused,
            inView,
            pageVisible,
            width,
            height,
            dpr,
            t: Math.round(t * 100) / 100,
            strength: Math.round(magnet.strength * 1000) / 1000,
            highlights: highlights.map((h) => ({ angle: Math.round(h.angle * 100) / 100, k: Math.round(h.k * 100) / 100 })),
          };
        },
        probe: () => renderer.probeCore({ width, height, t, magnet }),
        metrics: () => renderer.metrics(width, height),
        setPaused,
      };
    }
  }

  function destroy() {
    if (!mounted) return;
    mounted = false;
    loop.stop();
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    reduceQuery.removeEventListener('change', onReduceChange);
    document.removeEventListener('themechange', onThemeChange);
    document.removeEventListener('scenehandoff', onHandoff);
    if (debug) delete window.__jarvis;
  }

  return {
    el: root,
    canvas,
    mount,
    destroy,
    setPaused,
    setFocus,
    get paused() {
      return paused;
    },
    metrics: () => renderer.metrics(width, height),
  };
}
