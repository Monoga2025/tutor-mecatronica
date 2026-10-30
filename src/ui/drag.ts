/** Arrastre con Pointer Events (ratón, lápiz y dedo). Suelta sobre el elemento [data-slot] bajo el puntero. */
export interface DragOpts {
  payload: string;
  onDrop(slot: string, payload: string): void;
  onTap?(payload: string): void;
}

const THRESHOLD = 6;

export function makeDraggable(el: HTMLElement, opts: DragOpts): () => void {
  el.style.touchAction = 'none';
  let start: { x: number; y: number; id: number } | null = null;
  let ghost: HTMLElement | null = null;
  let hover: Element | null = null;

  const slotAt = (x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y);
    return (hit?.closest('[data-slot]') as HTMLElement | null) ?? null;
  };
  const setHover = (s: Element | null): void => {
    if (s === hover) return;
    hover?.classList.remove('drop-hover');
    hover = s;
    hover?.classList.add('drop-hover');
  };
  const down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const move = (e: PointerEvent): void => {
    if (!start || e.pointerId !== start.id) return;
    if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > THRESHOLD) {
      ghost = el.cloneNode(true) as HTMLElement;
      ghost.classList.add('drag-ghost');
      document.body.appendChild(ghost);
      document.body.classList.add('dragging');
    }
    if (ghost) {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      setHover(slotAt(e.clientX, e.clientY));
    }
  };
  const up = (e: PointerEvent): void => {
    if (!start || e.pointerId !== start.id) return;
    const wasDrag = !!ghost;
    ghost?.remove();
    ghost = null;
    document.body.classList.remove('dragging');
    setHover(null);
    start = null;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (wasDrag) {
      const s = slotAt(e.clientX, e.clientY);
      if (s?.dataset.slot) opts.onDrop(s.dataset.slot, opts.payload);
    } else opts.onTap?.(opts.payload);
  };
  const cancel = (): void => { ghost?.remove(); ghost = null; start = null; setHover(null); document.body.classList.remove('dragging'); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    cancel();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}
