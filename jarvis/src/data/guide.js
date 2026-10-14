// Джарвис-гид: остановки на странице и текст, который кольцо «произносит» у каждой.
// Это пояснительные абзацы разделов — на странице их больше нет отдельным текстом: при прокрутке кольцо
// перелетает к разделу и текст проявляется из него. Тексты берутся из content.js (один источник правды);
// порядок остановок — порядок разделов на странице.
import { statement, solutions, cases, processSteps, cabinet, pricing, contact } from './content.js';

export const guide = {
  // Доля высоты окна, на которой «линия внимания»: активна остановка, чья записка ближе всего к ней
  focusLine: 0.42,
  // Кольцо считается долетевшим, когда до точки остановки меньше этой доли его радиуса
  arriveRatio: 0.18,
  // Пауза между словами при проявлении, мс (дублирует CSS transition-delay — для расчёта конца речи)
  wordDelay: 40,
  // Страховка: если записка видна на экране столько, а кольцо до неё не добралось, она проявляется сама, мс
  fallbackDelay: 1800,
};

export const stops = [
  { id: 'statement', text: statement.text },
  { id: 'solutions', text: solutions.lead },
  { id: 'cases', text: cases.lead },
  { id: 'process', text: processSteps.lead },
  { id: 'cabinet', text: cabinet.lead },
  { id: 'pricing', text: pricing.lead },
  { id: 'contact', text: contact.lead },
];
