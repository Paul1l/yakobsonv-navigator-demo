import { lockScroll, unlockScroll } from './scroll-lock.js';
import { prefersReducedMotion } from './dom.js';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const visible = (node) => node.getClientRects().length > 0;

/**
 * Общая логика модальных окон на <dialog>: Escape, клик по подложке, удержание фокуса,
 * блокировка прокрутки и возврат фокуса на кнопку, которая открыла окно.
 */
export function createModal(dialog, { onOpen, onClose, initialFocus } = {}) {
  let returnTo = null;
  let restoreFocus = true;
  let timer = 0;
  let pending = null;
  let settle = null; // завершает текущее анимированное закрытие

  function open(trigger) {
    if (dialog.open) return;
    returnTo = trigger instanceof HTMLElement ? trigger : document.activeElement;
    restoreFocus = true;
    dialog.showModal();
    lockScroll();
    void dialog.offsetWidth; // стартовое состояние перехода
    dialog.classList.add('is-open');
    const target = initialFocus?.() || dialog.querySelector('[data-autofocus]') || dialog.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
    onOpen?.();
  }

  function close({ restoreFocus: restore = true } = {}) {
    if (!dialog.open) return Promise.resolve();
    if (pending) return pending;
    restoreFocus = restore;
    dialog.classList.remove('is-open');
    const panel = dialog.firstElementChild;
    if (prefersReducedMotion() || !panel) {
      dialog.close();
      return Promise.resolve();
    }
    pending = new Promise((resolve) => {
      const onEnd = (event) => {
        if (event.target === panel) finish();
      };
      const finish = () => {
        if (settle !== finish) return; // уже завершено (в том числе системным закрытием)
        settle = null;
        clearTimeout(timer);
        panel?.removeEventListener('transitionend', onEnd);
        pending = null;
        if (dialog.open) dialog.close();
        resolve();
      };
      settle = finish;
      panel.addEventListener('transitionend', onEnd);
      timer = setTimeout(finish, 360);
    });
    return pending;
  }

  const handleCancel = (event) => {
    event.preventDefault();
    close();
  };

  // Клик по подложке: событие приходит на сам <dialog>, панель занимает всё его тело
  const handleClick = (event) => {
    if (event.target === dialog) close();
  };

  const handleKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const nodes = [...dialog.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Срабатывает при любом закрытии, в том числе системном: Chrome при частых Esc закрывает
  // <dialog> без cancel — тогда незавершённое анимированное закрытие нужно погасить здесь,
  // иначе его обработчик transitionend закроет окно при следующем открытии.
  const handleClose = () => {
    settle?.();
    clearTimeout(timer);
    dialog.classList.remove('is-open');
    unlockScroll();
    if (restoreFocus && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    returnTo = null;
    onClose?.();
  };

  dialog.addEventListener('cancel', handleCancel);
  dialog.addEventListener('click', handleClick);
  dialog.addEventListener('keydown', handleKeydown);
  dialog.addEventListener('close', handleClose);

  return {
    open,
    close,
    get isOpen() {
      return dialog.open;
    },
    destroy() {
      settle?.();
      clearTimeout(timer);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
      dialog.removeEventListener('keydown', handleKeydown);
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) {
        dialog.close();
      }
    },
  };
}
