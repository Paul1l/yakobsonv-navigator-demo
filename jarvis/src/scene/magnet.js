// Магнитное поле сцены. Чистые функции — покрыты тестами.

export const MAGNET = Object.freeze({
  mouseRate: 7, // сглаживание координат мыши, 1/с
  riseRate: 7, // нарастание силы, 1/с
  fallRate: 4, // затухание силы после ухода курсора, 1/с
  coreGain: 0.24, // × Rc
  coreReach: 1.4, // × Rc: ближе — притяжение ослабевает до нуля
  waveMin: 0.52,
  waveMax: 1,
  waveSpeed: 2.6, // рад/с
  waveFreq: 3, // волн по окружности ядра
});

export const RING_PULL = Object.freeze({
  sigma: 0.4, // ширина «вытягивания» по углу, рад
  reach: 0.6, // × R: насколько далеко от пояса курсор ещё действует
  coreFade0: 0.22, // × R: курсор у самого ядра не тянет кольцо
  coreFade1: 0.5,
  radialGain: 0.5,
  max: 0.13, // × R: предел смещения — кольцо не выходит за сцену
  pinch: 0.22, // стягивание точек по углу к курсору
});

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Экспоненциальное приближение к цели со скоростью rate (1/с); не зависит от частоты кадров
export const expApproach = (current, target, rate, dt) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

/**
 * Локальное притяжение края ядра к курсору.
 * px, py — точка относительно центра ядра; mx, my — курсор относительно центра ядра.
 * Тянется только сторона, обращённая к курсору; противоположный край и середина почти неподвижны.
 */
export function coreDisplacement(px, py, mx, my, Rc, strength, t, out = { x: 0, y: 0 }) {
  out.x = 0;
  out.y = 0;
  if (!(strength > 0) || !(Rc > 0)) return out;
  const md = Math.hypot(mx, my);
  if (md < 1e-6) return out; // курсор в центре: направления нет, делить не на что
  const pl = Math.hypot(px, py);
  if (pl < 1e-6) return out;
  const dx = mx / md;
  const dy = my / md;
  const facing = (px * dx + py * dy) / pl;
  if (facing <= 0) return out;
  const radial = Math.min(pl / Rc, 1);
  const weight = facing ** 4 * radial ** 3;
  const mid = (MAGNET.waveMax + MAGNET.waveMin) / 2;
  const amp = (MAGNET.waveMax - MAGNET.waveMin) / 2;
  const wave = mid + amp * Math.sin(t * MAGNET.waveSpeed + Math.atan2(py, px) * MAGNET.waveFreq);
  const distanceFactor = Math.min(md / (MAGNET.coreReach * Rc), 1);
  const k = MAGNET.coreGain * Rc * strength * distanceFactor * weight * wave;
  out.x = dx * k;
  out.y = dy * k;
  return out;
}

/**
 * Вытягивание внешнего кольца к курсору: радиальный сдвиг dr (px) и угловой da (рад).
 * mouse — { x, y, dist, angle } относительно центра кольца.
 */
export function ringPull(theta, r, mouse, R, strength, out = { dr: 0, da: 0 }) {
  out.dr = 0;
  out.da = 0;
  if (!(strength > 0) || !(mouse.dist > 1e-6)) return out;
  let d = theta - mouse.angle;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; // −π…π
  const angular = Math.exp(-(d * d) / (2 * RING_PULL.sigma * RING_PULL.sigma));
  if (angular < 1e-3) return out;
  const x = (mouse.dist - R) / (RING_PULL.reach * R);
  const reach = Math.exp(-x * x);
  const fade = smoothstep(RING_PULL.coreFade0 * R, RING_PULL.coreFade1 * R, mouse.dist);
  const w = angular * reach * fade * strength;
  const max = RING_PULL.max * R;
  out.dr = clamp((mouse.dist - r) * RING_PULL.radialGain, -max, max) * w;
  out.da = -d * RING_PULL.pinch * w;
  return out;
}

export function createMagnetState() {
  return { x: 0, y: 0, tx: 0, ty: 0, strength: 0, target: 0 };
}

// Курсор вошёл в сцену: если притяжения ещё нет, сглаженная точка не «едет» через всю сцену
export function aimMagnet(state, x, y) {
  state.tx = x;
  state.ty = y;
  if (state.strength < 0.02) {
    state.x = x;
    state.y = y;
  }
  state.target = 1;
}

export function releaseMagnet(state) {
  state.target = 0;
}

export function stepMagnet(state, dt) {
  const rate = state.target > state.strength ? MAGNET.riseRate : MAGNET.fallRate;
  state.strength = expApproach(state.strength, state.target, rate, dt);
  if (state.target === 0 && state.strength < 1e-4) state.strength = 0;
  state.x = expApproach(state.x, state.tx, MAGNET.mouseRate, dt);
  state.y = expApproach(state.y, state.ty, MAGNET.mouseRate, dt);
  return state;
}
