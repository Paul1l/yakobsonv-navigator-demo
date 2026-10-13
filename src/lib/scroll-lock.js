// Счётчик блокировок: меню закрывается, диалог открывается — прокрутка остаётся заблокированной.
let locks = 0;

export function lockScroll() {
  if (locks++ === 0) document.documentElement.classList.add('is-locked');
}

export function unlockScroll() {
  if (locks === 0) return;
  if (--locks === 0) document.documentElement.classList.remove('is-locked');
}
