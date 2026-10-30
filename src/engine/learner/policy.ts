import type { Ejercicio, Pack } from '../pack';
import type { LearnerModel } from './LearnerModel';
import type { ItemRepaso, Schedule } from './schedule';

export const ZONA_OBJETIVO = { min: 0.7, max: 0.8 } as const;
export const UMBRAL_DOMINIO = 0.95;

export type TipoEleccion = 'repaso' | 'nuevo';

export interface Eleccion {
  exerciseId: string;
  tipo: TipoEleccion;
  motivo: 'repaso_error' | 'repaso_kc' | 'kc_mas_debil';
  kcObjetivo?: string;
  errorId?: string;
  itemRepaso?: string;
  /** Para repasos de error: variante a evitar, así el error vuelve con otros valores. */
  evitarVariante?: number;
  pAcierto: number;
}

export interface PolicyContext {
  pack: Pack;
  model: LearnerModel;
  schedule: Schedule;
  now: number;
  ultimoTipo?: TipoEleccion | null;
  /** Restringe a ciertos módulos (p. ej. los desbloqueados). */
  modulos?: readonly string[];
}

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clampP = (p: number): number => Math.min(0.999, Math.max(0.001, p));

/** Probabilidad predicha de acertar: KC más débil del ejercicio, corregida por la dificultad (2 = neutra). */
export function pAcierto(ex: Ejercicio, model: LearnerModel): number {
  const pk = Math.min(...ex.kcs.map((k) => model.pCorrect(k)));
  return sigmoid(logit(clampP(pk)) - 0.4 * (ex.dificultad - 2));
}

function masCercanoAZona(cands: Ejercicio[], model: LearnerModel): { ex: Ejercicio; p: number } {
  const target = (ZONA_OBJETIVO.min + ZONA_OBJETIVO.max) / 2;
  let best = cands[0]!, bestP = pAcierto(best, model), bestD = Math.abs(bestP - target);
  for (const ex of cands.slice(1)) {
    const p = pAcierto(ex, model), d = Math.abs(p - target);
    if (d < bestD - 1e-12) { best = ex; bestP = p; bestD = d; }
  }
  return { ex: best, p: bestP };
}

function eleccionRepaso(item: ItemRepaso, cands: Ejercicio[], model: LearnerModel): Eleccion | undefined {
  if (item.tipo === 'error') {
    const conError = cands.filter((e) => e.errores.some((er) => er.id === item.ref));
    if (!conError.length) return undefined;
    const otro = conError.filter((e) => e.id !== item.exerciseId);
    const pool = otro.length ? otro : conError;
    const { ex, p } = masCercanoAZona(pool, model);
    const out: Eleccion = { exerciseId: ex.id, tipo: 'repaso', motivo: 'repaso_error', errorId: item.ref, itemRepaso: item.key, pAcierto: p };
    if (ex.id === item.exerciseId && item.variante !== undefined) out.evitarVariante = item.variante;
    return out;
  }
  const conKc = cands.filter((e) => e.kcs.includes(item.ref));
  if (!conKc.length) return undefined;
  const { ex, p } = masCercanoAZona(conKc, model);
  return { exerciseId: ex.id, tipo: 'repaso', motivo: 'repaso_kc', kcObjetivo: item.ref, itemRepaso: item.key, pAcierto: p };
}

function eleccionNueva(cands: Ejercicio[], model: LearnerModel): Eleccion {
  const kcs = [...new Set(cands.flatMap((e) => e.kcs))];
  const kc = kcs.reduce((a, b) => (model.pMastery(b) < model.pMastery(a) ? b : a));
  const { ex, p } = masCercanoAZona(cands.filter((e) => e.kcs.includes(kc)), model);
  return { exerciseId: ex.id, tipo: 'nuevo', motivo: 'kc_mas_debil', kcObjetivo: kc, pAcierto: p };
}

/** Siguiente ejercicio: alterna repaso vencido y material nuevo (KC más débil), con dificultad cerca de 70–80 % de acierto. */
export function siguienteEjercicio(ctx: PolicyContext): Eleccion {
  const cands = ctx.pack.ejercicios.filter((e) => !ctx.modulos || ctx.modulos.includes(e.modulo));
  if (!cands.length) throw new Error('No hay ejercicios disponibles');
  const repasos = ctx.schedule.vencidos(ctx.now)
    .map((it) => eleccionRepaso(it, cands, ctx.model))
    .filter((x): x is Eleccion => x !== undefined);
  const todoDominado = cands.every((e) => e.kcs.every((k) => ctx.model.pMastery(k) >= UMBRAL_DOMINIO));
  if (repasos.length && (ctx.ultimoTipo !== 'repaso' || todoDominado)) return repasos[0]!;
  return eleccionNueva(cands, ctx.model);
}

// ---------- Política de ayuda ----------

export interface EstadoIntento {
  intentos: number;
  erroresSeguidos: number;
  segundos: number;
  pistasUsadas: number;
}

export interface ConfigAyuda {
  ofrecerTrasIntentos: number;
  ofrecerTrasSegundos: number;
  cortarTrasErroresSeguidos: number;
  cortarTrasSegundos: number;
}

export const AYUDA_DEFAULT: ConfigAyuda = {
  ofrecerTrasIntentos: 2,
  ofrecerTrasSegundos: 120,
  cortarTrasErroresSeguidos: 4,
  cortarTrasSegundos: 600,
};

export type DecisionAyuda =
  | { accion: 'esperar'; motivo: 'primer_intento' | 'fracaso_productivo' }
  | { accion: 'ofrecer_pista'; escalon: 0 | 1 | 2; motivo: 'intentos' | 'tiempo' }
  | { accion: 'cortar'; motivo: 'errores_seguidos' | 'tiempo' | 'sin_pistas'; sugerencia: 'ejemplo_resuelto' };

/**
 * Deja intentar (fracaso productivo); ofrece la siguiente pista tras N intentos o T segundos;
 * corta (ejemplo resuelto) tras muchos errores seguidos, demasiado tiempo, o si ya gastó las tres pistas y sigue fallando.
 * La pista se OFRECE: el jugador decide si la abre.
 */
export function decidirAyuda(s: EstadoIntento, cfg: ConfigAyuda = AYUDA_DEFAULT): DecisionAyuda {
  if (s.erroresSeguidos >= cfg.cortarTrasErroresSeguidos) return { accion: 'cortar', motivo: 'errores_seguidos', sugerencia: 'ejemplo_resuelto' };
  if (s.segundos >= cfg.cortarTrasSegundos) return { accion: 'cortar', motivo: 'tiempo', sugerencia: 'ejemplo_resuelto' };
  if (s.pistasUsadas >= 3 && s.erroresSeguidos >= 1) return { accion: 'cortar', motivo: 'sin_pistas', sugerencia: 'ejemplo_resuelto' };
  const porIntentos = s.intentos >= cfg.ofrecerTrasIntentos + s.pistasUsadas;
  const porTiempo = s.segundos >= cfg.ofrecerTrasSegundos * (s.pistasUsadas + 1);
  if (s.pistasUsadas < 3 && (porIntentos || porTiempo)) {
    return { accion: 'ofrecer_pista', escalon: s.pistasUsadas as 0 | 1 | 2, motivo: porIntentos ? 'intentos' : 'tiempo' };
  }
  return { accion: 'esperar', motivo: s.intentos === 0 ? 'primer_intento' : 'fracaso_productivo' };
}

/** Ejemplo resuelto primero y luego se retiran los pasos. */
export type Presentacion = 'ejemplo_resuelto' | 'pasos_parciales' | 'sin_pasos';
export function presentacion(vecesVisto: number): Presentacion {
  if (vecesVisto <= 0) return 'ejemplo_resuelto';
  if (vecesVisto <= 2) return 'pasos_parciales';
  return 'sin_pasos';
}
