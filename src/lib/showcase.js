// Логика показа карточек направлений на первом экране. Чистый модуль без DOM: таймеры передаются снаружи,
// поэтому покрыт тестами (tests/showcase.test.mjs). DOM и события — src/components/Showcase.js.
//
// Режимы: 'auto' — идёт автоматический обзор; 'done' — обзор прошёл до последней карточки и остановился;
// 'manual' — посетитель выбрал тему сам, взаимодействовал с клавиатуры или открыл подробности.
// Автосмена возобновляется только явным действием (кнопка показа).
//
// Причины остановки разделены: ручная пауза (userPaused) — решение посетителя, её не отменяет ни возврат блока
// на экран, ни возврат на вкладку; наведение (hover), открытая модалка (modal), блок вне экрана (visible) и
// неактивная вкладка (active) — временные. После любой временной остановки текущая карточка получает полный
// интервал заново — пропущенные переходы не проигрываются.
//
// Таймер всегда один: либо смена карточки, либо задержка показа при наведении на метку (пока курсор над блоком,
// автосмена всё равно стоит). Он очищается при каждом изменении состояния и в destroy().

export const ACTIONS = Object.freeze(['stop', 'resume', 'replay', 'start']);

export function createShowcase({
  count,
  interval,
  hoverDelay = 200,
  autoplay = true,
  onChange = () => {},
  onState = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let index = 0;
  let mode = autoplay ? 'auto' : 'manual';
  let toured = autoplay; // обзор уже запускался — иначе кнопка предлагает «Запустить обзор»
  let userPaused = false;
  let hover = false;
  let modal = false;
  let visible = true;
  let active = true;
  let timer = 0;
  let timerKind = null; // 'advance' | 'preview'
  let destroyed = false;

  const last = count - 1;

  function clear() {
    if (timer) clearTimer(timer);
    timer = 0;
    timerKind = null;
  }

  const canAdvance = () => mode === 'auto' && !userPaused && !hover && !modal && visible && active && !destroyed;

  function action() {
    if (userPaused) return 'resume';
    if (mode === 'auto') return 'stop';
    return toured ? 'replay' : 'start';
  }

  const snapshot = () => ({ index, mode, userPaused, hover, modal, visible, active, timer: timerKind, action: action() });

  function emit() {
    onState(snapshot());
  }

  function setIndex(next, reason) {
    const i = Math.max(0, Math.min(last, next));
    if (i === index) return;
    index = i;
    onChange(index, reason);
  }

  function schedule() {
    clear();
    // дальше последней карточки идти некуда — обзор закончен (в том числе если до неё дошли наведением)
    if (mode === 'auto' && index === last) mode = 'done';
    if (canAdvance()) {
      timerKind = 'advance';
      timer = setTimer(advance, interval);
    }
    emit();
  }

  function advance() {
    timer = 0;
    timerKind = null;
    if (index + 1 >= last) mode = 'done'; // последняя карточка остаётся на экране, обзор закончен
    setIndex(index + 1, 'auto');
    schedule();
  }

  return {
    // Выбор темы кликом, тапом или с клавиатуры — ручной режим
    select(i) {
      mode = 'manual';
      setIndex(i, 'manual');
      schedule();
    },
    // Наведение на метку: карточка темы — после короткой задержки, режим не меняется
    preview(i) {
      if (destroyed) return;
      clear();
      if (i === index) {
        emit();
        return;
      }
      timerKind = 'preview';
      timer = setTimer(() => {
        timer = 0;
        timerKind = null;
        setIndex(i, 'preview');
        emit();
      }, hoverDelay);
      emit();
    },
    cancelPreview() {
      if (timerKind !== 'preview') return;
      clear();
      schedule();
    },
    // Курсор над орбитой или карточкой — автосмена временно стоит
    setHover(on) {
      hover = Boolean(on);
      if (!hover && timerKind === 'preview') clear();
      if (hover && timerKind === 'preview') {
        emit();
        return;
      }
      schedule();
    },
    // Клавиатурный фокус внутри блока — ручной режим
    keyboard() {
      if (mode === 'manual') return;
      mode = 'manual';
      schedule();
    },
    openDetails() {
      mode = 'manual';
      modal = true;
      schedule();
    },
    closeDetails() {
      modal = false;
      schedule();
    },
    setVisible(on) {
      visible = Boolean(on);
      schedule();
    },
    setActive(on) {
      active = Boolean(on);
      schedule();
    },
    // Автопоказ недоступен («уменьшить движение», сенсорный экран) — ручной режим без таймера
    disableAutoplay() {
      mode = 'manual';
      toured = false;
      userPaused = false;
      schedule();
    },
    // Кнопка показа: «Остановить показ» / «Продолжить показ» / «Повторить обзор» / «Запустить обзор»
    toggle() {
      const act = action();
      if (act === 'resume') userPaused = false;
      else if (act === 'stop') userPaused = true;
      else {
        mode = 'auto';
        toured = true;
        setIndex(0, 'replay');
      }
      schedule();
      return act;
    },
    destroy() {
      destroyed = true;
      clear();
    },
    get state() {
      return snapshot();
    },
  };
}
