import { el, esc } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { validateLead } from '../lib/validate.js';
import { submitLead, leadMode } from '../services/leads.js';
import { contact, site } from '../data/content.js';

const ERRORS = {
  timeout: 'Сервер долго не отвечает. Данные остались в форме — попробуйте ещё раз или напишите в Telegram.',
  'demo-error': 'ДЕМО · имитация ошибки сервера. Данные остались в форме — попробуйте ещё раз или напишите в Telegram.',
  default: 'Не удалось отправить заявку. Данные остались в форме — попробуйте ещё раз или напишите в Telegram.',
};

/**
 * Форма обращения: задача, контакт для ответа, необязательный сайт (можно без сайта).
 * Успех показывается только после ответа сервиса; в прототипе сервис явно сообщает,
 * что данные никуда не отправлены.
 */
export function ContactForm({ idPrefix, isVisible = () => true }) {
  const id = (name) => `${idPrefix}-${name}`;
  const demo = leadMode() === 'demo';
  const consent = site.privacyHref
    ? `с <a href="${esc(site.privacyHref)}">политикой обработки персональных данных</a>`
    : 'с политикой обработки персональных данных';

  const root = el(`
    <div class="lead">
      <form class="lead-form" novalidate>
        <fieldset class="field" id="${id('task-field')}" aria-describedby="${id('task-error')}">
          <legend class="field__label">Что нужно</legend>
          <div class="chips">
            ${contact.tasks
              .map(
                (t) => `<label class="chip"><input type="radio" name="task" value="${t.value}"><span>${esc(t.label)}</span></label>`,
              )
              .join('')}
          </div>
          <p class="field__error" id="${id('task-error')}" hidden></p>
        </fieldset>

        <div class="field">
          <label class="field__label" for="${id('contact')}">Контакт для ответа</label>
          <input class="input" id="${id('contact')}" name="contact" type="text" autocomplete="off"
            spellcheck="false" placeholder="@username или +7 900 000-00-00"
            aria-describedby="${id('contact-hint')} ${id('contact-error')}" aria-required="true">
          <p class="field__hint" id="${id('contact-hint')}">Telegram, телефон или email — как вам удобнее.</p>
          <p class="field__error" id="${id('contact-error')}" hidden></p>
        </div>

        <div class="field">
          <label class="field__label" for="${id('url')}">Адрес сайта<span class="field__optional">необязательно</span></label>
          <input class="input" id="${id('url')}" name="url" type="text" inputmode="url" autocomplete="url"
            spellcheck="false" placeholder="example.ru" aria-describedby="${id('url-error')}">
          <label class="check"><input type="checkbox" name="noSite"><span>Сайта пока нет</span></label>
          <p class="field__error" id="${id('url-error')}" hidden></p>
        </div>

        <div class="hp" aria-hidden="true">
          <label>Не заполняйте это поле <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>

        ${demo ? '<p class="lead-form__demo">ДЕМО · В прототипе форма проверяет данные, но никуда их не отправляет.</p>' : ''}
        <div class="lead-form__alert" role="alert" data-alert></div>

        <button class="btn btn--primary btn--block lead-form__submit" type="submit">
          <span data-submit-label>Отправить заявку</span>${icons.arrow}<span class="spinner" aria-hidden="true"></span>
        </button>
        <p class="lead-form__consent">Нажимая «Отправить заявку», вы соглашаетесь ${consent}.</p>
      </form>

      <div class="lead-success" tabindex="-1" hidden>
        <span class="lead-success__icon" aria-hidden="true">${icons.check}</span>
        <p class="lead-success__title" data-success-title></p>
        <p class="lead-success__text" data-success-text></p>
        <div class="lead-success__links">
          <a href="${site.telegram.href}" target="_blank" rel="noopener">Telegram ${esc(site.telegram.label)}</a>
          <a href="mailto:${site.email}">${esc(site.email)}</a>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" data-again>Заполнить ещё раз</button>
      </div>
    </div>
  `);

  const form = root.querySelector('form');
  const submit = form.querySelector('.lead-form__submit');
  const submitLabel = form.querySelector('[data-submit-label]');
  const alertBox = form.querySelector('[data-alert]');
  const success = root.querySelector('.lead-success');
  const urlInput = form.elements.url;
  const noSite = form.elements.noSite;

  let state = 'idle';
  let resultSeen = true; // успех, пришедший при закрытом диалоге, показываем при следующем открытии
  let source = 'contact';
  let context = '';
  let startedAt = Date.now();

  function setFieldError(name, message) {
    const error = root.querySelector(`#${id(`${name}-error`)}`);
    error.textContent = message || '';
    error.hidden = !message;
    if (name === 'task') {
      root.querySelector(`#${id('task-field')}`).classList.toggle('field--invalid', Boolean(message));
    } else {
      form.elements[name].setAttribute('aria-invalid', String(Boolean(message)));
    }
  }

  function clearErrors() {
    ['task', 'contact', 'url'].forEach((name) => setFieldError(name, ''));
    alertBox.textContent = '';
  }

  // aria-disabled вместо disabled: кнопка остаётся в фокусе, повторную отправку блокирует state
  function setBusy(busy) {
    state = busy ? 'submitting' : 'idle';
    submit.setAttribute('aria-disabled', String(busy));
    submit.setAttribute('aria-busy', String(busy));
    submitLabel.textContent = busy ? 'Отправляем…' : 'Отправить заявку';
  }

  function showSuccess(result) {
    state = 'success';
    resultSeen = isVisible();
    root.querySelector('[data-success-title]').textContent = result.demo
      ? 'Данные проверены — но не отправлены'
      : 'Заявка принята';
    root.querySelector('[data-success-text]').textContent = result.demo
      ? 'Это прототип: сервер не подключён, поэтому заявка никуда не ушла. Чтобы связаться сейчас, напишите в Telegram или на почту.'
      : `${result.id ? `Номер обращения: ${result.id}. ` : ''}Владислав ответит в течение 24 часов в будни.`;
    form.hidden = true;
    success.hidden = false;
    success.focus();
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (state === 'submitting') return; // защита от двойной отправки
    clearErrors();
    const result = validateLead({
      task: form.elements.task.value,
      contact: form.elements.contact.value,
      url: urlInput.value,
      noSite: noSite.checked,
    });
    if (!result.ok) {
      Object.entries(result.errors).forEach(([name, message]) => setFieldError(name, message));
      const first = ['task', 'contact', 'url'].find((name) => result.errors[name]);
      if (first === 'task') form.querySelector('input[name="task"]').focus();
      else form.elements[first].focus();
      return;
    }
    setBusy(true);
    try {
      const response = await submitLead({
        ...result.data,
        source,
        context,
        page: window.location.pathname,
        website: form.elements.website.value, // ловушка для ботов — проверяет сервер
        fillMs: Date.now() - startedAt,
      });
      setBusy(false);
      showSuccess(response);
    } catch (error) {
      setBusy(false);
      alertBox.textContent = ERRORS[error?.code] || ERRORS.default;
    }
  }

  function reset() {
    form.reset();
    clearErrors();
    urlInput.disabled = false;
    setBusy(false);
    form.hidden = false;
    success.hidden = true;
    startedAt = Date.now();
  }

  const onNoSite = () => {
    urlInput.disabled = noSite.checked;
    if (noSite.checked) setFieldError('url', '');
  };

  const onInput = (event) => {
    const name = event.target.name;
    if (name === 'task' || name === 'contact' || name === 'url') setFieldError(name, '');
  };

  const onAgain = (event) => {
    if (!event.target.closest('[data-again]')) return;
    reset();
    form.querySelector('input[name="task"]').focus();
  };

  return {
    el: root,
    get state() {
      return state;
    },
    setPreset({ task, source: from, context: note } = {}) {
      // Идёт отправка или её итог ещё не видели — форму не трогаем, человек увидит результат
      if (state === 'submitting' || (state === 'success' && !resultSeen)) {
        resultSeen = true;
        return;
      }
      if (state === 'success') reset();
      source = from || 'contact';
      context = note || '';
      const radio = task ? form.querySelector(`input[name="task"][value="${task}"]`) : null;
      if (radio) {
        radio.checked = true;
        setFieldError('task', '');
      }
    },
    firstField() {
      if (state === 'success') return success;
      if (state === 'submitting') return submit;
      return form.elements.task.value ? form.elements.contact : form.querySelector('input[name="task"]');
    },
    reset,
    mount() {
      form.addEventListener('submit', onSubmit);
      form.addEventListener('input', onInput);
      noSite.addEventListener('change', onNoSite);
      success.addEventListener('click', onAgain);
    },
    destroy() {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onInput);
      noSite.removeEventListener('change', onNoSite);
      success.removeEventListener('click', onAgain);
    },
  };
}
