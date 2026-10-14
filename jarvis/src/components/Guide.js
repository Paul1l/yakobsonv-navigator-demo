import { guide as config } from '../data/guide.js';

/**
 * Джарвис-гид: при прокрутке фоновое кольцо (AmbientScene) перелетает к активному разделу, зависает в его точке
 * (.guide-dock — положение задаёт CSS) и «произносит» пояснительный текст раздела: записка .guide-note
 * переходит idle → speaking → said, слова проявляются по очереди (CSS). Прочитанное остаётся на месте.
 *
 * - Активная остановка — записка, ближайшая к «линии внимания» (guide.focusLine высоты окна), среди тех, что
 *   на экране; переключение с запасом, чтобы на границе не дёргалось. Если на экране есть ещё не сказанная
 *   записка (видна хотя бы на 60 %), кольцо, договорив текущую, летит к ней (QA GQ-01).
 * - Страховка: записка, которая видна на экране guide.fallbackDelay мс, а кольцо до неё так и не долетело
 *   (ещё уходит с первого экрана, высокий экран сразу после загрузки), проявляется сама (QA GQ-02).
 * - Текст — обычный HTML: без JS, при «уменьшить движение» и на паузе показа виден сразу (класс html.guide-on
 *   ставится только когда гид работает; на паузе всё сказанное и несказанное показывается).
 * - Прокрутку не перехватывает; положение текста к прокрутке не привязано — он стоит в своём разделе.
 * Сцене отдаёт target() — точку и радиус кольца, и получает arrived(id), когда кольцо долетело.
 */
export function Guide() {
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let notes = [];
  let active = null; // текущая остановка: { id, note, dock }
  let paused = false;
  let mounted = false;
  let saidTimer = 0;
  let observer = null;
  const fallbackTimers = new Map(); // записка → таймер страховки, пока она видна

  const enabled = () => mounted && !reduceQuery.matches && !paused;

  function setState(note, state) {
    if (note.dataset.state !== state) note.dataset.state = state;
  }

  // Все записки — сразу текстом (пауза показа): прочитанное не прячется обратно и после продолжения
  function revealAll() {
    clearTimeout(saidTimer);
    notes.forEach(({ note }) => setState(note, 'said'));
  }

  // «Речь»: слова проявляются (CSS), после последнего — said. Если в этот момент ещё договаривается другая
  // записка, она сразу дописывается до конца — таймер конца речи один
  function speak(item) {
    if (!item || item.note.dataset.state !== 'idle' || !enabled()) return;
    const previous = notes.find((n) => n !== item && n.note.dataset.state === 'speaking');
    if (previous) setState(previous.note, 'said');
    setState(item.note, 'speaking');
    const words = item.note.querySelectorAll('.guide-w').length;
    clearTimeout(saidTimer);
    saidTimer = setTimeout(() => setState(item.note, 'said'), words * config.wordDelay + 600);
  }

  const headerH = () => document.querySelector('.site-header')?.offsetHeight ?? 0;

  // Доля записки, видимая в окне ниже шапки (под стеклянной шапкой текст не читается)
  function visibleShare(r, H) {
    if (!r.height) return 0;
    return Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, headerH())) / r.height;
  }

  function applyMode() {
    root.classList.toggle('guide-on', enabled());
    if (!enabled()) revealAll();
  }

  // Записка, ближайшая к линии внимания, среди тех, что на экране (с запасом в четверть окна).
  // Договаривающая — остаётся активной, пока на экране; видимая несказанная — важнее уже сказанной
  function pickActive() {
    const H = window.innerHeight;
    const line = H * config.focusLine;
    let best = null;
    let bestDist = Infinity;
    let unsaid = null;
    let unsaidDist = Infinity;
    if (active?.note.dataset.state === 'speaking' && visibleShare(active.note.getBoundingClientRect(), H) > 0.3) return active;
    for (const item of notes) {
      const r = item.note.getBoundingClientRect();
      // записку проскроллили выше окна, а кольцо так и не долетело — текст показывается целиком,
      // чтобы при возврате не остался полупрозрачным
      if (r.bottom < 0 && item.note.dataset.state === 'idle') setState(item.note, 'said');
      if (r.bottom < -H * 0.25 || r.top > H * 1.25 || !r.height) continue;
      const d = Math.abs(r.top + r.height / 2 - line);
      if (d < bestDist) {
        best = item;
        bestDist = d;
      }
      if (item.note.dataset.state === 'idle' && visibleShare(r, H) >= 0.6 && d < unsaidDist) {
        unsaid = item;
        unsaidDist = d;
      }
    }
    if (unsaid) return unsaid;
    // Договорив, кольцо остаётся у своей записки, пока она на экране и другая не стала заметно ближе к линии
    // внимания (на пятую часть окна) — без перелётов туда-обратно
    if (active && best && best !== active) {
      const r = active.note.getBoundingClientRect();
      const cur = Math.abs(r.top + r.height / 2 - line);
      if (visibleShare(r, H) >= 0.3 && cur - bestDist < H * 0.2) return active;
    }
    return best;
  }

  // Кнопка показа на первом экране: пауза — гид не летает, весь текст виден
  const onPause = (event) => {
    paused = Boolean(event.detail?.paused);
    applyMode();
  };

  return {
    mount() {
      if (mounted) return;
      mounted = true;
      notes = [...document.querySelectorAll('[data-guide-stop]')].map((note) => ({
        id: note.dataset.guideStop,
        note,
        dock: note.querySelector('.guide-dock'),
      }));
      applyMode();
      reduceQuery.addEventListener('change', applyMode);
      document.addEventListener('scenepause', onPause);
      // страховка от «призраков»: видимая записка, до которой кольцо не добралось, проявляется сама
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const item = notes.find((n) => n.note === entry.target);
            clearTimeout(fallbackTimers.get(item));
            fallbackTimers.delete(item);
            if (entry.intersectionRatio >= 0.6) {
              fallbackTimers.set(item, setTimeout(() => speak(item), config.fallbackDelay));
            }
          }
        },
        { threshold: [0, 0.6], rootMargin: `-${headerH()}px 0px 0px 0px` },
      );
      notes.forEach(({ note }) => observer.observe(note));
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      clearTimeout(saidTimer);
      observer?.disconnect();
      fallbackTimers.forEach((t) => clearTimeout(t));
      fallbackTimers.clear();
      root.classList.remove('guide-on');
      reduceQuery.removeEventListener('change', applyMode);
      document.removeEventListener('scenepause', onPause);
    },
    // Куда лететь кольцу сейчас: центр и радиус по .guide-dock активной остановки (координаты окна).
    // null — ни одной остановки на экране (первый экран, подвал): сцена ведёт кольцо по своей траектории.
    target() {
      if (!enabled() || !notes.length) return null;
      active = pickActive();
      if (!active?.dock) return null;
      const d = active.dock.getBoundingClientRect();
      if (!d.width) {
        // у остановки нет точки для кольца (раскладка без неё) — текст сразу целиком
        if (active.note.dataset.state === 'idle') setState(active.note, 'said');
        return null;
      }
      return { id: active.id, x: d.left + d.width / 2, y: d.top + d.height / 2, R: d.width / 2 / 1.3 };
    },
    // Кольцо долетело до остановки — записка «произносится» один раз
    arrived(id) {
      speak(notes.find((n) => n.id === id));
    },
    get arriveRatio() {
      return config.arriveRatio;
    },
    // для проверок (?debug)
    get state() {
      return {
        enabled: enabled(),
        active: active?.id ?? null,
        notes: Object.fromEntries(notes.map((n) => [n.id, n.note.dataset.state])),
      };
    },
  };
}
