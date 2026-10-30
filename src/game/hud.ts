const CSS = `
.module-root { position: fixed; inset: 0; z-index: 12; pointer-events: none; }
.module-root > * { pointer-events: auto; }
.touch-ui { position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: system-ui, sans-serif; }
.touch-ui .stick { position: absolute; left: max(24px, env(safe-area-inset-left)); bottom: max(28px, env(safe-area-inset-bottom));
  width: 128px; height: 128px; border-radius: 50%; background: rgba(255,248,235,.28); border: 2px solid rgba(255,255,255,.7);
  pointer-events: auto; touch-action: none; box-shadow: 0 4px 14px rgba(60,40,20,.25); }
.touch-ui .knob { position: absolute; left: 34px; top: 34px; width: 60px; height: 60px; border-radius: 50%;
  background: rgba(255,255,255,.9); box-shadow: 0 2px 8px rgba(60,40,20,.35); }
.touch-ui .jump-btn { position: absolute; right: max(24px, env(safe-area-inset-right)); bottom: max(40px, env(safe-area-inset-bottom));
  width: 96px; height: 96px; border-radius: 50%; border: 2px solid rgba(255,255,255,.85); background: rgba(246,195,59,.85);
  color: #3b2a12; font-weight: 700; font-size: 18px; pointer-events: auto; touch-action: none; box-shadow: 0 4px 14px rgba(60,40,20,.3); }
.touch-ui .jump-btn:active { transform: scale(.94); }
.perf-overlay { position: fixed; top: 8px; left: 8px; z-index: 20; white-space: pre; font: 12px/1.35 ui-monospace, monospace;
  color: #fff; background: rgba(20,24,32,.72); padding: 6px 8px; border-radius: 6px; pointer-events: none; }
.notice { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); z-index: 15; max-width: min(92vw, 520px);
  font: 600 18px/1.35 system-ui, sans-serif; color: #3b2a12; background: rgba(255,246,228,.95); padding: 12px 18px;
  border-radius: 14px; box-shadow: 0 6px 20px rgba(60,40,20,.25); text-align: center; transition: opacity .25s; }
.notice[hidden] { display: block; opacity: 0; pointer-events: none; }
.notice small { display: block; font-weight: 400; font-size: 14px; color: #6b5133; }
`;

export class Hud {
  private readonly style: HTMLStyleElement;
  readonly notice: HTMLElement;
  private timer = 0;

  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.notice = document.createElement('div');
    this.notice.className = 'notice';
    this.notice.dataset.testid = 'notice';
    this.notice.setAttribute('role', 'status');
    this.notice.hidden = true;
    document.body.appendChild(this.notice);
  }

  show(title: string, detail = '', ms = 0): void {
    this.notice.innerHTML = '';
    this.notice.append(title);
    if (detail) {
      const s = document.createElement('small');
      s.textContent = detail;
      this.notice.append(s);
    }
    this.notice.hidden = false;
    clearTimeout(this.timer);
    if (ms > 0) this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    this.notice.hidden = true;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.style.remove();
    this.notice.remove();
  }
}
