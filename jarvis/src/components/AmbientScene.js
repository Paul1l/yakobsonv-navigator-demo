import { SCENE } from '../scene/geometry.js';
import { createRenderer, DEFAULT_PALETTE } from '../scene/renderer.js';
import { createLoop } from '../scene/loop.js';
import { createMagnetState, aimMagnet, releaseMagnet, stepMagnet, expApproach } from '../scene/magnet.js';
import { scenePalette } from '../lib/theme.js';
import { heroClock } from '../scene/clock.js';

const STATIC_TIME = 1.7;
const TAU = Math.PI * 2;
// Размер фонового кольца относительно сцены первого экрана: компактнее, чтобы реже уходить под текст
const SIZE = { wide: 0.6, narrow: 0.85 };
// Передача кольца с первого экрана: длина пути в высотах сцены героя и доля пути, за которую кольцо героя растворяется
const HANDOFF_RANGE = 0.85;
const HANDOFF_AFTER = 40;
const HANDOFF_FADE = 0.12;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);

/**
 * Фоновая сцена всей страницы: то же кольцо и ядро, что на первом экране, на фиксированном холсте под содержимым.
 * Кольцо первого экрана не исчезает, а уходит с него: с началом прокрутки фоновая сцена подхватывает его на том же
 * месте и в том же размере (кольцо героя растворяется за первые 12 % пути), затем, следуя за прокруткой, оно
 * уменьшается, приглушается и уплывает на свою траекторию. Передача начинается, когда блок направлений (орбита,
 * метки, карточка) показан целиком, — пока посетитель выбирает и читает, кольцо на месте. Дальше оно сопровождает:
 * - прокрутка: кольцо перемещается по экрану по мере движения по странице и ускоряется от скорости прокрутки;
 * - мышь: края кольца и ядра тянутся к курсору;
 * - нажатия дают разный отклик: «Обсудить …» — импульс от ядра и разгон; ссылки и кнопки — волна с засечками
 *   в точке нажатия; раскрытие подробностей — вспышка ядра; ввод в форме — сканер вокруг кольца; остальное — тихая волна.
 * Кнопка паузы сцены героя останавливает и фон (событие 'scenepause'): кольцо остаётся статичным кадром.
 * prefers-reduced-motion — без перелёта: кольцо героя остаётся на месте, фон — статичный кадр после первого экрана.
 * Скрытая вкладка или скрытый фон — цикл стоит.
 * Джарвис-гид (guide, src/components/Guide.js): если на экране есть остановка, кольцо летит к её точке
 * (.guide-dock) и принимает её размер, а долетев — сообщает guide.arrived(id), и раздел «произносит» свой текст.
 * Без остановки на экране — прежняя траектория.
 * Только украшение: aria-hidden, pointer-events: none (стили — components.css, .ambient-scene).
 */
export function AmbientScene({ guide = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ambient-scene';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.visible = 'false';
  const ctx = canvas.getContext('2d');
  const renderer = createRenderer(SCENE, scenePalette(DEFAULT_PALETTE));
  const magnet = createMagnetState();
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const effects = [];

  let W = 0;
  let H = 0;
  let dpr = 1;
  let t = STATIC_TIME;
  let boost = 0; // разгон от нажатий, затухает
  let flare = 0; // вспышка ядра, 0…1
  let scrollSpeed = 0; // сглаженная скорость прокрутки, px/с
  let lastScroll = 0;
  let visible = false; // фон показан (идёт или завершена передача кольца)
  let paused = false; // пауза кнопкой сцены героя
  let handoff = 0; // 0…1 — насколько кольцо ушло с первого экрана
  let heroFade = -1; // последнее отправленное сцене героя значение растворения
  let ambientOpacity = 0.6;
  let palette = scenePalette(DEFAULT_PALETTE);
  let heroScene = null;
  let heroBlock = null; // блок направлений первого экрана (Showcase): орбита, метки и карточка
  let scrollFrame = 0;
  let mounted = false;
  const pos = { x: 0, y: 0, R: 0 };

  const motionAllowed = () => !reduceQuery.matches;
  const readOpacity = () => parseFloat(getComputedStyle(canvas).getPropertyValue('--ambient-opacity')) || 0.6;

  // Куда кольцо стремится при текущей прокрутке: от правого края — плавной «змейкой» по экрану
  function target() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / max));
    const swing = W >= 768 ? 0.27 : 0.18;
    return {
      x: W * (0.5 + swing * Math.cos(p * Math.PI * 2.5)),
      y: H * (0.5 + 0.1 * Math.sin(p * Math.PI * 3)),
    };
  }

  const ringR = () => SCENE.ringRatio * Math.min(W, H) * (W >= 768 ? SIZE.wide : SIZE.narrow);

  function metrics() {
    return { cx: pos.x, cy: pos.y, R: pos.R, Rc: SCENE.coreRatio * pos.R };
  }

  function setOpacity(value) {
    const v = value.toFixed(3);
    if (canvas.style.opacity !== v) canvas.style.opacity = v;
  }

  // Насколько кольцо ушло с первого экрана: 0 — пока посетитель смотрит на блок направлений (орбита, метки,
  // карточка: передача начинается, когда низ карточки показался и прокручен ещё на HANDOFF_AFTER px; на телефоне
  // это ниже первого экрана), 1 — через HANDOFF_RANGE высоты сцены прокрутки дальше. Без сцены героя — сразу 1.
  function measureHandoff() {
    if (!heroScene) return 1;
    const r = heroScene.getBoundingClientRect();
    if (!r.height) return 1;
    const block = heroBlock?.getBoundingClientRect() ?? r;
    const start = Math.max(0, block.bottom + window.scrollY - H + HANDOFF_AFTER);
    return clamp01((window.scrollY - start) / (r.height * HANDOFF_RANGE));
  }

  // Без перелёта («уменьшить движение»): фон — только когда сцена героя целиком ушла с экрана (QA TQ-08)
  const heroGone = () => !heroScene || heroScene.getBoundingClientRect().bottom <= 0;

  // Положение, размер и прозрачность кольца. Во время передачи — жёстко по прокрутке (от кольца героя к траектории),
  // после — плавно догоняет траекторию (smoothDt > 0) или ставится сразу (0). В конце передачи кольцо уже
  // на траектории, поэтому переход к сглаженному движению без скачка.
  function place(smoothDt) {
    // точка остановки гида (если раздел с запиской на экране) или собственная траектория
    const stop = visible && motionAllowed() ? guide?.target() ?? null : null;
    const tg = stop ?? target();
    const R1 = stop ? stop.R : ringR();
    if (handoff >= 1 || !heroScene || !motionAllowed()) {
      if (smoothDt > 0) {
        pos.x = expApproach(pos.x, tg.x, 2.4, smoothDt);
        pos.y = expApproach(pos.y, tg.y, 2.4, smoothDt);
        pos.R = expApproach(pos.R || R1, R1, 2.4, smoothDt);
      } else {
        pos.x = tg.x;
        pos.y = tg.y;
        pos.R = R1;
      }
      setOpacity(visible ? ambientOpacity : 0);
      return stop;
    }
    const r = heroScene.getBoundingClientRect();
    const e = smooth(handoff);
    pos.x = lerp(r.left + r.width / 2, tg.x, e);
    pos.y = lerp(r.top + r.height / 2, tg.y, e);
    pos.R = lerp(SCENE.ringRatio * Math.min(r.width, r.height), R1, e);
    // кольцо героя растворяется, фоновое на его месте проявляется — переход без второго кольца
    setOpacity(clamp01(handoff / HANDOFF_FADE) * lerp(1, ambientOpacity, e));
    return null;
  }

  const rgba = (rgb, a) => `rgba(${rgb},${a.toFixed(3)})`;

  function drawEffects(m) {
    for (const e of effects) {
      const k = e.age / e.life; // 0…1
      const fade = (1 - k) * (1 - k);
      ctx.save();
      if (e.kind === 'impulse') {
        // импульс от ядра: пунктирное и сплошное кольца расходятся за пределы жгута
        const r = m.R * (1.3 + 1.1 * k);
        ctx.setLineDash([2, 6]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(palette.deep, 0.55 * fade);
        ctx.beginPath();
        ctx.arc(m.cx, m.cy, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(palette.base, 0.35 * fade);
        ctx.beginPath();
        ctx.arc(m.cx, m.cy, r * 0.82, 0, TAU);
        ctx.stroke();
      } else if (e.kind === 'scan') {
        // сканер: яркая дуга обегает кольцо снаружи
        const head = -Math.PI / 2 + k * TAU * 1.2;
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(palette.deep, 0.6 * fade);
        ctx.beginPath();
        ctx.arc(m.cx, m.cy, m.R * 1.36, head - 0.6, head);
        ctx.stroke();
      } else {
        // волна в точке нажатия; у ссылок и кнопок — двойная, с засечками
        const max = e.kind === 'link' ? 150 : 90;
        const r = 8 + max * (1 - (1 - k) ** 3);
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(palette.deep, 0.5 * fade);
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.stroke();
        if (e.kind === 'link') {
          ctx.strokeStyle = rgba(palette.base, 0.35 * fade);
          ctx.beginPath();
          ctx.arc(e.x, e.y, r * 0.62, 0, TAU);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + k * 0.8;
            ctx.moveTo(e.x + Math.cos(a) * (r + 4), e.y + Math.sin(a) * (r + 4));
            ctx.lineTo(e.x + Math.cos(a) * (r + 12), e.y + Math.sin(a) * (r + 12));
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function render() {
    if (!ctx || !W || !H || !pos.R) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = metrics();
    renderer.draw(ctx, { width: W, height: H, t, magnet, metrics: m });
    if (flare > 0.01) {
      const g = ctx.createRadialGradient(m.cx, m.cy, 0, m.cx, m.cy, m.Rc * 2.4);
      g.addColorStop(0, rgba(palette.deep, 0.28 * flare));
      g.addColorStop(1, rgba(palette.base, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, m.Rc * 2.4, 0, TAU);
      ctx.fill();
    }
    drawEffects(m);
  }

  const loop = createLoop((dt) => {
    updateHandoff();
    const y = window.scrollY;
    const v = dt > 0 ? Math.abs(y - lastScroll) / dt : 0;
    lastScroll = y;
    scrollSpeed = expApproach(scrollSpeed, v, 6, dt);
    const scrollBoost = Math.min(3.5, scrollSpeed / 700);
    boost = expApproach(boost, 0, 1.4, dt);
    flare = expApproach(flare, 0, 2, dt);
    t += dt * (1 + scrollBoost + boost);
    // пока кольцо героя растворяется, фон рисует его же кадр — формы совпадают
    if (handoff < HANDOFF_FADE) t = heroClock.t;

    const stop = place(dt);
    // долетело до остановки гида — раздел «произносит» текст
    if (stop && Math.hypot(pos.x - stop.x, pos.y - stop.y) < guide.arriveRatio * stop.R && Math.abs(pos.R - stop.R) < 0.25 * stop.R) {
      guide.arrived(stop.id);
    }
    stepMagnet(magnet, dt);

    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].age += dt;
      if (effects[i].age >= effects[i].life) effects.splice(i, 1);
    }
    render();
  });

  const animated = () => mounted && visible && !paused && motionAllowed() && !document.hidden;
  // Нажатия и мышь управляют фоном, только когда кольцо уже его: пока растворяется кольцо героя, на экране — оно
  const interactive = () => animated() && handoff >= HANDOFF_FADE;
  const sync = () => (animated() ? loop.start() : loop.stop());

  function setVisible(next) {
    if (next === visible) return;
    visible = next;
    canvas.dataset.visible = String(next);
    // скорость прокрутки и разгон не переносятся через скрытие: иначе после быстрого прыжка наверх
    // кольцо при следующем появлении ускорялось бы «старой» скоростью (QA TQ-04)
    scrollSpeed = 0;
    boost = 0;
    if (next) {
      if (motionAllowed() && handoff < 1) t = heroClock.t; // продолжаем с кадра кольца героя
      lastScroll = window.scrollY;
      place(0);
      render();
    } else setOpacity(0);
    sync();
  }

  // Передача кольца: пересчёт по прокрутке, растворение кольца героя (событие для JarvisScene), показ фона
  function updateHandoff() {
    handoff = motionAllowed() ? measureHandoff() : heroGone() ? 1 : 0;
    const fade = motionAllowed() ? clamp01(handoff / HANDOFF_FADE) : 0;
    if (fade !== heroFade) {
      heroFade = fade;
      document.dispatchEvent(new CustomEvent('scenehandoff', { detail: { progress: fade } }));
    }
    setVisible(motionAllowed() ? handoff > 0 : handoff >= 1);
  }

  // Прокрутка, когда цикл не бежит (пауза, «уменьшить движение», начало передачи): кадр по месту
  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateHandoff();
      if (!loop.running && visible) {
        place(0);
        render();
      }
    });
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ambientOpacity = readOpacity();
    updateHandoff();
    place(0);
    render();
  }

  function addEffect(kind, x, y, life) {
    if (!interactive()) return;
    if (effects.length > 12) effects.shift();
    effects.push({ kind, x, y, age: 0, life });
  }

  // Нажатие: отклик зависит от того, что нажали. «Клик» с клавиатуры (detail = 0) — от центра элемента.
  const onClick = (event) => {
    // фон скрыт или ещё не принял кольцо, пауза, «уменьшить движение» — нажатия не копят разгон и вспышку
    // (QA TQ-03, TQ-04)
    if (!interactive()) return;
    const node = event.target instanceof Element ? event.target : null;
    if (!node) return;
    const hit = node.closest('a, button, summary, [role="tab"]');
    let { clientX: x, clientY: y } = event;
    if (event.detail === 0 && hit) {
      const r = hit.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    if (node.closest('[data-contact]')) {
      boost = 5;
      flare = 1;
      addEffect('impulse', x, y, 1.4);
    } else if (node.closest('summary, [aria-expanded]')) {
      flare = Math.max(flare, 0.8);
      boost = Math.max(boost, 1.5);
      addEffect('tap', x, y, 0.9);
    } else if (hit) {
      boost = Math.max(boost, 2);
      addEffect('link', x, y, 1.1);
    } else {
      addEffect('tap', x, y, 0.9);
    }
  };

  const onInput = (event) => {
    if (!interactive() || !(event.target instanceof Element) || !event.target.closest('form')) return;
    boost = Math.max(boost, 2.5);
    if (!effects.some((e) => e.kind === 'scan')) addEffect('scan', 0, 0, 0.9);
  };

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse' || !interactive()) return;
    aimMagnet(magnet, event.clientX, event.clientY);
  };
  const onRelease = () => releaseMagnet(magnet);

  const onThemeChange = () => {
    palette = scenePalette(DEFAULT_PALETTE);
    renderer.setPalette(palette);
    ambientOpacity = readOpacity();
    place(0);
    render();
  };

  // Пауза кнопкой сцены героя: фон замирает статичным кадром (по прокрутке он всё ещё перемещается)
  const onPause = (event) => {
    paused = Boolean(event.detail?.paused);
    if (paused) {
      effects.length = 0;
      flare = 0;
      boost = 0;
      releaseMagnet(magnet);
      magnet.strength = 0;
    }
    sync();
    render();
  };

  const onReduceChange = () => {
    t = STATIC_TIME;
    effects.length = 0;
    releaseMagnet(magnet);
    magnet.strength = 0;
    heroFade = -1;
    resize();
    sync();
  };

  return {
    el: canvas,
    mount() {
      if (mounted) return;
      mounted = true;
      heroScene = document.querySelector('.hero .scene');
      heroBlock = document.querySelector('.hero .showcase');
      canvas.style.transition = 'none'; // прозрачность ведёт прокрутка — без запаздывания CSS-перехода
      resize();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', resize);
      window.addEventListener('click', onClick, { passive: true });
      document.addEventListener('input', onInput, { passive: true });
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onRelease);
      window.addEventListener('blur', onRelease);
      document.addEventListener('visibilitychange', sync);
      document.addEventListener('themechange', onThemeChange);
      document.addEventListener('scenepause', onPause);
      reduceQuery.addEventListener('change', onReduceChange);
      sync();
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      loop.stop();
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
      document.removeEventListener('input', onInput);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onRelease);
      window.removeEventListener('blur', onRelease);
      document.removeEventListener('visibilitychange', sync);
      document.removeEventListener('themechange', onThemeChange);
      document.removeEventListener('scenepause', onPause);
      reduceQuery.removeEventListener('change', onReduceChange);
      document.dispatchEvent(new CustomEvent('scenehandoff', { detail: { progress: 0 } }));
      canvas.remove();
    },
    // для проверок (?debug)
    get state() {
      return {
        visible,
        paused,
        running: loop.running,
        handoff: Math.round(handoff * 1000) / 1000,
        opacity: Number(canvas.style.opacity || 0),
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        R: Math.round(pos.R),
        effects: effects.length,
        t: Math.round(t * 100) / 100,
      };
    },
  };
}
