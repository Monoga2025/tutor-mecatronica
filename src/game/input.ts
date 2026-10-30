export interface InputState {
  forward: number; // -1..1 (↑ = +1)
  turn: number;    // -1..1 (← = +1)
  jump: boolean;
}

const ALIASES: Record<string, string> = {
  ArrowUp: 'up', KeyW: 'up', up: 'up',
  ArrowDown: 'down', KeyS: 'down', down: 'down',
  ArrowLeft: 'left', KeyA: 'left', left: 'left',
  ArrowRight: 'right', KeyD: 'right', right: 'right',
  Space: 'jump', ' ': 'jump', jump: 'jump',
};

export class Input {
  private keys = new Set<string>();
  private injected = new Set<string>();
  private touch = { forward: 0, turn: 0, jump: false };
  private touchUi: HTMLElement | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(target: Window = window) {
    const down = (e: KeyboardEvent): void => {
      const k = ALIASES[e.code] ?? ALIASES[e.key];
      if (!k) return;
      e.preventDefault();
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent): void => {
      const k = ALIASES[e.code] ?? ALIASES[e.key];
      if (k) this.keys.delete(k);
    };
    const blur = (): void => this.keys.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    this.offs.push(() => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    });
    if (matchMedia('(pointer: coarse)').matches) this.mountTouch();
  }

  setInjected(keys: Record<string, boolean>): void {
    this.injected.clear();
    for (const [name, on] of Object.entries(keys)) {
      const k = ALIASES[name];
      if (k && on) this.injected.add(k);
    }
  }

  read(): InputState {
    const has = (k: string): boolean => this.keys.has(k) || this.injected.has(k);
    const forward = (has('up') ? 1 : 0) - (has('down') ? 1 : 0) + this.touch.forward;
    const turn = (has('left') ? 1 : 0) - (has('right') ? 1 : 0) + this.touch.turn;
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    return { forward: clamp(forward), turn: clamp(turn), jump: has('jump') || this.touch.jump };
  }

  get touchVisible(): boolean { return this.touchUi !== null && !this.touchUi.hidden; }

  /** Oculta/muestra los controles táctiles (p. ej. mientras hay un módulo montado). */
  setTouchVisible(v: boolean): void {
    if (this.touchUi) this.touchUi.hidden = !v;
    if (!v) this.touch = { forward: 0, turn: 0, jump: false };
  }

  private mountTouch(): void {
    const ui = document.createElement('div');
    ui.className = 'touch-ui';
    ui.innerHTML = `<div class="stick" data-testid="joystick"><div class="knob"></div></div>
      <button class="jump-btn" data-testid="jump" aria-label="Saltar">Saltar</button>`;
    document.body.appendChild(ui);
    this.touchUi = ui;
    const stick = ui.querySelector<HTMLElement>('.stick')!;
    const knob = ui.querySelector<HTMLElement>('.knob')!;
    const btn = ui.querySelector<HTMLElement>('.jump-btn')!;
    let id: number | null = null;
    const R = 48;
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dz = (v: number): number => (Math.abs(v) < 0.18 ? 0 : v);
      this.touch.forward = dz(-dy / R);
      this.touch.turn = dz(-dx / R);
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.touch.forward = this.touch.turn = 0;
    };
    stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      move(e);
    });
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.touch.jump = true; });
    const release = (): void => { this.touch.jump = false; };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.touchUi?.remove();
    this.touchUi = null;
  }
}
