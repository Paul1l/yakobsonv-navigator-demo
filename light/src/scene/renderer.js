// Отрисовка сцены в Canvas 2D. Не трогает DOM, кроме переданного контекста.
import {
  TAU,
  SCENE,
  CORE_CONTOURS,
  createRingModel,
  createCoreModel,
  sceneMetrics,
  sideGain,
  ringWaveRaw,
  rippleEnvelope,
  rippleWave,
  voiceWave,
  tubeCenter,
  tubeHalfWidth,
  tubeOuterEdge,
  strand,
  coreCenter,
  HUD_ARCS,
  SWEEP,
} from './geometry.js';
import { coreDisplacement, ringPull } from './magnet.js';

const TEAL = '23,127,125';
const DEEP = '13,92,90';
// Нити: задняя, средняя и передняя сторона жгута
const THREAD_STYLE = [
  { alpha: 0.08, width: 0.45, color: TEAL },
  { alpha: 0.17, width: 0.55, color: TEAL },
  { alpha: 0.3, width: 0.7, color: DEEP },
];
const RIB_ALPHA = [0.06, 0.11, 0.17];
const EDGE_ALPHA = [0.05, 0.1, 0.2];
const RIB_STEPS = [0, 0.25, 0.5, 0.75, 1];
const PARTICLE_LEVELS = 6;

const depthBucket = (d) => (d < -0.35 ? 0 : d < 0.35 ? 1 : 2);

export function createRenderer(cfg = SCENE) {
  const ring = createRingModel(cfg);
  const core = createCoreModel(cfg.coreLat, cfg.coreLon);
  const S = cfg.samples;
  const C = cfg.contourSamples;
  const T = ring.threads.length;

  const angS = new Float32Array(S);
  const cosS = new Float32Array(S);
  const sinS = new Float32Array(S);
  const sideS = new Float32Array(S);
  for (let i = 0; i < S; i++) {
    const a = (i / S) * TAU;
    angS[i] = a;
    cosS[i] = Math.cos(a);
    sinS[i] = Math.sin(a);
    sideS[i] = sideGain(a);
  }
  const cosC = new Float32Array(C);
  const sinC = new Float32Array(C);
  for (let i = 0; i < C; i++) {
    cosC[i] = Math.cos((i / C) * TAU);
    sinC[i] = Math.sin((i / C) * TAU);
  }

  const center = new Float32Array(S); // ось жгута, px
  const half = new Float32Array(S); // половина толщины, px
  const envelope = new Float32Array(S); // сила ряби по краю, 0…1
  const threadXY = new Float32Array(T * S * 2);
  const threadDepth = new Float32Array(T * S);
  const particleXY = new Float32Array(ring.particles.length * 2);
  const particleBucket = new Uint8Array(ring.particles.length);
  const proj = new Float32Array(core.count * 3);
  const pull = { dr: 0, da: 0 };
  const disp = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, dist: 0, angle: 0 };
  const pos = { x: 0, y: 0 };
  const st = { across: 0, depth: 0, wobble: 0 };
  let bandGradient = null;
  let bandKey = '';

  // Точка кольца с учётом магнитного вытягивания
  function placeOnRing(theta, r, cx, cy, R, k, cos, sin) {
    let c = cos;
    let s = sin;
    if (k > 0) {
      ringPull(theta, r, mouse, R, k, pull);
      r += pull.dr;
      if (pull.da !== 0) {
        c = Math.cos(theta + pull.da);
        s = Math.sin(theta + pull.da);
      }
    }
    pos.x = cx + c * r;
    pos.y = cy + s * r;
    return pos;
  }

  // Дуга как ломаная: так её тоже локально вытягивает магнит
  function traceArc(ctx, radius, from, to, cx, cy, R, k) {
    const steps = Math.max(2, Math.ceil((to - from) / 0.03));
    for (let q = 0; q <= steps; q++) {
      const a = from + ((to - from) * q) / steps;
      const p = placeOnRing(a, R * radius, cx, cy, R, k, Math.cos(a), Math.sin(a));
      if (q === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }

  function drawArcs(ctx, arc, cx, cy, R, k, t) {
    const rot = arc.speed * t;
    ctx.beginPath();
    for (const [from, to] of arc.segments) traceArc(ctx, arc.radius, from + rot, to + rot, cx, cy, R, k);
    ctx.setLineDash(arc.dash || []);
    ctx.lineWidth = arc.width;
    ctx.strokeStyle = `rgba(${TEAL},${arc.alpha})`;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSweep(ctx, cx, cy, R, k, t) {
    const head = SWEEP.speed * t;
    const piece = SWEEP.length / SWEEP.steps;
    for (let q = 0; q < SWEEP.steps; q++) {
      const to = head - piece * q;
      ctx.beginPath();
      traceArc(ctx, SWEEP.radius, to - piece, to, cx, cy, R, k);
      ctx.lineWidth = SWEEP.width;
      ctx.strokeStyle = `rgba(${DEEP},${(SWEEP.alpha * (1 - q / SWEEP.steps)).toFixed(3)})`;
      ctx.stroke();
    }
    // мягкий ореол головы
    ctx.beginPath();
    traceArc(ctx, SWEEP.radius, head - piece * 1.5, head, cx, cy, R, k);
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(${TEAL},0.08)`;
    ctx.stroke();
  }

  function draw(ctx, { width: W, height: H, t, magnet }) {
    const { cx, cy, R, Rc } = sceneMetrics(W, H, cfg);
    const k = magnet && magnet.strength > 0.001 ? magnet.strength : 0;
    if (magnet) {
      mouse.x = magnet.x - cx;
      mouse.y = magnet.y - cy;
      mouse.dist = Math.hypot(mouse.x, mouse.y);
      mouse.angle = Math.atan2(mouse.y, mouse.x);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1. Деликатная глубина под жгутом
    const key = `${cx}|${cy}|${R}`;
    if (key !== bandKey) {
      bandKey = key;
      bandGradient = ctx.createRadialGradient(cx, cy, R * 0.68, cx, cy, R * 1.3);
      bandGradient.addColorStop(0, `rgba(${TEAL},0)`);
      bandGradient.addColorStop(0.5, `rgba(${TEAL},0.06)`);
      bandGradient.addColorStop(1, `rgba(${TEAL},0)`);
    }
    ctx.fillStyle = bandGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.3, 0, TAU);
    ctx.fill();

    // 2. Ось и толщина жгута по точкам выборки
    for (let i = 0; i < S; i++) {
      center[i] = R * (1 + cfg.globalAmp * sideS[i] * ringWaveRaw(angS[i], t, cfg.cycle));
      half[i] = R * tubeHalfWidth(angS[i], t, cfg);
      envelope[i] = rippleEnvelope(angS[i], t, cfg.cycle);
    }

    // Внутренние голографические дуги — под жгутом
    drawArcs(ctx, HUD_ARCS[0], cx, cy, R, k, t);

    // 3. Нити: витки вокруг оси жгута, глубина задаёт яркость. Рябь по краю сильнее у наружных нитей,
    // а сдвиг фазы у каждой нити даёт голографическое мерцание
    for (let n = 0; n < T; n++) {
      const th = ring.threads[n];
      for (let i = 0; i < S; i++) {
        strand(angS[i], t, cfg, th, st);
        const outer = 0.35 + 0.65 * ((st.across + 1) / 2);
        const ripple = cfg.rippleAmp * envelope[i] * outer * rippleWave(angS[i], t, cfg.cycle, th.shift);
        const r = center[i] + half[i] * st.across + R * (ripple + cfg.threadAmp * st.wobble);
        const p = placeOnRing(angS[i], r, cx, cy, R, k, cosS[i], sinS[i]);
        const j = n * S + i;
        threadXY[j * 2] = p.x;
        threadXY[j * 2 + 1] = p.y;
        threadDepth[j] = st.depth;
      }
    }

    // 4. Поперечная сетка: рёбра через жгут с лёгким наклоном, медленно вращаются
    const spin = t * 0.02;
    for (let b = 0; b < RIB_ALPHA.length; b++) {
      ctx.beginPath();
      for (const rib of ring.ribs) {
        if (rib.bucket !== b) continue;
        const a0 = rib.angle + spin;
        const c0 = R * tubeCenter(a0, t, cfg);
        const h0 = R * tubeHalfWidth(a0, t, cfg);
        for (let q = 0; q < RIB_STEPS.length; q++) {
          const u = (RIB_STEPS[q] - 0.5) * 2 * rib.reach;
          const a = a0 + rib.twist * (RIB_STEPS[q] - 0.5);
          const p = placeOnRing(a, c0 + h0 * u, cx, cy, R, k, Math.cos(a), Math.sin(a));
          if (q === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = `rgba(${TEAL},${RIB_ALPHA[b]})`;
      ctx.stroke();
    }

    // Нити: отрезки собираются в три пути по глубине; передний план ещё и с мягким свечением
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    for (let n = 0; n < T; n++) {
      let prev = -1;
      for (let i = 0; i < S; i++) {
        const a = n * S + i;
        const b = n * S + ((i + 1) % S);
        const bucket = depthBucket((threadDepth[a] + threadDepth[b]) / 2);
        const path = paths[bucket];
        if (bucket !== prev) path.moveTo(threadXY[a * 2], threadXY[a * 2 + 1]);
        path.lineTo(threadXY[b * 2], threadXY[b * 2 + 1]);
        prev = bucket;
      }
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(${TEAL},0.03)`;
    ctx.stroke(paths[2]);
    for (let b = 0; b < THREAD_STYLE.length; b++) {
      const s = THREAD_STYLE[b];
      ctx.lineWidth = s.width;
      ctx.strokeStyle = `rgba(${s.color},${s.alpha})`;
      ctx.stroke(paths[b]);
    }

    // «Голос»: тонкие радиальные штрихи от края жгута, длина — по волне и огибающей
    ctx.beginPath();
    for (let j = 0; j < cfg.bars; j++) {
      const a = (j / cfg.bars) * TAU;
      // Резкий контраст длин и пропуски коротких штрихов: волна голоса, а не шкала с делениями
      const len = cfg.barAmp * rippleEnvelope(a, t, cfg.cycle) ** 1.4 * Math.abs(voiceWave(a, t, cfg.cycle)) ** 1.6;
      if (len < 0.007) continue;
      const r0 = R * tubeOuterEdge(a, t, cfg);
      const c = Math.cos(a);
      const s = Math.sin(a);
      let p = placeOnRing(a, r0, cx, cy, R, k, c, s);
      ctx.moveTo(p.x, p.y);
      p = placeOnRing(a, r0 + R * len, cx, cy, R, k, c, s);
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = `rgba(${TEAL},0.34)`;
    ctx.stroke();

    // Наружные дуги и бегущий сканер
    drawArcs(ctx, HUD_ARCS[1], cx, cy, R, k, t);
    drawArcs(ctx, HUD_ARCS[2], cx, cy, R, k, t);
    drawSweep(ctx, cx, cy, R, k, t);

    // 5. Частицы: круглые точки, сгруппированные по прозрачности — несколько заливок вместо 520
    for (let i = 0; i < ring.particles.length; i++) {
      const pt = ring.particles[i];
      const a = pt.angle + pt.speed * t;
      const r = R * (tubeCenter(a, t, cfg) + tubeHalfWidth(a, t, cfg) * pt.across);
      const p = placeOnRing(a, r, cx, cy, R, k, Math.cos(a), Math.sin(a));
      particleXY[i * 2] = p.x;
      particleXY[i * 2 + 1] = p.y;
      const alpha = pt.alpha * (0.55 + 0.45 * Math.sin(t * pt.twinkle + pt.phase));
      particleBucket[i] = Math.min(PARTICLE_LEVELS - 1, Math.floor(alpha * PARTICLE_LEVELS * 1.6));
    }
    ctx.fillStyle = `rgb(${TEAL})`;
    for (let b = 0; b < PARTICLE_LEVELS; b++) {
      ctx.beginPath();
      for (let i = 0; i < ring.particles.length; i++) {
        if (particleBucket[i] !== b) continue;
        const x = particleXY[i * 2];
        const y = particleXY[i * 2 + 1];
        const radius = ring.particles[i].size / 2;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.globalAlpha = (b + 0.5) / (PARTICLE_LEVELS * 1.6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 6. Ядро и тонкие контуры вокруг него
    const cc = coreCenter(cx, cy, Rc, t);
    const mx = magnet ? magnet.x - cc.x : 0;
    const my = magnet ? magnet.y - cc.y : 0;
    const w = TAU / cfg.cycle;

    for (const ct of CORE_CONTOURS) {
      ctx.beginPath();
      for (let i = 0; i <= C; i++) {
        const ii = i % C;
        const a = (ii / C) * TAU;
        const rr = Rc * ct.ratio * (1 + ct.wobble * Math.sin(3 * a + ct.dir * w * t + ct.phase));
        let px = cosC[ii] * rr;
        let py = sinC[ii] * rr;
        if (k > 0) {
          coreDisplacement(px, py, mx, my, Rc, k, t, disp);
          px += disp.x * ct.falloff;
          py += disp.y * ct.falloff;
        }
        if (i === 0) ctx.moveTo(cc.x + px, cc.y + py);
        else ctx.lineTo(cc.x + px, cc.y + py);
      }
      ctx.setLineDash(ct.dash || []);
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = `rgba(${TEAL},${ct.alpha})`;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const ay = t * 0.21;
    const ax = 0.42 + 0.06 * Math.sin(t * 0.17);
    const cya = Math.cos(ay);
    const sya = Math.sin(ay);
    const cxa = Math.cos(ax);
    const sxa = Math.sin(ax);
    const P = core.points;
    for (let i = 0; i < core.count; i++) {
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      const x1 = x * cya + z * sya;
      const z1 = -x * sya + z * cya;
      const y2 = y * cxa - z1 * sxa;
      const z2 = y * sxa + z1 * cxa; // > 0 — ближе к зрителю
      const persp = 1 + z2 * 0.1;
      let px = x1 * Rc * persp;
      let py = y2 * Rc * persp;
      if (k > 0) {
        coreDisplacement(px, py, mx, my, Rc, k, t, disp);
        px += disp.x;
        py += disp.y;
      }
      proj[i * 3] = cc.x + px;
      proj[i * 3 + 1] = cc.y + py;
      proj[i * 3 + 2] = z2;
    }

    const volume = ctx.createRadialGradient(cc.x - Rc * 0.32, cc.y - Rc * 0.36, Rc * 0.08, cc.x, cc.y, Rc * 1.1);
    volume.addColorStop(0, `rgba(${TEAL},0.1)`);
    volume.addColorStop(0.65, `rgba(${TEAL},0.04)`);
    volume.addColorStop(1, `rgba(${TEAL},0)`);
    ctx.fillStyle = volume;
    ctx.beginPath();
    ctx.arc(cc.x, cc.y, Rc * 1.1, 0, TAU);
    ctx.fill();

    const E = core.edges;
    for (let b = 0; b < EDGE_ALPHA.length; b++) {
      ctx.beginPath();
      for (let e = 0; e < E.length; e += 2) {
        const i = E[e] * 3;
        const j = E[e + 1] * 3;
        if (depthBucket((proj[i + 2] + proj[j + 2]) * 0.5) !== b) continue;
        ctx.moveTo(proj[i], proj[i + 1]);
        ctx.lineTo(proj[j], proj[j + 1]);
      }
      ctx.lineWidth = b === 2 ? 0.7 : 0.55;
      ctx.strokeStyle = `rgba(${b === 2 ? DEEP : TEAL},${EDGE_ALPHA[b]})`;
      ctx.stroke();
    }

    // Точки ядра — круглые, три уровня глубины
    ctx.fillStyle = `rgb(${DEEP})`;
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      for (let i = 0; i < core.count; i++) {
        const z = proj[i * 3 + 2];
        if (depthBucket(z) !== b) continue;
        const radius = 0.55 + ((z + 1) / 2) * 0.6;
        const x = proj[i * 3];
        const y = proj[i * 3 + 1];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.globalAlpha = [0.18, 0.36, 0.62][b];
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Для проверки: смещение четырёх точек края ядра при текущем состоянии магнита
  function probeCore({ width: W, height: H, t, magnet }) {
    const { cx, cy, Rc } = sceneMetrics(W, H, cfg);
    const cc = coreCenter(cx, cy, Rc, t);
    const k = magnet.strength;
    const mx = magnet.x - cc.x;
    const my = magnet.y - cc.y;
    const sides = { right: [Rc, 0], left: [-Rc, 0], top: [0, -Rc], bottom: [0, Rc] };
    const result = { Rc: round(Rc), strength: round(k) };
    for (const [name, [px, py]] of Object.entries(sides)) {
      coreDisplacement(px, py, mx, my, Rc, k, t, disp);
      result[name] = round(Math.hypot(disp.x, disp.y));
    }
    return result;
  }

  return { draw, probeCore, metrics: (W, H) => sceneMetrics(W, H, cfg), stats: { edges: core.edges.length / 2 } };
}

const round = (v) => Math.round(v * 100) / 100;
