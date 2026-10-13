// Геометрия сцены: жгут из нитей, поперечные рёбра, частицы, сетчатое ядро.
// Модуль чистый (без DOM) — используется отрисовкой и тестами.

export const TAU = Math.PI * 2;

export const SCENE = Object.freeze({
  ringRatio: 0.34, // R = 0.34 × min(ширина, высота)
  coreRatio: 0.245, // Rc = 0.245 × R
  threads: 24,
  ribs: 140,
  particles: 520,
  coreLat: 11, // ядро: 11 параллелей × 18 меридианов = 198 точек
  coreLon: 18,
  cycle: 8.4, // основной визуальный цикл, с; частоты волн кратны 2π/cycle
  band: 0.12, // толщина жгута, доли R
  globalAmp: 0.022, // медленное «дыхание» формы, доли R — кольцо почти круглое
  rippleAmp: 0.034, // волны по краю жгута, доли R
  threadAmp: 0.008, // собственная неровность нити, доли R
  twist: 3, // витков нитей вокруг жгута за оборот кольца
  bars: 180, // штрихи «голосового» кольца
  barAmp: 0.09, // наибольшая длина штриха, доли R
  samples: 240, // точек на нить: хватает на мелкую рябь
  contourSamples: 120,
});

// Голографические дуги вокруг жгута: радиус в R, скорость вращения рад/с, сегменты [начало, конец] в рад.
// Без делений, чисел и подписей — только тонкие дуги и пунктирная орбита.
export const HUD_ARCS = Object.freeze([
  {
    radius: 0.84, speed: -0.17, width: 0.7, alpha: 0.24,
    segments: [[0.3, 1.45], [2.15, 2.55], [3.3, 4.7], [5.25, 5.75]],
  },
  {
    radius: 1.19, speed: 0.11, width: 1, alpha: 0.3,
    segments: [[0, 0.62], [0.82, 0.98], [1.32, 2.3], [2.5, 2.6], [3.05, 3.5], [3.85, 4.95], [5.25, 5.55]],
  },
  { radius: 1.25, speed: -0.05, width: 0.8, alpha: 0.24, dash: [1, 5], segments: [[0, TAU]] },
]);

// Бегущий «сканер» по внешней дуге: яркая голова и затухающий хвост
export const SWEEP = Object.freeze({ radius: 1.19, speed: 0.55, length: 0.5, steps: 6, alpha: 0.62, width: 1.5 });

// Тонкие контуры вокруг ядра: радиус в Rc, доля магнитного смещения, прозрачность
export const CORE_CONTOURS = Object.freeze([
  { ratio: 1.36, falloff: 0.9, alpha: 0.22, wobble: 0.012, dir: 1, phase: 0.4, dash: null },
  { ratio: 1.7, falloff: 0.7, alpha: 0.15, wobble: 0.016, dir: -1, phase: 2.1, dash: null },
  { ratio: 2.06, falloff: 0.5, alpha: 0.12, wobble: 0.02, dir: 1, phase: 4.2, dash: [2, 5] },
]);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sceneMetrics(width, height, cfg = SCENE) {
  const R = cfg.ringRatio * Math.min(width, height);
  return { cx: width / 2, cy: height / 2, R, Rc: cfg.coreRatio * R };
}

// Усиление по бокам: 0.5 сверху и снизу, 1 слева и справа
export const sideGain = (theta) => 0.5 + 0.5 * Math.abs(Math.cos(theta)) ** 1.6;

// Медленное «дыхание» формы без бокового множителя
export function ringWaveRaw(theta, t, cycle) {
  const w = TAU / cycle;
  return 0.6 * Math.sin(2 * theta + w * t) + 0.4 * Math.sin(3 * theta - w * t + 1.3);
}

export const ringWave = (theta, t, cycle) => sideGain(theta) * ringWaveRaw(theta, t, cycle);

// Огибающая ряби: пакеты волн бегут по кругу, по бокам сильнее; 0…1
export function rippleEnvelope(theta, t, cycle) {
  const w = TAU / cycle;
  const e = 0.5 + 0.5 * Math.sin(2 * theta - w * t);
  return sideGain(theta) * (0.3 + 0.7 * e * e);
}

// Рябь по краю: несколько гармоник с разными фазами и направлениями; shift — сдвиг фазы нити
export function rippleWave(theta, t, cycle, shift = 0) {
  const w = TAU / cycle;
  return (
    0.5 * Math.sin(10 * theta + 3 * w * t + shift) +
    0.3 * Math.sin(15 * theta - 4 * w * t + 1.1 + shift * 0.6) +
    0.2 * Math.sin(6 * theta + 2 * w * t + 2.3)
  );
}

// «Голос»: мелкая быстрая волна для штрихов вокруг жгута, |…| ≤ 1
export function voiceWave(theta, t, cycle) {
  const w = TAU / cycle;
  return 0.6 * Math.sin(16 * theta + 5 * w * t) + 0.4 * Math.sin(27 * theta - 3 * w * t + 0.7);
}

// Радиус оси жгута, доли R
export const tubeCenter = (theta, t, cfg = SCENE) => 1 + cfg.globalAmp * ringWave(theta, t, cfg.cycle);

// Половина толщины жгута, доли R: жгут то утолщается, то сужается — объём
export function tubeHalfWidth(theta, t, cfg = SCENE) {
  const w = TAU / cfg.cycle;
  return (cfg.band / 2) * (0.8 + 0.3 * Math.sin(2 * theta - w * t + 0.7)) * (0.85 + 0.15 * sideGain(theta));
}

// Положение нити поперёк жгута: across ∈ [−1, 1], depth ∈ [−1, 1] (1 — ближе к зрителю)
export function strand(theta, t, cfg, thread, out) {
  const w = TAU / cfg.cycle;
  const a = thread.phase + cfg.twist * theta + thread.dir * w * t;
  out.across = Math.cos(a);
  out.depth = Math.sin(a);
  out.wobble = thread.amp * Math.sin(5 * theta + thread.dir * w * t + thread.p1);
  return out;
}

function gaussian(rnd) {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
}

export function createRingModel(cfg = SCENE, seed = 20261009) {
  const rnd = mulberry32(seed);

  const threads = Array.from({ length: cfg.threads }, (_, i) => ({
    phase: (i / cfg.threads) * TAU + (rnd() - 0.5) * 0.2,
    dir: i % 2 === 0 ? 1 : -1, // половина нитей закручена навстречу — переплетение
    amp: 0.4 + rnd() * 0.9,
    p1: rnd() * TAU,
    shift: (i / cfg.threads) * 1.4 + (rnd() - 0.5) * 0.3, // сдвиг фазы ряби — мерцание нитей
  }));

  const ribs = Array.from({ length: cfg.ribs }, (_, j) => ({
    angle: (j / cfg.ribs) * TAU + (rnd() - 0.5) * 0.012,
    twist: 0.03 + rnd() * 0.05, // наклон ребра поперёк жгута, рад
    reach: 0.75 + rnd() * 0.25, // доля толщины жгута
    bucket: rnd() < 0.55 ? 0 : rnd() < 0.7 ? 1 : 2, // группа прозрачности
  }));

  const particles = Array.from({ length: cfg.particles }, () => ({
    angle: rnd() * TAU,
    across: Math.max(-1.6, Math.min(1.6, gaussian(rnd) * 0.7)), // в толщинах жгута, часть — снаружи
    speed: (rnd() - 0.5) * 0.05 + (rnd() < 0.5 ? 0.015 : -0.015), // рад/с
    size: 0.7 + rnd() ** 2 * 1.3,
    alpha: 0.14 + rnd() * 0.5,
    twinkle: 0.6 + rnd() * 1.6,
    phase: rnd() * TAU,
  }));

  return { threads, ribs, particles };
}

// Ядро: точки на параллелях и меридианах сферы, связи вдоль них — сетчатый глобус
export function createCoreModel(lat = SCENE.coreLat, lon = SCENE.coreLon) {
  const count = lat * lon;
  const points = new Float32Array(count * 3);
  for (let a = 0; a < lat; a++) {
    const phi = -Math.PI / 2 + (Math.PI * (a + 1)) / (lat + 1);
    const y = Math.sin(phi);
    const r = Math.cos(phi);
    for (let b = 0; b < lon; b++) {
      const lambda = (TAU * b) / lon;
      const i = (a * lon + b) * 3;
      points[i] = Math.cos(lambda) * r;
      points[i + 1] = y;
      points[i + 2] = Math.sin(lambda) * r;
    }
  }
  const edges = [];
  for (let a = 0; a < lat; a++) {
    for (let b = 0; b < lon; b++) {
      const i = a * lon + b;
      edges.push(i, a * lon + ((b + 1) % lon)); // вдоль параллели
      if (a + 1 < lat) edges.push(i, (a + 1) * lon + b); // вдоль меридиана
    }
  }
  return { count, points, edges: Uint16Array.from(edges) };
}

// Центр ядра медленно дрейфует на 2–3 px (на маленькой сцене — пропорционально меньше)
export function coreCenter(cx, cy, Rc, t) {
  const drift = Math.min(2.6, Math.max(1.4, Rc * 0.058));
  return { x: cx + Math.sin(t * 0.37) * drift, y: cy + Math.cos(t * 0.29) * drift * 0.85 };
}

// Наружный край ряби жгута, доли R: отсюда растут штрихи «голоса»
export const tubeOuterEdge = (theta, t, cfg = SCENE) =>
  tubeCenter(theta, t, cfg) + tubeHalfWidth(theta, t, cfg) + cfg.rippleAmp * rippleEnvelope(theta, t, cfg.cycle) + 0.02;

// Наибольший радиус сцены без магнита, доли R — для проверки, что ничего не обрезается
export function ringOuterBound(cfg = SCENE) {
  const halfMax = (cfg.band / 2) * 1.1;
  const tube = 1 + cfg.globalAmp + halfMax * 1.6 + cfg.rippleAmp + cfg.threadAmp * 1.3;
  const bars = 1 + cfg.globalAmp + halfMax + cfg.rippleAmp + 0.02 + cfg.barAmp;
  const arcs = Math.max(...HUD_ARCS.map((a) => a.radius), SWEEP.radius);
  return Math.max(tube, bars, arcs);
}
