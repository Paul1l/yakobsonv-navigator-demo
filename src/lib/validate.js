// Проверка формы обращения. Чистые функции — используются формой и тестами.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM = /^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/|@)([a-z][a-z0-9_]{4,31})\/?$/i;
const PHONE_CHARS = /^\+?[\d\s()\-.]+$/;

export function classifyContact(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Укажите, как с вами связаться: Telegram, телефон или email.' };
  if (EMAIL.test(value)) return { ok: true, kind: 'email', value };
  const tg = value.match(TELEGRAM);
  if (tg) return { ok: true, kind: 'telegram', value: `@${tg[1]}` };
  const digits = value.replace(/\D/g, '');
  if (PHONE_CHARS.test(value) && digits.length >= 10 && digits.length <= 15) {
    return { ok: true, kind: 'phone', value };
  }
  return { ok: false, error: 'Не похоже на контакт. Укажите Telegram (@имя), телефон или email.' };
}

export function normalizeSiteUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: true, value: '' };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, error: 'Проверьте адрес сайта, например: example.ru' };
  }
  // Кириллические домены URL переводит в punycode, поэтому достаточно проверить точку в имени
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) {
    return { ok: false, error: 'Проверьте адрес сайта, например: example.ru' };
  }
  return { ok: true, value: url.href };
}

export function validateLead({ task, contact, url, noSite }) {
  const errors = {};
  if (!task) errors.task = 'Выберите задачу — или «Пока не знаю».';
  const c = classifyContact(contact);
  if (!c.ok) errors.contact = c.error;
  const site = noSite ? { ok: true, value: '' } : normalizeSiteUrl(url);
  if (!site.ok) errors.url = site.error;
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    data: ok
      ? { task, contact: c.value, contactKind: c.kind, url: site.value, noSite: Boolean(noSite) }
      : null,
  };
}
