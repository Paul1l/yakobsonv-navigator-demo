// Сервис обращений.
// В рабочем проекте здесь подключается существующий API заявок и его антиспам: адрес — в endpoint,
// формат ответа — { ok: true, id } при подтверждённом приёме. Успех показывается только после
// разбора настоящего ответа сервера.
// В прототипе API нет: endpoint = null → демо-режим, данные никуда не отправляются.
export const LEADS_CONFIG = {
  endpoint: null,
  timeoutMs: 15000,
};

export const leadMode = () => (LEADS_CONFIG.endpoint ? 'live' : 'demo');

export class LeadError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'LeadError';
    this.code = code;
  }
}

export async function submitLead(payload) {
  if (leadMode() === 'demo') return demoSubmit();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEADS_CONFIG.timeoutMs);
  try {
    const response = await fetch(LEADS_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok || body?.ok !== true) {
      throw new LeadError(response.ok ? 'rejected' : `http-${response.status}`, body?.error);
    }
    return { ok: true, demo: false, id: body.id ?? null };
  } catch (error) {
    if (error instanceof LeadError) throw error;
    if (error?.name === 'AbortError') throw new LeadError('timeout');
    throw new LeadError('network');
  } finally {
    clearTimeout(timer);
  }
}

// Демо: имитирует ожидание ответа. ?lead=error в адресе показывает состояние ошибки.
function demoSubmit() {
  const simulateError = new URLSearchParams(window.location.search).get('lead') === 'error';
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (simulateError) reject(new LeadError('demo-error'));
      else resolve({ ok: true, demo: true, id: null });
    }, 1100);
  });
}
