import { el } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { createModal } from '../lib/modal.js';
import { ContactForm } from './ContactForm.js';

// Диалог обращения: открывается из шапки, первого экрана, решений, кейсов и цен.
export function ContactDialog() {
  let root = null;
  const form = ContactForm({ idPrefix: 'dialog', isVisible: () => Boolean(root?.open) });
  root = el(`
    <dialog class="modal" aria-labelledby="dialog-title" aria-describedby="dialog-context">
      <div class="modal__panel">
        <button class="icon-btn modal__close" type="button" data-close aria-label="Закрыть">${icons.close}</button>
        <div class="modal__head">
          <p class="eyebrow">Обсудить проект</p>
          <h2 class="modal__title" id="dialog-title">Оставьте контакт — обсудим задачу</h2>
          <p class="modal__context" id="dialog-context"></p>
        </div>
        <div data-slot="form"></div>
      </div>
    </dialog>
  `);
  root.querySelector('[data-slot="form"]').append(form.el);
  const contextLine = root.querySelector('#dialog-context');

  const modal = createModal(root, { initialFocus: () => form.firstField() });

  const onClick = (event) => {
    if (event.target.closest('[data-close]')) modal.close();
  };

  return {
    el: root,
    open({ task, source, context } = {}, trigger) {
      form.setPreset({ task, source, context });
      contextLine.textContent = context || 'Ответ в течение 24 часов в будни. Можно без готового сайта.';
      modal.open(trigger);
    },
    close: () => modal.close(),
    mount() {
      root.addEventListener('click', onClick);
      form.mount();
    },
    destroy() {
      root.removeEventListener('click', onClick);
      form.destroy();
      modal.destroy();
    },
  };
}
