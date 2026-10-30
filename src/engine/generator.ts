import { evaluate } from './expr';
import { findExercise, findFormula, type Consecuencia, type Ejercicio, type Pack } from './pack';
import { mulberry32 } from './rng';
import { formatQuantity, fromSI, toSI } from './units';

export interface Cantidad { valor: number; unidad: string; si: number }

export interface PasoInstancia { texto: string; latex?: string; simbolo?: string; valor?: number; unidad?: string; si?: number }

export interface ErrorInstancia {
  id: string; nombre: string; descripcion: string; consecuencia: Consecuencia; consecuencia_texto?: string;
  pista_diagnostico: string; kcs?: string[]; expr: string;
  si: number; mostrado: number;
}

export type EstadoFisico = 'rompe' | 'al_limite' | 'ok' | 'sobra';

export interface Fisica { limite: 'tau_adm' | 'phi_adm'; utilizacion: number; aprueba: boolean; estado: EstadoFisico }

export interface Instance {
  packId: string;
  exerciseId: string;
  modulo: string;
  seed: number;
  variante: number;
  nVariantes: number;
  kcs: string[];
  dificultad: number;
  enunciado: string;
  datos: Record<string, Cantidad & { nombre: string }>;
  limites: Partial<Record<'tau_adm' | 'phi_adm', Cantidad>>;
  formulaCorrecta: string;
  /** Valores (SI) de las variables de la fórmula correcta, ya obtenidas de los datos. */
  asignacionSI: Record<string, number>;
  incognita: { simbolo: string; nombre?: string; unidad: string };
  correcto: { si: number; mostrado: number };
  pasos: PasoInstancia[];
  errores: ErrorInstancia[];
  pistas: [string, string, string];
  prediccion?: Ejercicio['prediccion'];
  consecuencias?: Ejercicio['consecuencias'];
  fisica?: Fisica;
}

export interface GenerateOptions { evitarVariante?: number; variante?: number }

export function variantCount(e: Ejercicio): number {
  if (e.combinar === 'indice') return e.variables[0]!.valores.length;
  return e.variables.reduce((n, v) => n * v.valores.length, 1);
}

function pickIndices(e: Ejercicio, variante: number): number[] {
  if (e.combinar === 'indice') return e.variables.map(() => variante);
  const idx: number[] = [];
  let r = variante;
  for (const v of e.variables) { idx.push(r % v.valores.length); r = Math.floor(r / v.valores.length); }
  return idx;
}

export function estadoFisico(u: number): EstadoFisico {
  if (u > 1.05) return 'rompe';
  if (u > 1) return 'al_limite';
  if (u < 0.8) return 'sobra';
  return 'ok';
}

export function generate(pack: Pack, exerciseId: string, seed: number, opts: GenerateOptions = {}): Instance {
  const e = findExercise(pack, exerciseId);
  const f = findFormula(pack, e.formula_correcta);
  const n = variantCount(e);
  let variante = opts.variante ?? Math.floor(mulberry32(seed)() * n);
  if (variante < 0 || variante >= n) throw new Error(`Variante fuera de rango: ${variante}`);
  if (opts.evitarVariante === variante && n > 1) variante = (variante + 1) % n;
  const idx = pickIndices(e, variante);

  const scope: Record<string, number> = {};
  const raw: Record<string, number> = {};
  const datos: Instance['datos'] = {};
  e.variables.forEach((v, i) => {
    const valor = v.valores[idx[i]!]!;
    const si = toSI(valor, v.unidad_mostrada);
    scope[v.simbolo] = si; raw[v.simbolo] = valor;
    datos[v.simbolo] = { valor, unidad: v.unidad_mostrada, si, nombre: v.nombre };
  });
  const limites: Instance['limites'] = {};
  for (const [k, l] of Object.entries(e.limites) as [keyof Instance['limites'], { valor: number | number[]; unidad: string } | undefined][]) {
    if (!l) continue;
    const valor = Array.isArray(l.valor) ? l.valor[variante % l.valor.length]! : l.valor;
    const si = toSI(valor, l.unidad);
    limites[k] = { valor, unidad: l.unidad, si };
    scope[k] = si; raw[k] = valor;
  }

  const asignacionSI: Record<string, number> = {};
  for (const fv of f.variables) asignacionSI[fv] = evaluate(e.asignacion?.[fv] ?? fv, scope, raw);
  const correctoSI = evaluate(f.expr, asignacionSI);
  const unidad = e.incognita.unidad;
  const correcto = { si: correctoSI, mostrado: fromSI(correctoSI, unidad) };

  const pasoScope: Record<string, number> = { ...scope, [e.incognita.simbolo]: correctoSI };
  const pasos: PasoInstancia[] = e.pasos.map((p) => {
    const out: PasoInstancia = { texto: p.texto };
    if (p.latex) out.latex = p.latex;
    if (p.simbolo) out.simbolo = p.simbolo;
    if (p.expr) {
      const si = evaluate(p.expr, pasoScope, raw);
      if (p.simbolo) pasoScope[p.simbolo] = si;
      out.si = si;
      out.valor = p.unidad ? fromSI(si, p.unidad) : si;
      if (p.unidad) out.unidad = p.unidad;
    }
    return out;
  });

  const errores: ErrorInstancia[] = e.errores.map((er) => {
    const si = evaluate(er.expr_equivocada, scope, raw);
    const out: ErrorInstancia = {
      id: er.id, nombre: er.nombre, descripcion: er.descripcion, consecuencia: er.consecuencia,
      pista_diagnostico: er.pista_diagnostico, expr: er.expr_equivocada, si, mostrado: fromSI(si, unidad),
    };
    if (er.consecuencia_texto) out.consecuencia_texto = er.consecuencia_texto;
    if (er.kcs) out.kcs = er.kcs;
    return out;
  });

  const enunciado = e.enunciado.replace(/\{([^}]+)\}/g, (m, k: string) => {
    const d = datos[k] ?? limites[k as keyof Instance['limites']];
    return d ? formatQuantity(d.valor, d.unidad, 4) : m;
  });

  const inst: Instance = {
    packId: pack.id, exerciseId: e.id, modulo: e.modulo, seed, variante, nVariantes: n,
    kcs: [...e.kcs], dificultad: e.dificultad, enunciado, datos, limites,
    formulaCorrecta: f.id, asignacionSI, incognita: { ...e.incognita }, correcto, pasos, errores,
    pistas: [...e.pistas] as [string, string, string],
  };
  if (e.prediccion) inst.prediccion = e.prediccion;
  if (e.consecuencias) inst.consecuencias = e.consecuencias;
  const lim = limites.tau_adm ? 'tau_adm' : limites.phi_adm ? 'phi_adm' : undefined;
  if (lim) {
    const u = correctoSI / limites[lim]!.si;
    inst.fisica = { limite: lim, utilizacion: u, aprueba: u <= 1, estado: estadoFisico(u) };
  }
  return inst;
}

/** Todas las instancias posibles de un ejercicio (para pruebas y para el modo examen). */
export function allVariants(pack: Pack, exerciseId: string): Instance[] {
  const e = findExercise(pack, exerciseId);
  return Array.from({ length: variantCount(e) }, (_, i) => generate(pack, exerciseId, 0, { variante: i }));
}
