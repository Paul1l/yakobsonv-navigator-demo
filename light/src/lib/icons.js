const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

export const icons = {
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', ' class="btn__arrow"'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  menu: svg('<path d="M4 8h16M4 16h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>', ' stroke-width="2.2"'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z"/>', ' stroke-width="1.9"'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.2"'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  telegram: svg('<path d="m21 4-3 16-6.5-5.5L8 18l.5-5L18 6l-11 6.5L3 11z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>'),
};
