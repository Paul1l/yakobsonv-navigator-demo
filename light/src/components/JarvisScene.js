import { el } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { createRenderer } from '../scene/renderer.js';
import { createLoop } from '../scene/loop.js';
import { createMagnetState, aimMagnet, releaseMagnet, stepMagnet } from '../scene/magnet.js';

const STATIC_TIME = 1.7; // кадр для статичного варианта

/**
 * Декоративная сцена: кольцо из нитей и сетчатое ядро.
 * Цикл работает только когда сцена видна, вкладка активна и анимация не на паузе.
 * Магнитная реакция — только для мыши; касания и прокрутку не перехватывает.
 */
export function JarvisScene({ debug = false } = {}) {
  const root = el(`
    <div class="scene">
      <canvas class="scene__canvas" aria-hidden="true"></canvas>
      <span class="scene__label scene__label--site" aria-hidden="true">Сайт</span>
      <span class="scene__label scene__label--traffic" aria-hidden="true">Трафик</span>
      <span class="scene__label scene__label--auto" aria-hidden="true">Автоматизация</span>
      <button class="icon-btn scene__toggle" type="button">
        <span data-icon></span><span class="sr-only" data-label></span>
      </button>
    </div>
  `);
  const canvas = root.querySelector('canvas');
  const toggle = root.querySelector('.scene__toggle');
  const ctx = canvas.getContext('2d');
  const renderer = createRenderer();
  const magnet = createMagnetState();
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let t = STATIC_TIME;
  let paused = reduceQuery.matches; // при reduced motion — сразу статичный вариант
  let inView = false;
  let pageVisible = !document.hidden;
  let mounted = false;
  let resizeObserver = null;
  let intersectionObserver = null;

  const loop = createLoop((dt) => {
    t += dt;
    stepMagnet(magnet, dt);
    render();
  });

  function render() {
    if (!ctx || !width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderer.draw(ctx, { width, height, t, magnet });
  }

  function sync() {
    if (mounted && !paused && inView && pageVisible && width > 0) loop.start();
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

  function updateToggle() {
    const label = paused ? 'Запустить анимацию' : 'Остановить анимацию';
    toggle.querySelector('[data-label]').textContent = label;
    toggle.querySelector('[data-icon]').innerHTML = paused ? icons.play : icons.pause;
    toggle.title = label;
  }

  function setPaused(value) {
    paused = value;
    if (paused) {
      // На паузе магнитная реакция выключена: форма сразу возвращается к фоновой
      releaseMagnet(magnet);
      magnet.strength = 0;
    }
    updateToggle();
    sync();
    render();
  }

  const onToggle = () => setPaused(!paused);

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

  const onReduceChange = (event) => setPaused(event.matches);

  function mount() {
    if (mounted) return;
    mounted = true;
    updateToggle();
    toggle.addEventListener('click', onToggle);
    root.addEventListener('pointermove', onPointerMove, { passive: true });
    root.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    reduceQuery.addEventListener('change', onReduceChange);

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
            inView,
            pageVisible,
            width,
            height,
            dpr,
            t: Math.round(t * 100) / 100,
            strength: Math.round(magnet.strength * 1000) / 1000,
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
    toggle.removeEventListener('click', onToggle);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    reduceQuery.removeEventListener('change', onReduceChange);
    if (debug) delete window.__jarvis;
  }

  return { el: root, mount, destroy };
}
