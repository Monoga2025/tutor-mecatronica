import { z } from 'zod';
import { parse, variablesOf as varsOf } from './expr';
import { isUnit } from './units';

const unidad = z.string().refine(isUnit, { message: 'unidad desconocida' });
const exprStr = z.string().min(1).refine((s) => { try { parse(s); return true; } catch { return false; } }, { message: 'expresión inválida' });

export const CONSECUENCIAS = ['rompe', 'sobra', 'gira_mas', 'gira_menos', 'se_calienta', 'no_arranca'] as const;
export type Consecuencia = (typeof CONSECUENCIAS)[number];

const KcSchema = z.object({ id: z.string().min(1), nombre: z.string().min(1), descripcion: z.string().optional() });

const FormulaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().optional(),
  latex: z.string().min(1),
  expr: exprStr,
  resultado: z.object({ simbolo: z.string().min(1), unidad }),
  variables: z.array(z.string().min(1)).min(1),
  /** Unidad SI de referencia de cada variable de la fórmula (para validar dimensiones de lo que arrastra el jugador). */
  unidades: z.record(z.string(), unidad).optional(),
  distractor: z.boolean().optional(),
});

const VariableSchema = z.object({
  simbolo: z.string().min(1),
  nombre: z.string().min(1),
  unidad_mostrada: unidad,
  valores: z.array(z.number().finite()).min(1),
});

const ErrorSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().min(1),
  expr_equivocada: exprStr,
  consecuencia: z.enum(CONSECUENCIAS),
  consecuencia_texto: z.string().optional(),
  pista_diagnostico: z.string().min(1),
  kcs: z.array(z.string()).optional(),
});

const PasoSchema = z.object({
  texto: z.string().min(1),
  latex: z.string().optional(),
  simbolo: z.string().optional(),
  expr: exprStr.optional(),
  unidad: unidad.optional(),
});

const LimiteSchema = z.object({ valor: z.union([z.number(), z.array(z.number())]), unidad });

const EjercicioSchema = z.object({
  id: z.string().min(1),
  modulo: z.string().min(1),
  titulo: z.string().optional(),
  kcs: z.array(z.string()).min(1),
  dificultad: z.number().min(1).max(5).default(2),
  enunciado: z.string().min(1),
  variables: z.array(VariableSchema).min(1),
  /** 'indice': la variante i toma valores[i] de cada variable; 'producto': combinación libre. */
  combinar: z.enum(['indice', 'producto']).default('indice'),
  incognita: z.object({ simbolo: z.string().min(1), nombre: z.string().optional(), unidad }),
  formula_correcta: z.string().min(1),
  /** Cómo se obtienen las variables de la fórmula a partir de los datos (p. ej. c = d/2). Por omisión, identidad. */
  asignacion: z.record(z.string(), exprStr).optional(),
  pasos: z.array(PasoSchema).default([]),
  errores: z.array(ErrorSchema).default([]),
  pistas: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  limites: z.object({ tau_adm: LimiteSchema.optional(), phi_adm: LimiteSchema.optional() }).default({}),
  prediccion: z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('aprueba') }),
    z.object({ tipo: z.literal('valor'), tolerancia: z.number().positive().default(0.25) }),
  ]).optional(),
  /** Consecuencia física si el jugador subestima o sobreestima la incógnita. */
  consecuencias: z.object({ subestima: z.enum(CONSECUENCIAS), sobreestima: z.enum(CONSECUENCIAS) }).optional(),
});

export const PackSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  version: z.number().int().optional(),
  kcs: z.array(KcSchema).min(1),
  formulas: z.array(FormulaSchema).min(1),
  ejercicios: z.array(EjercicioSchema).min(1),
}).superRefine((p, ctx) => {
  const variablesOf = (src: string): string[] => { try { return varsOf(src); } catch { return []; } };
  const kcIds = new Set(p.kcs.map((k) => k.id));
  const fIds = new Map(p.formulas.map((f) => [f.id, f]));
  const dup = (ids: string[], what: string): void => {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) ctx.addIssue({ code: 'custom', message: `${what} duplicado: ${id}` }); seen.add(id); }
  };
  dup(p.kcs.map((k) => k.id), 'KC');
  dup(p.formulas.map((f) => f.id), 'fórmula');
  dup(p.ejercicios.map((e) => e.id), 'ejercicio');
  for (const f of p.formulas) {
    const extra = variablesOf(f.expr).filter((v) => !f.variables.includes(v));
    if (extra.length) ctx.addIssue({ code: 'custom', message: `fórmula ${f.id}: variables no declaradas ${extra.join(',')}` });
  }
  for (const e of p.ejercicios) {
    const where = `ejercicio ${e.id}`;
    for (const k of e.kcs) if (!kcIds.has(k)) ctx.addIssue({ code: 'custom', message: `${where}: KC desconocido ${k}` });
    for (const er of e.errores) for (const k of er.kcs ?? []) if (!kcIds.has(k)) ctx.addIssue({ code: 'custom', message: `${where}/${er.id}: KC desconocido ${k}` });
    const f = fIds.get(e.formula_correcta);
    if (!f) { ctx.addIssue({ code: 'custom', message: `${where}: fórmula desconocida ${e.formula_correcta}` }); continue; }
    if (e.combinar === 'indice') {
      const n = new Set(e.variables.map((v) => v.valores.length));
      for (const l of Object.values(e.limites)) if (l && Array.isArray(l.valor)) n.add(l.valor.length);
      if (n.size > 1) ctx.addIssue({ code: 'custom', message: `${where}: con combinar='indice' todas las listas de valores deben tener la misma longitud` });
    }
    const datos = new Set(e.variables.map((v) => v.simbolo));
    for (const k of Object.keys(e.limites)) datos.add(k);
    for (const fv of f.variables) {
      const a = e.asignacion?.[fv];
      const used = a ? variablesOf(a) : [fv];
      for (const u of used) if (!datos.has(u)) ctx.addIssue({ code: 'custom', message: `${where}: la variable ${fv} de la fórmula no se puede obtener de los datos` });
    }
    const known = new Set([...datos, e.incognita.simbolo]);
    for (const paso of e.pasos) {
      if (paso.expr) for (const u of variablesOf(paso.expr)) if (!known.has(u)) ctx.addIssue({ code: 'custom', message: `${where}: paso usa ${u} sin definir` });
      if (paso.simbolo) known.add(paso.simbolo);
    }
    for (const er of e.errores) for (const u of variablesOf(er.expr_equivocada)) if (!datos.has(u)) ctx.addIssue({ code: 'custom', message: `${where}/${er.id}: usa ${u} que no es un dato` });
  }
});

export type Pack = z.infer<typeof PackSchema>;
export type Ejercicio = Pack['ejercicios'][number];
export type Formula = Pack['formulas'][number];
export type ErrorTipico = Ejercicio['errores'][number];
export type PackInput = z.input<typeof PackSchema>;

export class PackError extends Error {
  constructor(message: string, readonly issues: string[]) { super(message); }
}

export function loadPack(json: unknown): Pack {
  const data = typeof json === 'string' ? (JSON.parse(json) as unknown) : json;
  const r = PackSchema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new PackError(`Paquete inválido:\n${issues.join('\n')}`, issues);
  }
  return r.data;
}

export function findExercise(pack: Pack, id: string): Ejercicio {
  const e = pack.ejercicios.find((x) => x.id === id);
  if (!e) throw new Error(`Ejercicio desconocido: ${id}`);
  return e;
}

export function findFormula(pack: Pack, id: string): Formula {
  const f = pack.formulas.find((x) => x.id === id);
  if (!f) throw new Error(`Fórmula desconocida: ${id}`);
  return f;
}
