import type { Instance } from '../engine/generator';
import type { Confianza, Verdict } from '../engine/judge';
import type { DecisionAyuda, Presentacion } from '../engine/learner/policy';
import type { Formula } from '../engine/pack';
import { formatQuantity } from '../engine/units';
import type { Prediccion, Visual } from '../game/modules/ejeMacizo/consecuencia';
import { makeDraggable } from './drag';
import { exprToLatex } from './exprLatex';
import { symLatex, tex, texEl, unitLatex } from './katex';

export interface Ficha { id: string; nombre: string; valor: number; unidad: string }
export interface SlotState { ficha: string | null; mult: 1 | 0.5 | 2; factor: number | null }
export type Fase = 'resolver' | 'cargando' | 'animando' | 'resultado';
export type Modo = 'ejercicio' | 'explorar';

export interface ExploraVista { T: string; L: string; d: string; tau: string; phi: string; aviso: string; material: string }

export interface FilaDiag { sym: string; ficha: string; tuyo: string; pide: string; ok: boolean }
export interface Diagnostico {
  ok: boolean;
  titulo: string;
  errorId: string | null;
  descripcion: string;
  consecuencia: string;
  pregunta: string;
  formulaTuya: string;
  formulaOk: boolean;
  filas: FilaDiag[];
  paso: { n: number | null; texto: string; latex?: string } | null;
  valorTuyo: string;
  prediccion: { dada: Prediccion; observada: Prediccion; acierta: boolean } | null;
  calibracion: string;
}

export interface PanelState {
  fase: Fase;
  inst: Instance;
  plantilla: string;
  fichas: Ficha[];
  banco: Formula[];
  formula: Formula | null;
  slots: Record<string, SlotState>;
  prediccion: Prediccion | null;
  confianza: Confianza | null;
  presentacion: Presentacion;
  ejemplo: Instance | null;
  mostrarEjemplo: boolean;
  pistas: string[];
  ayuda: DecisionAyuda;
  mensaje: string | null;
  veredicto: Verdict | null;
  visual: Visual | null;
  diag: Diagnostico | null;
  picked: string | null;
  intentos: number;
  modo: Modo;
  objetivoCarga: string;
  explora: ExploraVista | null;
}

export interface PanelActions {
  selectFormula(id: string): void;
  bind(sym: string, ficha: string): void;
  clear(sym: string): void;
  scale(sym: string, m: 1 | 0.5 | 2): void;
  convert(sym: string, f: number): void;
  predict(p: Prediccion): void;
  confidence(c: Confianza): void;
  apply(): void;
  hint(): void;
  verEjemplo(): void;
  corregir(): void;
  otro(): void;
  salir(): void;
  pick(ficha: string | null): void;
  explorar(): void;
  autoCarga(): void;
  material(): void;
  resetExplora(): void;
}

export const FACTORES: [number, string][] = [[1e-3, '\\times10^{-3}'], [1, '\\times1'], [1e3, '\\times10^{3}'], [1e6, '\\times10^{6}'], [1e9, '\\times10^{9}']];
export const PRED_TXT: Record<Prediccion, string> = { rompe: 'Se rompe', aprueba: 'Aguanta (aprueba)', sobra: 'Aguanta y sobra material' };
const CONF_TXT: Record<Confianza, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const MULT_TXT: Record<string, string> = { '1': 'tal cual', '0.5': 'la mitad', '2': 'el doble' };

/** Número con unidad en LaTeX (1.5×10^-4 → 1.5\times10^{-4}). */
export function valorLatex(val: number, unit: string): string {
  const n = formatQuantity(val, '1', 4).replace(/×10\^(-?\d+)/, '\\times10^{$1}');
  return `${n}\\,${unitLatex(unit)}`;
}

export function slotValor(f: Ficha, s: SlotState): number | null {
  return s.factor === null ? null : f.valor * s.mult * s.factor;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const btn = (text: string, on: () => void, cls = '', testid = ''): HTMLButtonElement => {
  const b = h('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', on);
  if (testid) b.dataset.testid = testid;
  return b;
};

/** Panel HTML del módulo: enunciado con fichas, banco de fórmulas, huecos, predicción, pistas y diagnóstico. */
export class Panel {
  readonly el = h('div', 'em-panel');
  private readonly body = h('div', 'em-body');
  private readonly hintBtn: HTMLButtonElement;
  private readonly exploreBtn: HTMLButtonElement;
  private cleanups: (() => void)[] = [];
  private st: PanelState | null = null;
  private lastFormula: string | null = null;

  constructor(root: HTMLElement, private readonly act: PanelActions) {
    this.el.dataset.testid = 'em-panel';
    const head = h('div', 'em-head');
    const title = h('h2', '', 'Eje macizo');
    this.hintBtn = btn('Pista 0/3', () => act.hint(), '', 'hint');
    const toggle = btn('▾', () => this.toggle(), 'em-toggle', 'toggle-panel');
    toggle.setAttribute('aria-label', 'Plegar panel');
    this.exploreBtn = btn('Explorar', () => act.explorar(), '', 'explorar');
    head.append(title, this.hintBtn, this.exploreBtn, btn('Volver al mundo', () => act.salir(), '', 'exit'), toggle);
    this.el.append(head, this.body);
    root.appendChild(this.el);
  }

  toggle(force?: boolean): void {
    this.el.classList.toggle('plegado', force);
    window.dispatchEvent(new Event('em-layout'));
  }

  get plegado(): boolean { return this.el.classList.contains('plegado'); }

  updateAyuda(s: PanelState): void {
    const n = s.pistas.length;
    const a = s.ayuda;
    const ofrece = a.accion === 'ofrecer_pista';
    this.hintBtn.textContent = a.accion === 'cortar' && !s.mostrarEjemplo ? 'Ver ejemplo' : `Pista ${n}/3`;
    this.hintBtn.disabled = !(ofrece || (a.accion === 'cortar' && !s.mostrarEjemplo));
    this.hintBtn.classList.toggle('pulse', ofrece || a.accion === 'cortar');
    this.hintBtn.title = a.accion === 'esperar' ? 'Primero inténtalo: la pista se ofrece tras 2 intentos o 2 minutos.' : '';
  }

  render(s: PanelState): void {
    this.st = s;
    const scroll = this.body.scrollTop;
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.body.innerHTML = '';
    this.updateAyuda(s);
    this.exploreBtn.textContent = s.modo === 'explorar' ? 'Volver al ejercicio' : 'Explorar';
    this.exploreBtn.disabled = s.fase === 'animando' || s.fase === 'cargando';
    if (s.modo === 'explorar' && s.explora) {
      this.hintBtn.disabled = true;
      this.body.append(this.explorar(s.explora));
      this.body.scrollTop = 0;
      this.lastFase = s.fase;
      return;
    }
    this.body.append(this.enunciado(s));
    const pasos = this.pasos(s);
    if (pasos) this.body.append(pasos);
    if (s.pistas.length) {
      const sec = h('section', 'em-hints');
      sec.dataset.testid = 'pistas';
      sec.append(h('h3', '', `Pistas usadas: ${s.pistas.length}/3`));
      const ol = h('ol');
      for (const p of s.pistas) ol.append(h('li', '', p));
      sec.append(ol);
      this.body.append(sec);
    }
    if (s.fase === 'resolver') {
      this.body.append(this.banco(s));
      if (s.formula) this.body.append(this.huecos(s, s.formula));
      this.body.append(this.prediccion(s));
      const msg = h('div', 'em-msg', s.mensaje ?? '');
      msg.dataset.testid = 'msg';
      const apply = btn('Aplicar carga', () => this.act.apply(), 'primary', 'apply');
      const sec = h('section');
      sec.append(msg, apply);
      this.body.append(sec);
    } else if (s.fase === 'cargando') {
      const sec = h('section', 'em-card');
      sec.dataset.testid = 'cargando';
      sec.append(h('h4', '', 'Aplica la carga con la garra'), h('p', '', `Agarra la llave roja y arrástrala hacia abajo hasta ${s.objetivoCarga}. Al acercarte, encaja en el valor del enunciado.`));
      sec.append(btn('Cargar automáticamente', () => this.act.autoCarga(), '', 'auto-carga'));
      this.body.append(sec);
    } else if (s.fase === 'animando') {
      this.body.append(h('section', '', 'Aplicando la carga…'));
    } else if (s.diag) {
      this.body.append(this.diagnostico(s.diag));
    }
    this.body.scrollTop = scroll;
    const fid = s.formula?.id ?? null;
    if (fid && fid !== this.lastFormula && s.fase === 'resolver') this.scrollTo('[data-testid="formula-huecos"]');
    if (s.fase === 'resultado' && this.lastFase !== 'resultado') this.scrollTo('[data-testid="diagnostico"]');
    this.lastFormula = fid;
    this.lastFase = s.fase;
  }

  private lastFase: Fase | null = null;

  /** Lleva un elemento justo debajo del enunciado fijo. */
  private scrollTo(sel: string): void {
    const el = this.body.querySelector(sel);
    if (!el) return;
    const sticky = this.body.querySelector('.em-enun-sec')?.getBoundingClientRect().height ?? 0;
    this.body.scrollTop += el.getBoundingClientRect().top - this.body.getBoundingClientRect().top - sticky - 8;
  }

  private explorar(e: ExploraVista): HTMLElement {
    const sec = h('section', 'em-card');
    sec.dataset.testid = 'explora';
    sec.append(h('h4', '', 'Explorar: cambia el eje con la garra'));
    sec.append(h('p', '', 'Llave roja: arrastra hacia abajo para aplicar T. Bola amarilla: estira o acorta L. Anillo turquesa: arrastra hacia arriba para engordar el eje.'));
    const t = h('table');
    for (const [k, v] of [['T', e.T], ['L', e.L], ['d', e.d], ['\\tau_{\\text{máx}}', e.tau], ['\\phi', e.phi]] as const) {
      const tr = h('tr');
      const td = h('td');
      td.append(texEl(k));
      tr.append(td, h('td', '', v));
      t.append(tr);
    }
    sec.append(t, h('p', '', e.aviso));
    const acts = h('div', 'em-actions');
    acts.append(btn(`Material: ${e.material}`, () => this.act.material(), '', 'material'), btn('Restablecer', () => this.act.resetExplora(), '', 'reset-explora'));
    sec.append(acts);
    return sec;
  }

  private ficha(f: Ficha, s: PanelState): HTMLElement {
    const el = h('span', 'ficha');
    el.dataset.ficha = f.id;
    el.dataset.testid = `ficha-${f.id}`;
    el.textContent = formatQuantity(f.valor, f.unidad, 4);
    el.title = `${f.nombre}: arrástralo a un hueco de la fórmula`;
    if (Object.values(s.slots).some((x) => x.ficha === f.id)) el.classList.add('usada');
    if (s.picked === f.id) el.classList.add('picked');
    if (s.fase === 'resolver') {
      this.cleanups.push(makeDraggable(el, {
        payload: f.id,
        onDrop: (slot, id) => this.act.bind(slot, id),
        onTap: (id) => this.act.pick(this.st?.picked === id ? null : id),
      }));
    }
    return el;
  }

  private enunciado(s: PanelState): HTMLElement {
    const sec = h('section', 'em-enun-sec');
    sec.append(h('h3', '', 'Enunciado'));
    const box = h('div', 'em-enun');
    box.dataset.testid = 'enunciado';
    const parts = s.plantilla.split(/\{([^}]+)\}/g);
    parts.forEach((p, i) => {
      if (i % 2 === 0) { box.append(p); return; }
      const f = s.fichas.find((x) => x.id === p);
      box.append(f ? this.ficha(f, s) : `{${p}}`);
    });
    sec.append(box);
    if (s.fase === 'resolver' && !s.formula) sec.append(h('div', 'need', 'Arrastra cada dato (o tócalo y luego toca un hueco) hasta la fórmula. El motor hace las cuentas.'));
    return sec;
  }

  private pasos(s: PanelState): HTMLElement | null {
    const ej = s.mostrarEjemplo || s.presentacion === 'ejemplo_resuelto';
    if (!ej && s.presentacion === 'sin_pasos') return null;
    const sec = h('section', 'em-steps');
    sec.dataset.testid = 'pasos';
    const ol = h('ol');
    if (ej && s.ejemplo) {
      const e = s.ejemplo;
      sec.append(h('h3', '', 'Ejemplo resuelto (otro eje)'));
      sec.append(h('div', 'need', e.enunciado));
      for (const p of e.pasos) {
        const li = h('li', '', `${p.texto}: `);
        if (p.latex) li.append(texEl(p.latex));
        if (p.valor !== undefined) li.append(h('span', 'val', `  → ${formatQuantity(p.valor, p.unidad ?? '1', 3)}`));
        ol.append(li);
      }
      sec.append(ol, h('div', 'need', 'Ahora tú, con los datos de tu eje.'));
    } else {
      const n = Math.ceil(s.inst.pasos.length / 2);
      sec.append(h('h3', '', 'Pasos (guía parcial)'));
      for (const p of s.inst.pasos.slice(0, n)) {
        const li = h('li', '', `${p.texto}: `);
        if (p.latex) li.append(texEl(p.latex));
        ol.append(li);
      }
      ol.append(h('li', '', '… el resto lo decides tú.'));
      sec.append(ol);
    }
    return sec;
  }

  private banco(s: PanelState): HTMLElement {
    const sec = h('section');
    sec.append(h('h3', '', `Banco de fórmulas: elige una para calcular ${s.inst.incognita.nombre ?? s.inst.incognita.simbolo}`));
    const g = h('div', 'em-bank');
    for (const f of s.banco) {
      const b = btn('', () => this.act.selectFormula(f.id), s.formula?.id === f.id ? 'sel' : '', `formula-${f.id}`);
      tex(b, f.latex);
      g.append(b);
    }
    sec.append(g);
    return sec;
  }

  private huecos(s: PanelState, f: Formula): HTMLElement {
    const sec = h('section');
    sec.append(h('h3', '', 'Tu fórmula: suelta las fichas en los huecos'));
    const fx = h('div', 'em-formula');
    fx.dataset.testid = 'formula-huecos';
    const res = symLatex(f.resultado.simbolo);
    const latex = `${res} = ${exprToLatex(f.expr, (v) => {
      const st = s.slots[v];
      const fi = st?.ficha ? s.fichas.find((x) => x.id === st.ficha) : undefined;
      const val = fi && st ? slotValor(fi, st) : null;
      const inner = val !== null && val !== undefined
        ? valorLatex(val, f.unidades?.[v] ?? '1')
        : fi ? `${symLatex(v)}{=}?` : symLatex(v);
      return `\\htmlData{slot=${v}}{\\htmlClass{slotbox${fi ? ' lleno' : ''}}{${inner}}}`;
    }, true)}`;
    tex(fx, latex, true);
    sec.append(fx);
    const list = h('div', 'em-slots');
    for (const v of f.variables) {
      const st = s.slots[v] ?? { ficha: null, mult: 1, factor: null };
      const unit = f.unidades?.[v] ?? '1';
      const box = h('div', 'em-slot');
      const row = h('div', 'row');
      const lab = texEl(`${symLatex(v)}\\;[${unitLatex(unit)}]`);
      const drop = h('div', 'drop');
      drop.dataset.slot = v;
      drop.dataset.testid = `slot-${v}`;
      const fi = st.ficha ? s.fichas.find((x) => x.id === st.ficha) : undefined;
      if (fi) {
        drop.classList.add('lleno');
        drop.append(`${fi.nombre}: ${formatQuantity(fi.valor, fi.unidad, 4)}`);
      } else drop.append(s.picked ? 'Toca aquí para poner la ficha' : 'Suelta aquí un dato');
      drop.addEventListener('click', () => { if (this.st?.picked) this.act.bind(v, this.st.picked); });
      row.append(lab, drop);
      if (fi) row.append(btn('✕', () => this.act.clear(v), '', `clear-${v}`));
      box.append(row);
      if (fi) {
        const ops = h('div', 'ops');
        ops.append('Usar: ');
        for (const m of [1, 0.5, 2] as const) ops.append(btn(MULT_TXT[String(m)]!, () => this.act.scale(v, m), st.mult === m ? 'sel' : '', `mult-${v}-${m}`));
        box.append(ops);
        const conv = h('div', 'ops');
        conv.append(`A ${unit}: `);
        for (const [fac, lx] of FACTORES) {
          const b = btn('', () => this.act.convert(v, fac), st.factor === fac ? 'sel' : '', `conv-${v}-${fac}`);
          tex(b, lx);
          conv.append(b);
        }
        const val = slotValor(fi, st);
        conv.append(h('span', 'res', val === null ? 'elige la conversión' : `→ ${formatQuantity(val, unit, 4)}`));
        box.append(conv);
      }
      list.append(box);
    }
    sec.append(list);
    return sec;
  }

  private prediccion(s: PanelState): HTMLElement {
    const sec = h('section');
    sec.append(h('h3', '', 'Antes de aplicar la carga: ¿qué pasará con este eje?'));
    const p = h('div', 'em-choices');
    for (const k of ['rompe', 'aprueba', 'sobra'] as const) p.append(btn(PRED_TXT[k], () => this.act.predict(k), s.prediccion === k ? 'sel' : '', `pred-${k}`));
    sec.append(p);
    sec.append(h('h3', '', '¿Qué tan seguro estás?'));
    const c = h('div', 'em-choices');
    for (const k of ['baja', 'media', 'alta'] as const) c.append(btn(CONF_TXT[k], () => this.act.confidence(k), s.confianza === k ? 'sel' : '', `conf-${k}`));
    sec.append(c);
    return sec;
  }

  private diagnostico(d: Diagnostico): HTMLElement {
    const sec = h('section');
    const card = h('div', `em-card ${d.ok ? 'ok' : 'bad'}`);
    card.dataset.testid = 'diagnostico';
    card.append(h('h4', '', d.titulo));
    if (d.descripcion) card.append(h('p', '', d.descripcion));
    card.append(h('h3', '', 'Tu solución'));
    const fl = h('div', 'em-formula');
    tex(fl, d.formulaTuya, true);
    card.append(fl);
    if (!d.formulaOk) card.append(h('p', '', 'Esa no es la fórmula que corresponde a este eje.'));
    if (d.filas.length) {
      const t = h('table');
      const hr = h('tr');
      for (const x of ['Hueco', 'Pusiste', 'Valor tuyo', 'Lo que pide', '']) hr.append(h('th', '', x));
      t.append(hr);
      for (const f of d.filas) {
        const tr = h('tr');
        const td0 = h('td');
        td0.append(texEl(symLatex(f.sym)));
        tr.append(td0, h('td', '', f.ficha), h('td', '', f.tuyo), h('td', '', f.pide), h('td', f.ok ? 'v' : 'x', f.ok ? '✓' : '✗'));
        t.append(tr);
      }
      card.append(t);
    }
    card.append(h('p', '', `Con eso el motor calculó: ${d.valorTuyo}`));
    if (d.paso) {
      const p = h('p');
      p.dataset.testid = 'paso-difiere';
      p.append(h('b', '', d.paso.n !== null ? `Donde se separa tu camino (paso ${d.paso.n}): ` : 'Donde se separa tu camino: '), d.paso.texto + ' ');
      if (d.paso.latex) p.append(texEl(d.paso.latex));
      card.append(p);
    }
    if (d.consecuencia) card.append(h('p', '', d.consecuencia));
    if (d.pregunta) card.append(h('p', '', `Pregúntate: ${d.pregunta}`));
    if (d.prediccion) {
      const p = h('p');
      p.dataset.testid = 'prediccion-vs';
      p.append(h('b', '', 'Predicción: '), `dijiste «${PRED_TXT[d.prediccion.dada]}», se observó «${PRED_TXT[d.prediccion.observada]}» ${d.prediccion.acierta ? '✓' : '✗'}`);
      card.append(p);
    }
    card.append(h('p', '', d.calibracion));
    sec.append(card);
    const acts = h('div', 'em-actions');
    if (!d.ok) acts.append(btn('Corregir mi solución', () => this.act.corregir(), 'primary', 'corregir'));
    acts.append(btn('Otro ejercicio', () => this.act.otro(), d.ok ? 'primary' : '', 'otro'));
    acts.append(btn('Volver al mundo', () => this.act.salir(), '', 'exit2'));
    sec.append(acts);
    return sec;
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.el.remove();
  }
}
