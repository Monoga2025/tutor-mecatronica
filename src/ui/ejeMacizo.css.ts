export const EJE_CSS = `
.em { --bg: #fff8ee; --ink: #33261a; --mute: #7a6450; --line: #e6d5bf; --acc: #e0882b; --ok: #2f8f4e; --bad: #c4392f; --blue: #2f6fd6;
  font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--ink); }
.em * { box-sizing: border-box; }
.em-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 42vw); background: var(--bg);
  box-shadow: -6px 0 24px rgba(60,40,20,.18); display: flex; flex-direction: column; z-index: 13; }
.em-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: #fbefdc; }
.em-head h2 { font-size: 17px; margin: 0; flex: 1; }
.em-body { overflow-y: auto; padding: 10px 14px 24px; flex: 1; overscroll-behavior: contain; }
.em-toggle { display: none; }
.em button { font: inherit; border-radius: 10px; border: 1px solid #d9c3a5; background: #fff; color: var(--ink); padding: 7px 11px; cursor: pointer;
  min-height: 38px; touch-action: manipulation; }
.em button:hover:not(:disabled) { border-color: var(--acc); }
.em button:disabled { opacity: .45; cursor: default; }
.em button.sel { background: #ffe1b8; border-color: var(--acc); font-weight: 600; }
.em button.primary { background: var(--acc); border-color: #c06b16; color: #fff; font-weight: 700; }
.em button.pulse { animation: em-pulse 1.2s infinite; }
@keyframes em-pulse { 50% { box-shadow: 0 0 0 5px rgba(224,136,43,.35); } }
.em section { margin: 12px 0; }
.em h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--mute); margin: 0 0 6px; }
.em-enun-sec { position: sticky; top: -10px; z-index: 3; background: var(--bg); margin-top: -10px; padding: 10px 0 4px; }
.em-enun { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; line-height: 2.05; }
.ficha { display: inline-flex; align-items: center; gap: 4px; padding: 1px 9px; margin: 0 2px; border-radius: 999px; background: #ffe9c7;
  border: 1.5px solid #e7a85a; cursor: grab; user-select: none; -webkit-user-select: none; white-space: nowrap; font-weight: 600; line-height: 1.6; }
.ficha.picked { outline: 3px solid var(--blue); }
.ficha.usada { background: #eef4ff; border-color: #8fb0e8; }
.drag-ghost { position: fixed; z-index: 100; pointer-events: none; transform: translate(-50%, -120%) scale(1.08); box-shadow: 0 8px 20px rgba(0,0,0,.25); }
body.dragging, body.dragging * { cursor: grabbing !important; }
.em-bank { display: grid; gap: 6px; }
.em-bank button { text-align: left; overflow-x: auto; padding: 6px 10px; }
.em-formula { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; overflow-x: auto; text-align: center; }
.em-formula .katex-display { margin: .3em 0; }
.em [data-slot] { cursor: copy; }
.em .slotbox { display: inline-block; border-radius: 6px; padding: 0 2px; background: #fff3e0; outline: 2px dashed #e7a85a; }
.em .slotbox.lleno { background: #eaf7ee; outline: 2px solid #6bbf84; }
.drop-hover, .em .slotbox.drop-hover { outline: 3px solid var(--blue) !important; background: #e3eeff !important; }
.em-slots { display: grid; gap: 8px; margin-top: 8px; }
.em-slot { border: 1px solid var(--line); border-radius: 12px; padding: 8px; background: #fff; }
.em-slot .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.em-slot .drop { flex: 1; min-width: 120px; min-height: 40px; border: 2px dashed #e7a85a; border-radius: 10px; display: flex; align-items: center;
  padding: 2px 8px; color: var(--mute); background: #fffaf2; }
.em-slot .drop.lleno { border-style: solid; border-color: #6bbf84; color: var(--ink); background: #f3fbf5; }
.em-slot .need { font-size: 13px; color: var(--mute); }
.em-slot .ops { margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap; align-items: center; font-size: 13px; }
.em-slot .ops button { min-height: 32px; padding: 3px 8px; font-size: 13px; }
.em-slot .res { font-size: 13px; color: var(--blue); margin-left: auto; }
.em-choices { display: flex; gap: 6px; flex-wrap: wrap; }
.em-msg { color: var(--bad); font-weight: 600; min-height: 1.2em; }
.em-steps ol { margin: 0; padding-left: 20px; }
.em-steps li { margin: 4px 0; }
.em-steps .val { color: var(--blue); }
.em-card { border-radius: 12px; padding: 10px 12px; border: 1px solid var(--line); background: #fff; }
.em-card.ok { border-color: #8fd0a2; background: #f1fbf4; }
.em-card.bad { border-color: #eaa49c; background: #fff3f1; }
.em-card h4 { margin: 0 0 4px; font-size: 17px; }
.em table { border-collapse: collapse; width: 100%; font-size: 13px; margin: 6px 0; }
.em td, .em th { border-bottom: 1px solid var(--line); padding: 4px; text-align: left; vertical-align: middle; }
.em td.x { color: var(--bad); font-weight: 700; } .em td.v { color: var(--ok); font-weight: 700; }
.em-hints li { margin: 4px 0; }
.em-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.em-view { position: fixed; pointer-events: none; z-index: 12; }
.em-hud { position: absolute; left: 10px; top: 10px; background: rgba(255,248,238,.92); border-radius: 12px; padding: 8px 10px; font-size: 13px;
  box-shadow: 0 4px 14px rgba(60,40,20,.18); max-width: min(340px, 70%); }
.em-hud b { font-size: 14px; }
.em-exag { display: inline-block; background: #33261a; color: #ffd9a0; border-radius: 6px; padding: 0 6px; font-weight: 700; }
.em-legend { position: absolute; right: 10px; top: 10px; background: rgba(255,248,238,.92); border-radius: 12px; padding: 8px; font-size: 12px;
  box-shadow: 0 4px 14px rgba(60,40,20,.18); display: flex; gap: 8px; align-items: stretch; }
.em-legend canvas { display: block; width: auto; height: auto; touch-action: auto; }
.em-legend canvas.bar { width: 54px; height: 150px; } .em-legend canvas.disc { width: 120px; height: 150px; }
.em-banner { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); padding: 8px 14px; border-radius: 12px; font-weight: 700;
  background: rgba(255,248,238,.95); box-shadow: 0 4px 14px rgba(60,40,20,.2); text-align: center; max-width: 92%; font-size: 14px; }
.em-banner.rompe { background: #ffe3df; color: #8e2017; } .em-banner.sobra { background: #fff0d6; color: #8a4b00; }
.em-banner.al_limite { background: #fff2b8; color: #6b5200; } .em-banner.ok { background: #e3f6e8; color: #1f6b38; }
.em-banner.gira_mas, .em-banner.gira_menos { background: #e3eeff; color: #1d4a99; }
.em-banner small { display: block; font-weight: 400; }
@media (max-width: 760px) and (orientation: portrait) {
  .em { font-size: 14px; }
  .em-panel { top: auto; left: 0; width: 100%; height: 56vh; border-radius: 16px 16px 0 0; box-shadow: 0 -6px 24px rgba(60,40,20,.2); }
  .em-panel.plegado { height: 54px; }
  .em-panel.plegado .em-body { display: none; }
  .em-toggle { display: inline-block; }
  .em-hud { font-size: 11px; max-width: 58%; left: 6px; top: 6px; padding: 5px 7px; }
  .em-legend { transform: scale(.7); transform-origin: top right; right: 6px; top: 6px; }
  .em-banner { font-size: 12px; bottom: 6px; padding: 5px 10px; }
}
`;
