// Цикл анимации на requestAnimationFrame с ограничением частоты кадров.
// Повторный start() не создаёт второй цикл; зависимости среды можно подменить в тестах.
export function createLoop(onFrame, {
  fps = 30,
  maxDt = 0.1,
  raf = (cb) => window.requestAnimationFrame(cb),
  caf = (id) => window.cancelAnimationFrame(id),
} = {}) {
  const interval = 1000 / fps;
  let id = 0;
  let running = false;
  let last = -1;

  function tick(now) {
    if (!running) return;
    id = raf(tick);
    if (last < 0) {
      last = now;
      onFrame(0);
      return;
    }
    const elapsed = now - last;
    if (elapsed < interval - 1) return; // допуск 1 мс под 60 Гц
    // Выравнивание по сетке кадров; кадр в пределах допуска считается «ровно вовремя»
    const excess = elapsed % interval;
    last = now - (excess > interval - 1 ? 0 : excess);
    onFrame(Math.min(elapsed / 1000, maxDt));
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = -1;
      id = raf(tick);
    },
    stop() {
      if (!running) return;
      running = false;
      caf(id);
      id = 0;
    },
    get running() {
      return running;
    },
  };
}
