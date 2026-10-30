import { evaluate, ExprError } from './expr';
import { findFormula, type Consecuencia, type Pack } from './pack';
import type { ErrorInstancia, Fisica, Instance } from './generator';
import { compatible, fromSI, toSI, UnitError } from './units';

export const TOLERANCIA = 0.03;

export type Confianza = 'baja' | 'media' | 'alta';

export interface Binding { valor: number; unidad: string }

export interface Submission {
  formulaId: string;
  bindings: Record<string, Binding>;
  /** 'aprueba' | 'no_aprueba' para ejercicios de criterio; número (en la unidad de la incógnita) para predicción de valor. */
  prediccion?: string | number | boolean;
  confianza: Confianza;
}

export type Resultado = 'correcto' | 'error' | 'no_clasificado' | 'invalido';

export interface Verdict {
  resultado: Resultado;
  correcto: boolean;
  errorId?: string;
  error?: ErrorInstancia;
  motivoInvalido?: string;
  formulaElegidaCorrecta: boolean;
  valor?: { si: number; mostrado: number; unidad: string };
  esperado: { si: number; mostrado: number; unidad: string };
  /** (valor − esperado)/esperado */
  desviacion?: number;
  consecuencia: Consecuencia | 'ninguna';
  fisica?: Fisica & { utilizacionJugador?: number; apruebaSegunJugador?: boolean };
  prediccion?: { dada: string | number | boolean; acierta: boolean };
  confianza: Confianza;
  kcs: string[];
}

export function within(x: number, ref: number, tol = TOLERANCIA): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(ref)) return false;
  if (ref === 0) return Math.abs(x) <= tol;
  return Math.abs(x - ref) <= tol * Math.abs(ref);
}

export type EvalResult = { ok: true; si: number } | { ok: false; motivo: string };

/** Calcula una fórmula del banco con los valores que el jugador colocó (convierte cada uno a SI). */
export function evaluarFormula(pack: Pack, formulaId: string, bindings: Record<string, Binding>): EvalResult {
  let f;
  try { f = findFormula(pack, formulaId); } catch { return { ok: false, motivo: `Fórmula desconocida: ${formulaId}` }; }
  const scope: Record<string, number> = {};
  for (const v of f.variables) {
    const b = bindings[v];
    if (!b) return { ok: false, motivo: `Falta colocar ${v}` };
    if (!Number.isFinite(b.valor)) return { ok: false, motivo: `Valor no numérico en ${v}` };
    try {
      const ref = f.unidades?.[v];
      if (ref && !compatible(b.unidad, ref)) return { ok: false, motivo: `${v} necesita unidades de ${ref}, no ${b.unidad}` };
      scope[v] = toSI(b.valor, b.unidad);
    } catch (e) {
      if (e instanceof UnitError) return { ok: false, motivo: e.message };
      throw e;
    }
  }
  try {
    const si = evaluate(f.expr, scope);
    if (!Number.isFinite(si)) return { ok: false, motivo: 'El cálculo no da un número finito' };
    return { ok: true, si };
  } catch (e) {
    if (e instanceof ExprError) return { ok: false, motivo: e.message };
    throw e;
  }
}

function predAcierta(inst: Instance, p: string | number | boolean): boolean {
  const cfg = inst.prediccion;
  if (!cfg) return false;
  if (cfg.tipo === 'aprueba') {
    const dice = p === true || p === 'aprueba' || p === 'si' || p === 'sí';
    return inst.fisica ? dice === inst.fisica.aprueba : false;
  }
  return typeof p === 'number' && within(p, inst.correcto.mostrado, cfg.tolerancia);
}

export function judge(pack: Pack, inst: Instance, sub: Submission): Verdict {
  const unidad = inst.incognita.unidad;
  const base: Verdict = {
    resultado: 'invalido', correcto: false, formulaElegidaCorrecta: sub.formulaId === inst.formulaCorrecta,
    esperado: { si: inst.correcto.si, mostrado: inst.correcto.mostrado, unidad },
    consecuencia: 'ninguna', confianza: sub.confianza, kcs: [...inst.kcs],
  };
  if (inst.fisica) base.fisica = { ...inst.fisica };
  if (sub.prediccion !== undefined && inst.prediccion) base.prediccion = { dada: sub.prediccion, acierta: predAcierta(inst, sub.prediccion) };

  const r = evaluarFormula(pack, sub.formulaId, sub.bindings);
  if (!r.ok) return { ...base, motivoInvalido: r.motivo };
  const f = findFormula(pack, sub.formulaId);
  const si = r.si;
  if (!compatible(f.resultado.unidad, unidad)) return { ...base, motivoInvalido: `Esa fórmula calcula ${f.resultado.simbolo}, no ${inst.incognita.simbolo}` };
  const v: Verdict = { ...base, valor: { si, mostrado: fromSI(si, unidad), unidad }, desviacion: (si - inst.correcto.si) / inst.correcto.si };
  if (v.fisica) {
    const lim = inst.limites[v.fisica.limite]!;
    v.fisica.utilizacionJugador = si / lim.si;
    v.fisica.apruebaSegunJugador = si <= lim.si;
  }
  if (within(si, inst.correcto.si)) return { ...v, resultado: 'correcto', correcto: true };
  const er = inst.errores.find((x) => within(si, x.si));
  if (er) return { ...v, resultado: 'error', errorId: er.id, error: er, consecuencia: er.consecuencia };
  const c = inst.consecuencias;
  return { ...v, resultado: 'no_clasificado', consecuencia: c ? (si < inst.correcto.si ? c.subestima : c.sobreestima) : 'ninguna' };
}

export interface ObservacionKC { kc: string; correcto: boolean }

/**
 * Qué evidencia aporta un veredicto a cada KC. Un error clasificado con KCs propios
 * penaliza solo esos KCs y cuenta como acierto en el resto; si no se clasifica, todos fallan.
 */
export function observaciones(v: Verdict, inst: Instance): ObservacionKC[] {
  if (v.resultado === 'correcto') return inst.kcs.map((kc) => ({ kc, correcto: true }));
  if (v.resultado === 'error' && v.error?.kcs?.length) {
    const bad = new Set(v.error.kcs);
    return inst.kcs.map((kc) => ({ kc, correcto: !bad.has(kc) })).concat(
      v.error.kcs.filter((k) => !inst.kcs.includes(k)).map((kc) => ({ kc, correcto: false })));
  }
  return inst.kcs.map((kc) => ({ kc, correcto: false }));
}
