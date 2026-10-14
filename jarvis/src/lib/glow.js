// Подсветка карточек .glow под курсором: одна делегированная подписка, не чаще кадра, только мышь.
export function attachGlow(root) {
  let frame = 0;
  let last = null;

  const apply = () => {
    frame = 0;
    const card = last?.target instanceof Element ? last.target.closest('.glow') : null;
    if (!card || !root.contains(card)) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${last.clientX - rect.left}px`);
    card.style.setProperty('--my', `${last.clientY - rect.top}px`);
  };

  const onMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    last = event;
    if (!frame) frame = requestAnimationFrame(apply);
  };

  root.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    root.removeEventListener('pointermove', onMove);
    cancelAnimationFrame(frame);
  };
}
