import { generate, type Instance } from '../../../engine/generator';
import { judge, within, type Confianza, type Submission, type Verdict } from '../../../engine/judge';
import { decidirAyuda, presentacion, type DecisionAyuda } from '../../../engine/learner/policy';
import { findExercise, findFormula, type Formula } from '../../../engine/pack';
import { mulberry32 } from '../../../engine/rng';
import { formatQuantity, toSI } from '../../../engine/units';
import { EJE_CSS } from '../../../ui/ejeMacizo.css';
import { exprToLatex } from '../../../ui/exprLatex';
import { Panel, slotValor, valorLatex, type Diagnostico, type Ficha, type PanelState, type SlotState } from '../../../ui/ejeMacizoPanel';
import { symLatex, unitLatex } from '../../../ui/katex';
import * as THREE from 'three';
import type { GameHook } from '../../../testhooks';
import type { ModuleContext, ModuleInstance } from '../../game';
import { getSession } from '../../session';
import { STRESS_STOPS } from '../../shaftView';
import {
  consecuenciaVisual, exageracionPara, L_POR_DIAMETRO, materialDe, observadoDe, phiReal, tauEn,
  type Material, type Prediccion,
} from './consecuencia';
import { LV, Taller, type FreeRect } from './scene';
import { Grabber, type Agarrable } from './grab';
import { MATERIALES } from './consecuencia';

export const MODULO = 'eje_macizo';
const RAMP = 1.6, HOLD = 1.7;
const RV = LV / (2 * L_POR_DIAMETRO);
/** Recorrido de arrastre (px) que equivale a 1,5 veces el torque del enunciado. */
export const PX_RANGO = 240;
const SNAP = 0.08;

interface Fisica { T: number; c: number; L: number; G: number; material: Material; tauAdm: number; phiFull: number; N: number; escala: number }

export interface EjeMacizoHook {
  readonly id: string;
  readonly state: Record<string, unknown>;
  selectFormula(id: string): void;
  bind(sym: string, fichaId: string): void;
  clear(sym: string): void;
  scale(sym: string, m: 1 | 0.5 | 2): void;
  convert(sym: string, factor: number): void;
  predict(p: Prediccion): void;
  confidence(c: Confianza): void;
  apply(opts?: { manual?: boolean }): boolean;
  autoCarga(): void;
  explorar(on?: boolean): void;
  hint(): string | null;
  corregir(): void;
  otro(): void;
  nuevo(opts?: { variante?: number }): void;
  exit(): void;
  /** Punto de pantalla (px) de un elemento interactivo de la escena. */
  screenOf(what: 'llave' | 'extremo' | 'asaL' | 'asaC'): { x: number; y: number };
  taller: Taller;
}

type HookWin = GameHook & { module?: EjeMacizoHook };
const gh = (): HookWin | undefined => window.__game as HookWin | undefined;

export function createEjeMacizo(ctx: ModuleContext): ModuleInstance {
  const ses = getSession();
  const { pack, tutor, clock } = ses;
  ctx.root.classList.add('em');
  const style = document.createElement('style');
  style.textContent = EJE_CSS;
  ctx.root.appendChild(style);

  const taller = new Taller(RV);
  const view = document.createElement('div');
  view.className = 'em-view';
  view.innerHTML = `<div class="em-hud" data-testid="hud"></div>
    <div class="em-legend"><canvas class="bar" width="54" height="150"></canvas><canvas class="disc" width="120" height="150"></canvas></div>
    <div class="em-banner" data-testid="banner" hidden></div>`;
  ctx.root.appendChild(view);
  const hud = view.querySelector('.em-hud') as HTMLElement;
  const banner = view.querySelector('.em-banner') as HTMLElement;
  const barCv = view.querySelector('canvas.bar') as HTMLCanvasElement;
  const discCv = view.querySelector('canvas.disc') as HTMLCanvasElement;

  let inst!: Instance;
  let fis!: Fisica;
  let st!: PanelState;
  let t0 = 0, erroresSeguidos = 0, anim = 0, ayudaTimer = 0;
  let sub: Submission | null = null;
  let carga = { T: 0, snapped: false };
  let modoExplora = false;
  const ex = { T: 0, L: 0, c: 0, material: MATERIALES.acero };
  let dragIni = { T: 0, L: 0, c: 0 };
  let W = innerWidth, H = innerHeight;

  const panel = new Panel(ctx.root, {
    selectFormula: (id) => act.selectFormula(id),
    bind: (s, f) => act.bind(s, f),
    clear: (s) => act.clear(s),
    scale: (s, m) => act.scale(s, m),
    convert: (s, f) => act.convert(s, f),
    predict: (p) => act.predict(p),
    confidence: (c) => act.confidence(c),
    apply: () => act.apply({ manual: true }),
    hint: () => act.hint(),
    verEjemplo: () => { st.mostrarEjemplo = true; render(); },
    corregir: () => act.corregir(),
    otro: () => act.otro(),
    salir: () => act.exit(),
    pick: (f) => { st.picked = f; render(); },
    explorar: () => act.explorar(),
    autoCarga: () => act.autoCarga(),
    material: () => { ex.material = ex.material === MATERIALES.acero ? MATERIALES.fundicion : MATERIALES.acero; applyExplora(); render(); },
    resetExplora: () => { ex.T = 0; ex.L = fis.L; ex.c = fis.c; applyExplora(); },
  });

  const ayuda = (): DecisionAyuda => decidirAyuda({
    intentos: st?.intentos ?? 0, erroresSeguidos, segundos: (clock.now() - t0) / 1000, pistasUsadas: st?.pistas.length ?? 0,
  });

  function bancoPara(i: Instance): Formula[] {
    const ok = findFormula(pack, i.formulaCorrecta);
    const mismas = pack.formulas.filter((f) => f.id !== ok.id && f.resultado.simbolo === ok.resultado.simbolo);
    const otra = pack.formulas.find((f) => f.resultado.simbolo !== ok.resultado.simbolo && !f.distractor && f.variables.includes('c'));
    const lista = [ok, ...mismas, ...(otra ? [otra] : [])];
    const r = mulberry32(i.seed ^ 0x5bd1e995);
    for (let k = lista.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [lista[k], lista[j]] = [lista[j]!, lista[k]!]; }
    return lista;
  }

  function fisicaDe(i: Instance): Fisica {
    const T = i.asignacionSI.T!, c = i.asignacionSI.c!;
    const material = materialDe(i.enunciado);
    const L = L_POR_DIAMETRO * 2 * c;
    const phiFull = phiReal(T, L, c, material.G);
    const tauAdm = i.limites.tau_adm?.si ?? tauEn(T, c, c);
    return { T, c, L, G: material.G, material, tauAdm, phiFull, N: exageracionPara(phiFull), escala: Math.max(i.correcto.si, tauAdm) * 1.15 };
  }

  function nuevo(opts: { variante?: number; exerciseId?: string } = {}): void {
    if (inst && st.intentos > 0) ses.vistos.set(inst.exerciseId, (ses.vistos.get(inst.exerciseId) ?? 0) + 1);
    const exId = opts.exerciseId ?? tutor.siguiente([MODULO]).exerciseId;
    const prev = inst?.exerciseId === exId ? inst.variante : undefined;
    const go = opts.variante !== undefined ? { variante: opts.variante } : prev !== undefined ? { evitarVariante: prev } : {};
    inst = tutor.generar(exId, ses.nextSeed(), go);
    fis = fisicaDe(inst);
    const ex = findExercise(pack, exId);
    const fichas: Ficha[] = [
      ...Object.entries(inst.datos).map(([id, d]) => ({ id, nombre: d.nombre, valor: d.valor, unidad: d.unidad })),
      ...Object.entries(inst.limites).map(([id, d]) => ({ id, nombre: id === 'tau_adm' ? 'esfuerzo admisible' : 'giro admisible', valor: d!.valor, unidad: d!.unidad })),
    ];
    const vistos = ses.vistos.get(exId) ?? 0;
    st = {
      fase: 'resolver', inst, plantilla: ex.enunciado, fichas, banco: bancoPara(inst), formula: null, slots: {},
      prediccion: null, confianza: null, presentacion: presentacion(vistos),
      ejemplo: generate(pack, exId, inst.seed, { variante: (inst.variante + 1) % inst.nVariantes }),
      mostrarEjemplo: false, pistas: [], ayuda: { accion: 'esperar', motivo: 'primer_intento' }, mensaje: null,
      veredicto: null, visual: null, diag: null, picked: null, intentos: 0,
      modo: 'ejercicio', objetivoCarga: `T = ${formatQuantity(inst.datos.T?.valor ?? 0, inst.datos.T?.unidad ?? 'N·m', 3)}`, explora: null,
    };
    carga = { T: 0, snapped: false };
    if (modoExplora) salirExplora();
    t0 = clock.now();
    erroresSeguidos = 0;
    sub = null;
    taller.shaft.reset();
    banner.hidden = true;
    st.ayuda = ayuda();
    render();
    drawHud(0);
  }

  function render(): void { panel.render(st); }

  function edit(fn: () => void): void {
    if (st.fase !== 'resolver') return;
    fn();
    st.mensaje = null;
    render();
  }

  function binding(v: string, f: Formula): { valor: number; unidad: string } | null {
    const s = st.slots[v];
    const fi = s?.ficha ? st.fichas.find((x) => x.id === s.ficha) : undefined;
    if (!s || !fi) return null;
    const val = slotValor(fi, s);
    return val === null ? null : { valor: val, unidad: f.unidades?.[v] ?? '1' };
  }

  const act = {
    selectFormula(id: string): void {
      edit(() => {
        const f = st.banco.find((x) => x.id === id) ?? findFormula(pack, id);
        const old = st.slots;
        st.formula = f;
        st.slots = Object.fromEntries(f.variables.map((v) => [v, old[v] ?? { ficha: null, mult: 1, factor: null }]));
      });
    },
    bind(sym: string, fichaId: string): void {
      edit(() => {
        if (!st.formula?.variables.includes(sym)) return;
        const fi = st.fichas.find((x) => x.id === fichaId);
        if (!fi) return;
        const unit = st.formula.unidades?.[sym];
        const s: SlotState = { ficha: fichaId, mult: 1, factor: unit && fi.unidad === unit ? 1 : null };
        st.slots[sym] = s;
        st.picked = null;
      });
    },
    clear(sym: string): void { edit(() => { if (st.slots[sym]) st.slots[sym] = { ficha: null, mult: 1, factor: null }; }); },
    scale(sym: string, m: 1 | 0.5 | 2): void { edit(() => { const s = st.slots[sym]; if (s?.ficha) s.mult = m; }); },
    convert(sym: string, factor: number): void { edit(() => { const s = st.slots[sym]; if (s?.ficha) s.factor = factor; }); },
    predict(p: Prediccion): void { edit(() => { st.prediccion = p; }); },
    confidence(c: Confianza): void { edit(() => { st.confianza = c; }); },
    apply(opts: { manual?: boolean } = {}): boolean {
      if (st.fase !== 'resolver' || modoExplora) return false;
      const f = st.formula;
      const falta = !f ? 'Elige una fórmula del banco.'
        : f.variables.find((v) => !st.slots[v]?.ficha) ? 'Faltan huecos por llenar.'
        : f.variables.find((v) => st.slots[v]?.factor === null) ? 'Elige la conversión de cada dato a la unidad del hueco.'
        : !st.prediccion ? 'Predice qué pasará antes de aplicar la carga.'
        : !st.confianza ? 'Indica qué tan seguro estás.' : null;
      if (falta || !f) { st.mensaje = falta; render(); return false; }
      const bindings = Object.fromEntries(f.variables.map((v) => [v, binding(v, f)!]));
      sub = { formulaId: f.id, bindings, prediccion: st.prediccion === 'rompe' ? 'no_aprueba' : 'aprueba', confianza: st.confianza! };
      const v = judge(pack, inst, sub);
      if (v.resultado === 'invalido') {
        st.mensaje = v.motivoInvalido ?? 'No se puede calcular así.';
        render();
        void tutor.responder(inst, sub, { pistas: st.pistas.length, tiempoMs: clock.now() - t0 });
        return false;
      }
      st.intentos++;
      erroresSeguidos = v.correcto ? 0 : erroresSeguidos + 1;
      st.veredicto = v;
      st.visual = consecuenciaVisual(inst, v, fis.material, fis.c);
      st.diag = diagnostico(v, f);
      st.fase = opts.manual ? 'cargando' : 'animando';
      anim = 0;
      carga = { T: 0, snapped: false };
      taller.shaft.reset();
      void tutor.responder(inst, sub, { pistas: st.pistas.length, tiempoMs: clock.now() - t0 });
      if (!opts.manual && panel.plegado === false && matchMedia('(max-width: 760px) and (orientation: portrait)').matches) panel.toggle(true);
      render();
      return true;
    },
    hint(): string | null {
      st.ayuda = ayuda();
      if (st.ayuda.accion === 'cortar' && !st.mostrarEjemplo) { st.mostrarEjemplo = true; render(); return 'ejemplo_resuelto'; }
      if (st.ayuda.accion !== 'ofrecer_pista') return null;
      const k = st.pistas.length;
      const txt = inst.pistas[k]!;
      st.pistas.push(txt);
      void tutor.log.append({ tipo: 'pista', exerciseId: inst.exerciseId, escalon: k });
      st.ayuda = ayuda();
      render();
      return txt;
    },
    corregir(): void {
      if (st.fase !== 'resultado') return;
      st.fase = 'resolver';
      st.prediccion = null;
      st.confianza = null;
      st.diag = null;
      taller.shaft.reset();
      banner.hidden = true;
      st.ayuda = ayuda();
      render();
      drawHud(0);
    },
    otro(): void { nuevo(); },
    autoCarga(): void {
      if (st.fase !== 'cargando') return;
      grab.release();
      st.fase = 'animando';
      anim = 0;
      render();
    },
    explorar(on = !modoExplora): void {
      if (on === modoExplora || st.fase === 'animando' || st.fase === 'cargando') return;
      if (on) {
        modoExplora = true;
        st.modo = 'explorar';
        ex.T = 0; ex.L = fis.L; ex.c = fis.c; ex.material = fis.material;
        taller.shaft.reset();
        taller.shaft.setAsas(true);
        banner.hidden = true;
        applyExplora();
      } else salirExplora();
    },
    exit(): void {
      ctx.exit({ intentos: st.intentos, resultado: st.veredicto?.resultado ?? null, errorId: st.veredicto?.errorId ?? null });
    },
  };

  function diagnostico(v: Verdict, f: Formula): Diagnostico {
    const ok = v.correcto;
    const er = v.error;
    const filas = f.variables.map((sym) => {
      const b = sub!.bindings[sym]!;
      const s = st.slots[sym]!;
      const fi = st.fichas.find((x) => x.id === s.ficha)!;
      const mio = toSI(b.valor, b.unidad);
      const pide = inst.asignacionSI[sym];
      const unit = f.unidades?.[sym] ?? '1';
      return {
        sym, ficha: `${fi.nombre}${s.mult !== 1 ? (s.mult === 0.5 ? ' ÷ 2' : ' × 2') : ''}`,
        tuyo: formatQuantity(mio, unit, 3), pide: pide === undefined ? '—' : formatQuantity(pide, unit, 3),
        ok: pide !== undefined && within(mio, pide),
      };
    });
    let paso: Diagnostico['paso'] = null;
    if (!ok) {
      if (!v.formulaElegidaCorrecta) {
        paso = { n: null, texto: `Elegir la fórmula: usaste «${f.nombre ?? f.id}».` };
      } else {
        const bad = filas.find((x) => !x.ok);
        if (bad) {
          const i = inst.pasos.findIndex((p) => p.simbolo === bad.sym);
          const unit = f.unidades?.[bad.sym] ?? '1';
          paso = i >= 0
            ? { n: i + 1, texto: inst.pasos[i]!.texto, ...(inst.pasos[i]!.latex ? { latex: inst.pasos[i]!.latex! } : {}) }
            : { n: null, texto: `Pasar ${bad.sym} a ${unit} antes de ponerlo en la fórmula`, latex: `${symLatex(bad.sym)}\\;[${unitLatex(unit)}]` };
        }
      }
    }
    const obs = observadoDe(st.visual!.estado);
    const pred = st.prediccion!;
    const conf = st.confianza!;
    const calibracion = conf === 'alta' && !ok ? 'Confianza alta y resultado incorrecto: antes de confirmar, revisa radio y unidades.'
      : conf === 'baja' && ok ? 'Acertaste con confianza baja: tu razonamiento era bueno, confía más en él.'
      : 'Tu confianza fue coherente con el resultado.';
    const titulo = ok ? '¡Correcto!' : er ? er.nombre : v.resultado === 'no_clasificado' ? 'Tu resultado no coincide con el esperado' : 'Revisa tu solución';
    return {
      ok, titulo, errorId: v.errorId ?? null,
      descripcion: ok ? 'Tu fórmula y tus datos coinciden con lo que pide el eje.' : er ? er.descripcion : 'No coincide con un error típico conocido: compara tus huecos con lo que pide cada uno.',
      consecuencia: er?.consecuencia_texto ?? '',
      pregunta: er?.pista_diagnostico ?? '',
      formulaTuya: `\\begin{gathered}${f.latex}\\\\ ${symLatex(f.resultado.simbolo)} = ${exprToLatex(f.expr, (x) => valorLatex(sub!.bindings[x]!.valor, sub!.bindings[x]!.unidad), true)}\\end{gathered}`,
      formulaOk: v.formulaElegidaCorrecta,
      filas, paso,
      valorTuyo: v.valor ? formatQuantity(v.valor.mostrado, v.valor.unidad, 3) + (ok ? '' : ` (el valor real no se muestra; corrige y vuelve a aplicar)`) : '—',
      prediccion: { dada: pred, observada: obs, acierta: pred === obs },
      calibracion,
    };
  }

  // ---------- HUD 3D ----------
  function freeRect(): FreeRect {
    const r = panel.el.getBoundingClientRect();
    if (r.width >= W - 2) return { x: 0, y: 0, w: W, h: Math.max(120, r.top) };
    return { x: 0, y: 0, w: Math.max(160, r.left), h: H };
  }

  function layout(): void {
    W = innerWidth; H = innerHeight;
    const r = freeRect();
    Object.assign(view.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    taller.fit(W, H, r);
  }
  const onLayout = (): void => layout();
  addEventListener('em-layout', onLayout);

  function drawHud(T: number, L = fis.L, c = fis.c, mat = fis.material): void {
    const phi = phiReal(T, L, c, mat.G);
    const tau = tauEn(T, c, c);
    const deg = (x: number): string => `${(x * 180 / Math.PI).toFixed(2)}°`;
    const tU = inst.datos.T?.unidad ?? 'N·m';
    const de = modoExplora ? '' : ` <span style="color:#7a6450">(de ${formatQuantity(inst.datos.T?.valor ?? 0, tU, 3)})</span>`;
    hud.innerHTML = `<b>Carga</b> T = ${formatQuantity(toSIinv(T, tU), tU, 3)}${de}<br>
      φ real = ${deg(phi)} · <span class="em-exag" data-testid="exag">dibujado ×${fis.N}</span> = ${deg(phi * fis.N)}<br>
      τmáx = ${(tau / 1e6).toFixed(1)} MPa · τadm = ${(fis.tauAdm / 1e6).toFixed(0)} MPa<br>
      <span style="color:#7a6450">L = ${L.toFixed(2)} m${modoExplora ? '' : ' (escena)'} · d = ${(2 * c * 1000).toFixed(0)} mm · G = ${(mat.G / 1e9).toFixed(0)} GPa (${mat.nombre})</span>`;
    drawLegend(tau);
  }

  /** Aplica el torque T al eje real del ejercicio. Devuelve true si en ese instante se rompe. */
  function applyLoad(T: number): boolean {
    const sh = taller.shaft;
    const vis = st.visual!;
    if (sh.metrics().roto) return false;
    sh.setTwist(phiReal(T, fis.L, fis.c, fis.G) * fis.N);
    sh.setStress(tauEn(T, fis.c, fis.c) / fis.escala);
    drawHud(T);
    if (vis.estado === 'rompe' && vis.breakAt !== null && T >= vis.breakAt * fis.T - 1e-9) {
      sh.breakNow(vis.fractura ?? 'ductil');
      sh.setStress(0);
      hud.insertAdjacentHTML('beforeend', '<br><b style="color:#c4392f">↑ valores en el instante de la rotura</b>');
      return true;
    }
    const lim = vis.estado === 'al_limite' && T > 0.95 * fis.T;
    sh.setAmber(lim);
    sh.setVibration(lim ? 0.012 : 0);
    return false;
  }

  const tPorPx = (): number => (1.5 * fis.T) / PX_RANGO;

  function finCarga(): void {
    grab.release();
    st.fase = 'animando';
    anim = RAMP;
    render();
  }

  function applyExplora(): void {
    const sh = taller.shaft;
    const S = LV / fis.L;
    sh.setDims(ex.L * S, ex.c * S);
    const phi = phiReal(ex.T, ex.L, ex.c, ex.material.G);
    const tau = tauEn(ex.T, ex.c, ex.c);
    sh.setTwist(phi * fis.N);
    sh.setStress(tau / fis.escala);
    sh.setAmber(tau > fis.tauAdm);
    drawHud(ex.T, ex.L, ex.c, ex.material);
    const tU = inst.datos.T?.unidad ?? 'N·m';
    st.explora = {
      T: formatQuantity(toSIinv(ex.T, tU), tU, 3), L: `${ex.L.toFixed(2)} m`, d: `${(2 * ex.c * 1000).toFixed(1)} mm`,
      tau: `${(tau / 1e6).toFixed(1)} MPa`, phi: `${(phi * 180 / Math.PI).toFixed(2)}° (dibujado ×${fis.N})`,
      aviso: tau > fis.tauAdm ? `Supera τadm = ${(fis.tauAdm / 1e6).toFixed(0)} MPa: este eje fallaría.` : 'Por debajo de τadm.',
      material: ex.material.nombre,
    };
    render();
  }

  function salirExplora(): void {
    modoExplora = false;
    st.modo = 'ejercicio';
    st.explora = null;
    const d0 = taller.shaft.dims0;
    taller.shaft.setDims(d0.Lv, d0.rv);
    taller.shaft.setAsas(false);
    taller.shaft.reset();
    drawHud(0);
    render();
  }

  /** Dirección en pantalla (px por unidad de mundo) de un desplazamiento local del eje. */
  function ejePantalla(x: number, dir: THREE.Vector3): { ux: number; uy: number; ppu: number } {
    const g = taller.shaft.group;
    const a = taller.toScreen(g.localToWorld(new THREE.Vector3(x, 0, 0)), W, H);
    const b = taller.toScreen(g.localToWorld(new THREE.Vector3(x, 0, 0).addScaledVector(dir, 0.5)), W, H);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, ppu: len / 0.5 };
  }
  let ejeDrag = { ux: 1, uy: 0, ppu: 1 };

  const grab = new Grabber(ctx.renderer.domElement, taller, {
    puede: (k: Agarrable) => (modoExplora ? true : k === 'llave' && st.fase === 'cargando'),
    start: (k) => {
      dragIni = { T: modoExplora ? ex.T : carga.T, L: ex.L, c: ex.c };
      const sh = taller.shaft;
      if (k === 'asaL') ejeDrag = ejePantalla(sh.Lv, new THREE.Vector3(1, 0, 0));
      if (k === 'asaC') ejeDrag = ejePantalla(sh.Lv * 0.5, new THREE.Vector3(0, 1, 0));
    },
    drag: (k, dx, dy) => {
      const S = LV / fis.L;
      if (k === 'llave') {
        let T = Math.max(0, dragIni.T + dy * tPorPx());
        if (modoExplora) { ex.T = Math.min(T, 2 * fis.T); applyExplora(); return; }
        if (st.fase !== 'cargando') return;
        T = Math.min(T, 1.5 * fis.T);
        carga.snapped = Math.abs(T - fis.T) <= SNAP * fis.T;
        carga.T = carga.snapped ? fis.T : T;
        if (applyLoad(carga.T)) finCarga();
        return;
      }
      const dw = (dx * ejeDrag.ux + dy * ejeDrag.uy) / ejeDrag.ppu / S;
      if (k === 'asaL') ex.L = Math.round(Math.min(1.6 * fis.L, Math.max(0.5 * fis.L, dragIni.L + dw)) * 100) / 100;
      else ex.c = Math.round(Math.min(2 * fis.c, Math.max(0.5 * fis.c, dragIni.c + dw)) * 2000) / 2000;
      applyExplora();
    },
    end: (k) => {
      if (k === 'llave' && !modoExplora && st.fase === 'cargando' && carga.snapped) finCarga();
    },
  });
  const toSIinv = (si: number, u: string): number => si / toSI(1, u);

  function drawLegend(tau: number): void {
    const g = barCv.getContext('2d')!;
    const bh = 120, top = 18, x0 = 6;
    g.clearRect(0, 0, barCv.width, barCv.height);
    const grd = g.createLinearGradient(0, top + bh, 0, top);
    for (const [t, c] of STRESS_STOPS) grd.addColorStop(t, c);
    g.fillStyle = grd;
    g.fillRect(x0, top, 14, bh);
    g.fillStyle = '#33261a';
    g.font = '10px system-ui';
    g.fillText('τ (MPa)', 0, 10);
    const y = (v: number): number => top + bh - (v / fis.escala) * bh;
    g.fillText('0', 24, top + bh);
    g.fillText(`${(fis.escala / 1e6).toFixed(0)}`, 24, top + 8);
    g.strokeStyle = '#c4392f'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 - 4, y(fis.tauAdm)); g.lineTo(x0 + 18, y(fis.tauAdm)); g.stroke();
    g.fillStyle = '#c4392f';
    g.fillText('adm', 24, y(fis.tauAdm) + 3);
    if (tau > 0) {
      g.fillStyle = '#33261a';
      g.beginPath(); const ty = y(tau); g.moveTo(x0 + 15, ty); g.lineTo(x0 + 22, ty - 4); g.lineTo(x0 + 22, ty + 4); g.fill();
    }
    // sección del extremo ampliada: τ(ρ) = Tρ/J, con el círculo donde τ = τadm
    const d = discCv.getContext('2d')!;
    d.clearRect(0, 0, discCv.width, discCv.height);
    const cx = 60, cy = 72, R = 50;
    const f = tau / fis.escala;
    const rg = d.createRadialGradient(cx, cy, 0, cx, cy, R);
    for (const [t, c] of STRESS_STOPS) if (t <= Math.max(f, 1e-3)) rg.addColorStop(f > 0 ? t / Math.max(f, 1e-3) : 0, c);
    const last = STRESS_STOPS.filter(([t]) => t <= f).at(-1);
    if (f > 0 && last && last[0] < f) rg.addColorStop(1, colorAt(f));
    if (f <= 0) { rg.addColorStop(0, STRESS_STOPS[0]![1]); rg.addColorStop(1, STRESS_STOPS[0]![1]); }
    d.fillStyle = rg;
    d.beginPath(); d.arc(cx, cy, R, 0, Math.PI * 2); d.fill();
    d.strokeStyle = '#33261a'; d.lineWidth = 1.5; d.stroke();
    if (tau > fis.tauAdm) {
      const ra = R * fis.tauAdm / tau;
      d.setLineDash([4, 3]); d.strokeStyle = '#fff'; d.lineWidth = 2;
      d.beginPath(); d.arc(cx, cy, ra, 0, Math.PI * 2); d.stroke(); d.setLineDash([]);
    }
    d.fillStyle = '#33261a'; d.font = '10px system-ui';
    d.fillText('sección del extremo', 12, 10);
    d.fillText(tau > fis.tauAdm ? '- - - τ = τadm' : 'τ crece con ρ', 22, 140);
  }
  function colorAt(t: number): string {
    for (let i = 1; i < STRESS_STOPS.length; i++) {
      const [t1, c1] = STRESS_STOPS[i]!; const [t0b, c0] = STRESS_STOPS[i - 1]!;
      if (t <= t1) { const k = (t - t0b) / (t1 - t0b); return mix(c0, c1, k); }
    }
    return STRESS_STOPS.at(-1)![1];
  }
  function mix(a: string, b: string, k: number): string {
    const p = (s: string, i: number): number => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
    return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k)).join(',')})`;
  }

  // ---------- animación de la consecuencia ----------
  function stepAnim(dt: number): void {
    const vis = st.visual!;
    anim += dt;
    const sh = taller.shaft;
    const x = Math.min(1, anim / RAMP);
    const frac = x * x * (3 - 2 * x);
    if (!sh.metrics().roto && anim - dt < RAMP + 1e-9) applyLoad(fis.T * frac);
    if (anim > RAMP + 0.15) {
      if (vis.estado === 'sobra') { sh.setSurplus(vis.surplusScale); sh.setNeeded(vis.neededScale); }
      sh.setGhost(vis.ghostScale);
      if (banner.hidden) {
        banner.hidden = false;
        banner.className = `em-banner ${vis.estado}`;
        banner.innerHTML = '';
        banner.append(vis.titulo);
        const sm = document.createElement('small');
        sm.textContent = vis.texto;
        banner.append(sm);
      }
    }
    if (anim >= RAMP + HOLD && st.fase === 'animando') {
      st.fase = 'resultado';
      if (panel.plegado) panel.toggle(false);
      render();
    }
  }

  function screenOf(what: 'llave' | 'extremo' | 'asaL' | 'asaC'): { x: number; y: number } {
    const p = what === 'extremo' ? taller.shaft.group.localToWorld(new THREE.Vector3(taller.shaft.Lv, 0, 0)) : grab.grabPoint(what);
    return taller.toScreen(p, W, H);
  }

  const hook: EjeMacizoHook = {
    id: MODULO,
    get state() {
      const v = st.veredicto;
      const f = st.formula;
      return {
        fase: st.fase, exerciseId: inst.exerciseId, variante: inst.variante, instancia: inst,
        formulaId: f?.id ?? null, slots: structuredClone(st.slots),
        bindings: f ? Object.fromEntries(f.variables.map((x) => [x, binding(x, f)])) : {},
        prediccion: st.prediccion, confianza: st.confianza, pistasUsadas: st.pistas.length, pistas: [...st.pistas],
        intentos: st.intentos, presentacion: st.presentacion, mostrarEjemplo: st.mostrarEjemplo, mensaje: st.mensaje,
        ayuda: ayuda(),
        veredicto: v ? { resultado: v.resultado, errorId: v.errorId ?? null, errorNombre: v.error?.nombre ?? null, valorMostrado: v.valor?.mostrado ?? null, prediccionAcierta: v.prediccion?.acierta ?? null } : null,
        diagnostico: st.diag, visual: st.visual,
        fisica: { T: fis.T, c: fis.c, L: fis.L, G: fis.G, phiFull: fis.phiFull, exageracion: fis.N, tauAdm: fis.tauAdm, material: fis.material.nombre },
        shaft: taller.shaft.metrics(),
        modo: modoExplora ? 'explorar' : 'ejercicio',
        carga: { T: carga.T, snapped: carga.snapped, tPorPx: tPorPx(), pxRango: PX_RANGO, hover: grab.hover, agarrando: grab.dragging?.kind ?? null },
        arm: (() => {
          const tip = grab.arm.tip;
          const k = grab.dragging?.kind ?? null;
          const gp = k ? grab.grabPoint(k) : null;
          return { tip: { x: tip.x, y: tip.y, z: tip.z }, agarre: gp ? { x: gp.x, y: gp.y, z: gp.z } : null, dist: gp ? tip.distanceTo(gp) : null, largo: grab.arm.length };
        })(),
        explora: { T: ex.T, L: ex.L, c: ex.c, G: ex.material.G, material: ex.material.nombre, Lv: taller.shaft.Lv, rv: taller.shaft.rv, escala: LV / fis.L },
        panelPlegado: panel.plegado,
      };
    },
    selectFormula: act.selectFormula, bind: act.bind, clear: act.clear, scale: act.scale, convert: act.convert,
    predict: act.predict, confidence: act.confidence, apply: (o) => act.apply(o ?? {}), autoCarga: act.autoCarga, explorar: (on) => act.explorar(on), hint: act.hint, corregir: act.corregir, otro: act.otro,
    nuevo: (o) => nuevo(o ?? {}), exit: act.exit, screenOf, taller,
  };
  const g0 = gh();
  if (g0) g0.module = hook;

  nuevo();
  layout();

  return {
    scene: taller.scene,
    camera: taller.camera,
    update(dt) {
      taller.update(dt);
      grab.update(dt);
      if (st.fase === 'animando') stepAnim(dt);
      if (st.fase === 'cargando' && !grab.dragging && carga.T > 0 && !carga.snapped) {
        carga.T = carga.T < 1e-3 * fis.T ? 0 : carga.T * Math.exp(-6 * dt);
        applyLoad(carga.T);
      }
      ayudaTimer += dt;
      if (ayudaTimer > 0.5) {
        ayudaTimer = 0;
        const a = ayuda();
        if (JSON.stringify(a) !== JSON.stringify(st.ayuda)) { st.ayuda = a; panel.updateAyuda(st); }
      }
    },
    resize() { layout(); },
    dispose() {
      removeEventListener('em-layout', onLayout);
      panel.dispose();
      grab.dispose();
      taller.dispose();
      const g1 = gh();
      if (g1?.module === hook) delete g1.module;
    },
  };
}
