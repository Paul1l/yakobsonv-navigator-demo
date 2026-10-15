// Джарвис-гид: положение гида и раскрытие текста задаёт прокрутка (geometry.js — чистые функции).
//
// Плавность. Прокрутка колесом идёт шагами (~100 px), и прямая привязка к scrollY давала рывки. Поэтому анимация
// идёт по «сглаженной прокрутке»: значение каждый кадр догоняет настоящий scrollY с экспоненциальным сглаживанием
// (SMOOTH, не зависит от частоты кадров); когда догнало — цикл останавливается. Анимируются только transform и
// opacity (без filter: blur — он перерисовывал каждый кадр), значения пишутся в стиль, только если изменились;
// кольца гида — отдельные слои, их вращает видеокарта (CSS). Таймеров нет: только requestAnimationFrame.
import { createStations, stationProgress, sampleGuide, packetState, routePath } from './geometry.js';
import { createDetails } from './details.js';

const SMOOTH = 9; // 1/с: чем больше, тем быстрее сглаженная прокрутка догоняет настоящую (≈ 110 мс)
const PACKET_SMOOTH = 7; // 1/с: догон фазы блока текста — минимум ~0,3 с на появление даже при рывке прокрутки
const root = document.documentElement;
const journey = document.getElementById('journey');
const guide = document.getElementById('guide');
const scenes = [...document.querySelectorAll('[data-scene]')];
const packetElements = [...document.querySelectorAll('[data-packet]')];
const navLinks = [...document.querySelectorAll('[data-step]')];
const routeSvg = document.getElementById('journey-track');
const route = document.getElementById('route-path');
const raySvg = document.getElementById('connections');
const caption = document.getElementById('guide-caption-text');
const position = document.getElementById('journey-position');
const motionButton = document.getElementById('motion-toggle');
const themeButton = document.getElementById('theme-toggle');
const dialog = document.getElementById('detail-dialog');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const svgNS = 'http://www.w3.org/2000/svg';
const captions = ['Джарвис · ваш гид', '01 · Создаём основу', '02 · Находим клиентов', '03 · Освобождаем время', '04 · Ваша задача'];

let motionEnabled = !reduceMotion.matches;
let stations = [];
let packets = [];
let guideSize = 360;
let activeScene = -1;
let smoothY = window.scrollY; // сглаженная прокрутка — по ней идёт анимация
let lastFrame = 0;
let loop = 0;
let lastPower = '';
let measureFrame = 0;
let lastGuide = '';
let lastTravel = null;

const svgElement = (tag, attrs) => {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

// Положение элемента внутри .journey (без transform — по offset*)
function layoutBox(element) {
  let left = 0;
  let top = 0;
  let node = element;
  while (node && node !== journey) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent;
  }
  return { left, top, width: element.offsetWidth, height: element.offsetHeight };
}

// Деления внешнего кольца и сетчатое ядро гида (кольца — отдельные слои SVG в разметке)
function buildOrb() {
  const ticks = document.getElementById('orb-ticks');
  for (let i = 0; i < 96; i++) {
    const a = (i * Math.PI) / 48;
    const inner = i % 8 === 0 ? 184 : 188;
    ticks.append(svgElement('line', { x1: 200 + Math.cos(a) * inner, y1: 200 + Math.sin(a) * inner, x2: 200 + Math.cos(a) * 192, y2: 200 + Math.sin(a) * 192, opacity: i % 8 === 0 ? 0.8 : 0.38 }));
  }
  const globe = document.getElementById('orb-core');
  const project = (lat, lon) => {
    const r = 53;
    const x = r * Math.cos(lat) * Math.sin(lon);
    const y = r * Math.sin(lat);
    const tilt = 0.28;
    return { x: 200 + x * Math.cos(tilt) - y * Math.sin(tilt), y: 200 + x * Math.sin(tilt) + y * Math.cos(tilt) };
  };
  const rad = (d) => (d * Math.PI) / 180;
  for (let lat = -60; lat <= 60; lat += 20) {
    let d = '';
    for (let lon = 0; lon <= 360; lon += 5) {
      const p = project(rad(lat), rad(lon));
      d += `${lon ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
    }
    globe.append(svgElement('path', { d, opacity: 0.3 }));
  }
  for (let lon = 0; lon < 180; lon += 22.5) {
    let d = '';
    for (let lat = -90; lat <= 270; lat += 5) {
      const p = project(rad(lat), rad(lon));
      d += `${lat === -90 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
    }
    globe.append(svgElement('path', { d, opacity: 0.4 }));
  }
  for (let lat = -60; lat <= 60; lat += 20) {
    for (let lon = -90; lon <= 90; lon += 30) {
      const p = project(rad(lat), rad(lon));
      globe.append(svgElement('circle', { cx: p.x, cy: p.y, r: 1.25, fill: 'currentColor', stroke: 'none', opacity: 0.8 }));
    }
  }
  globe.append(svgElement('circle', { cx: 200, cy: 200, r: 53, opacity: 0.22 }));
}

// Все размеры и точки маршрута — один раз на изменение раскладки (не в кадре анимации)
function measure() {
  const journeyTop = journey.getBoundingClientRect().top + window.scrollY;
  const width = journey.clientWidth;
  const height = journey.offsetHeight;
  const mobile = width <= 640;
  guideSize = guide.offsetWidth;
  const points = scenes.map((scene, index) => {
    const box = layoutBox(scene.querySelector('.guide-anchor'));
    return { x: box.left, y: box.top, scale: index === 0 ? 1 : mobile ? 0.76 : index === 4 ? 0.78 : 0.68 };
  });
  // предел прокрутки: последний раздел обязан раскрыться полностью, даже если страница кончается раньше
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  stations = createStations(points, window.innerHeight, journeyTop, maxScroll);
  for (const svg of [routeSvg, raySvg]) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
  }
  route.setAttribute('d', routePath(points));
  raySvg.replaceChildren();
  const first = !packets.length;
  // фазы блоков сохраняются: ресайз (например, адресная строка телефона) не сбивает плавный вылет
  const phases = new Map(packets.map((packet) => [packet.el, packet.phase]));
  packets = packetElements.map((el) => {
    const scene = el.closest('[data-scene]');
    const index = scenes.indexOf(scene);
    // трансформ не влияет на offset*, поэтому мерить можно в любом состоянии
    const box = layoutBox(el);
    const source = points[index];
    const originX = source.x < box.left + box.width / 2 ? 0 : 1;
    const originY = mobile ? 0 : 0.5;
    const target = { x: box.left + box.width * originX, y: box.top + box.height * originY };
    el.style.transformOrigin = `${originX * 100}% ${originY * 100}%`;
    const line = svgElement('path', {});
    const dot = svgElement('circle', { r: 2 });
    raySvg.append(line, dot);
    return { el, index, order: Number(el.dataset.packet), source, target, line, dot, last: null, lastRay: -1, phase: phases.get(el) ?? null, clickable: null };
  });
  activeScene = -1;
  lastGuide = '';
  if (first || !motionEnabled) render(motionEnabled ? smoothY : window.scrollY);
  else requestRender();
}

function setActive(current) {
  if (current === activeScene) return;
  activeScene = current;
  caption.textContent = captions[motionEnabled ? current : 0];
  navLinks.forEach((link) => {
    if (link.dataset.step === scenes[current].id) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  });
  position.replaceChildren(document.createTextNode(`${String(current + 1).padStart(2, '0')} `));
  const total = document.createElement('span');
  total.textContent = `/ ${String(scenes.length).padStart(2, '0')}`;
  position.append(total);
}

function render(y, dt = 0) {
  if (!stations.length) return;
  const p = motionEnabled ? sampleGuide(stations, y) : stations[0];
  const transform = `translate3d(${(p.x - guideSize / 2).toFixed(1)}px,${(p.y - guideSize / 2).toFixed(1)}px,0) scale(${p.scale.toFixed(4)})`;
  if (transform !== lastGuide) {
    guide.style.transform = transform;
    lastGuide = transform;
  }
  guide.classList.add('is-ready');
  // подпись гида — у остановки; в перелёте скрыта (на телефоне ложилась бы на заголовки)
  const travelling = motionEnabled && p.phase === 0 && p.index > 0;
  if (travelling !== lastTravel) {
    guide.classList.toggle('is-travelling', travelling);
    lastTravel = travelling;
  }

  let current = p.index;
  if (!motionEnabled) {
    current = 0;
    for (let i = 1; i < stations.length; i++) if (window.scrollY >= stations[i].arrival) current = i;
  }
  setActive(current);

  let power = 0;
  let busy = false;
  for (const packet of packets) {
    const focused = packet.el.contains(document.activeElement);
    const goal = motionEnabled && !focused ? stationProgress(stations[packet.index], y) : 1;
    // Блок догоняет свою фазу по времени (PACKET_SMOOTH): при резкой прокрутке текст не «телепортируется»,
    // а выезжает за ~0,3 с; назад — так же плавно. Без dt (замер, переключение анимации) — сразу на место.
    if (dt && packet.phase !== null) {
      packet.phase += (goal - packet.phase) * (1 - Math.exp(-PACKET_SMOOTH * dt));
      if (Math.abs(goal - packet.phase) < 0.002) packet.phase = goal;
    } else packet.phase = goal;
    if (packet.phase !== goal) busy = true;
    const state = packetState(packet.phase, packet.order, packet.source, packet.target);
    if (motionEnabled && packet.index === p.index) power = Math.max(power, state.energy);
    const rounded = Math.round(state.progress * 1000) / 1000;
    if (packet.last !== rounded) {
      packet.last = rounded;
      packet.el.style.transform = rounded >= 1 ? 'none' : `translate3d(${state.dx.toFixed(1)}px,${state.dy.toFixed(1)}px,0) scale(${state.scale.toFixed(4)})`;
      packet.el.style.opacity = rounded >= 1 ? '1' : state.opacity.toFixed(3); // '1', не '': в CSS до запуска блок скрыт (.js .text-packet)
    }
    // клики отключены, только пока блок действительно в полёте: если прокрутка уже «сказала» раскрыться
    // до конца, кнопки нажимаются сразу, не дожидаясь, пока сглаживание догонит (иначе — «мёртвый клик»)
    const clickable = rounded >= 0.98 || packetState(goal, packet.order, packet.source, packet.target).progress >= 0.98;
    if (clickable !== packet.clickable) {
      packet.el.classList.toggle('is-emitting', !clickable);
      packet.clickable = clickable;
    }
    // луч от центра гида к блоку, пока он вылетает
    const emitting = motionEnabled && state.progress > 0 && state.progress < 1;
    const rayOpacity = emitting ? state.energy * 0.28 : 0;
    if (rayOpacity !== packet.lastRay) {
      packet.line.style.opacity = rayOpacity.toFixed(3);
      packet.dot.style.opacity = (rayOpacity * 2).toFixed(3);
      packet.lastRay = rayOpacity;
    }
    if (emitting) {
      const end = { x: packet.target.x + state.dx, y: packet.target.y + state.dy };
      const a = packet.source;
      const midX = (a.x + end.x) / 2;
      packet.line.setAttribute('d', `M ${a.x} ${a.y} C ${midX} ${a.y} ${midX} ${end.y} ${end.x} ${end.y}`);
      packet.dot.setAttribute('cx', end.x.toFixed(1));
      packet.dot.setAttribute('cy', end.y.toFixed(1));
    }
  }
  const powerText = power.toFixed(3);
  if (powerText !== lastPower) {
    guide.style.setProperty('--emission-power', powerText);
    lastPower = powerText;
  }
  return busy;
}

// Цикл сглаживания: работает, пока сглаженная прокрутка не догнала настоящую и блоки текста не встали на место
function frame(now) {
  const target = window.scrollY;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  smoothY += (target - smoothY) * (1 - Math.exp(-SMOOTH * dt));
  if (Math.abs(target - smoothY) < 0.5) smoothY = target;
  const busy = render(smoothY, dt);
  loop = smoothY === target && !busy ? 0 : requestAnimationFrame(frame);
}

function requestRender() {
  if (!motionEnabled) {
    smoothY = window.scrollY;
    render(smoothY);
    return;
  }
  if (loop) return;
  lastFrame = performance.now();
  loop = requestAnimationFrame(frame);
}

function requestMeasure() {
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(measure);
}

function applyMotion() {
  activeScene = -1;
  root.classList.toggle('motion-off', !motionEnabled);
  root.classList.toggle('motion-opt-in', motionEnabled && reduceMotion.matches);
  motionButton.setAttribute('aria-pressed', String(motionEnabled));
  motionButton.querySelector('.motion-icon').textContent = motionEnabled ? 'Ⅱ' : '▷';
  motionButton.querySelector('.motion-label').textContent = motionEnabled ? 'Без анимации' : 'Включить гида';
  packets.forEach((packet) => {
    packet.last = null;
    packet.phase = null;
    packet.lastRay = -1;
  });
  smoothY = window.scrollY;
  render(smoothY);
}

// Переход к сцене: в конец её раскрытия (текст уже на месте) или в начало (кнопка «Начать знакомство»)
function goTo(id, { start = false, instant = false } = {}) {
  const index = scenes.findIndex((scene) => scene.id === id);
  if (index < 0 || !stations.length) return false;
  const station = stations[index];
  const top = index === 0 ? 0 : start && motionEnabled ? station.arrival + (station.departure - station.arrival) * 0.1 : station.departure;
  window.scrollTo({ top: Math.max(0, top), behavior: instant || !motionEnabled ? 'instant' : 'smooth' });
  if (instant) {
    smoothY = Math.max(0, top);
    requestRender();
  }
  return true;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = link.getAttribute('href').slice(1);
  if (goTo(id, { start: link.hasAttribute('data-tour-start') })) {
    event.preventDefault();
    history.replaceState(null, '', `#${id}`);
  }
});

// Интерактивные попапы направлений
const details = createDetails(dialog, {
  onContact: () => {
    goTo('contact');
    history.replaceState(null, '', '#contact');
    const target = document.getElementById('contact-title');
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  },
});
dialog.addEventListener('close', requestMeasure);
document.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => details.open(button.dataset.topic, button)));

// С клавиатуры детали доступны без прокрутки: фокус на ссылке блока сразу раскрывает его сцену
document.addEventListener('focusin', (event) => {
  const packet = event.target.closest?.('[data-packet]');
  if (packet && motionEnabled && event.target.matches('a,button')) {
    const index = scenes.indexOf(packet.closest('[data-scene]'));
    if (stationProgress(stations[index], window.scrollY) < 1) goTo(scenes[index].id, { instant: true });
  }
  requestRender();
});
document.addEventListener('focusout', requestRender);

motionButton.addEventListener('click', () => {
  motionEnabled = !motionEnabled;
  applyMotion();
});
reduceMotion.addEventListener('change', () => {
  motionEnabled = !reduceMotion.matches;
  applyMotion();
});

function setTheme(dark) {
  root.dataset.theme = dark ? 'dark' : 'light';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0e0d0b' : '#f5f5f0');
}
themeButton.addEventListener('click', () => {
  const dark = root.dataset.theme !== 'dark';
  setTheme(dark);
  try {
    localStorage.setItem('yakobson-jarvis-theme', dark ? 'dark' : 'light');
  } catch {
    /* без хранилища тема живёт до перезагрузки */
  }
});
try {
  if (localStorage.getItem('yakobson-jarvis-theme') === 'dark') setTheme(true);
} catch {
  /* приватный режим */
}

window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', requestMeasure, { passive: true });
window.addEventListener('hashchange', () => goTo(location.hash.slice(1), { instant: true }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestMeasure();
});
new ResizeObserver(requestMeasure).observe(journey);

buildOrb();
applyMotion();
measure();
document.fonts.ready.then(() => {
  measure();
  if (location.hash) goTo(location.hash.slice(1), { instant: true });
});

// для проверок: состояние без побочных эффектов
window.__guide = {
  get state() {
    return { smoothY: Math.round(smoothY), scrollY: Math.round(window.scrollY), looping: Boolean(loop), active: activeScene, motion: motionEnabled, details: details.current, tab: details.tab };
  },
};
