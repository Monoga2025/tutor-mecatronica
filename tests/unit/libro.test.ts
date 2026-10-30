// Verificación contra contenido/fuentes/3_torsion.pdf (diapositivas Beer–Johnston–DeWolf, Mechanics of Materials 3.ª ed., cap. 3).
// Texto extraído con pypdf; las páginas citadas son las del PDF (coinciden con la numeración "3 - n" de las diapositivas).
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/engine/generator';
import { evaluarFormula } from '../../src/engine/judge';
import { convert, fromSI } from '../../src/engine/units';
import { torsion } from './helpers';

const calc = (id: string, b: Record<string, [number, string]>): number => {
  const r = evaluarFormula(torsion, id, Object.fromEntries(Object.entries(b).map(([k, [valor, unidad]]) => [k, { valor, unidad }])));
  if (!r.ok) throw new Error(r.motivo);
  return r.si;
};
const rel = (x: number, ref: number): number => Math.abs(x - ref) / Math.abs(ref);

describe('Sample Problem 3.1 (p. 11–13): eje hueco BC y dimensionamiento de AB/CD', () => {
  // p. 12: T_BC = 20 kN·m. p. 13: c1 = 45 mm, c2 = 60 mm, J = 13.92×10⁻⁶ m⁴, τmax = 86.2 MPa, τmin = 64.7 MPa.
  it('τmax del eje hueco = 86.2 MPa', () => {
    const tau = fromSI(calc('tau_max_hueco', { T: [20, 'kN·m'], c1: [45, 'mm'], c2: [60, 'mm'] }), 'MPa');
    expect(rel(tau, 86.2)).toBeLessThan(0.002);
  });
  it('la variante 0 del ejercicio eje_hueco reproduce J, τmax y, como error "radio interior", τmin', () => {
    const inst = generate(torsion, 'eje_hueco_aprueba', 0, { variante: 0 });
    const J = inst.pasos.find((p) => p.simbolo === 'J')!;
    expect(rel(J.si!, 13.92e-6)).toBeLessThan(0.002);
    expect(rel(inst.correcto.mostrado, 86.2)).toBeLessThan(0.002);
    expect(rel(inst.errores.find((e) => e.id === 'radio_interior')!.mostrado, 64.7)).toBeLessThan(0.002);
  });
  // p. 13: T = 6 kN·m, τadm = 65 MPa → c = 38.9×10⁻³ m, d = 2c = 77.8 mm.
  it('diámetro mínimo de AB = 77.8 mm (variante 0 de dimensionar_macizo)', () => {
    const d = fromSI(calc('diametro_minimo', { T: [6, 'kN·m'], tau: [65, 'MPa'] }), 'mm');
    expect(rel(d, 77.8)).toBeLessThan(0.002);
    const inst = generate(torsion, 'dimensionar_macizo', 0, { variante: 0 });
    expect(rel(inst.correcto.mostrado, 77.8)).toBeLessThan(0.002);
    expect(rel(inst.pasos.find((p) => p.simbolo === 'c')!.valor!, 38.9)).toBeLessThan(0.002);
  });
});

describe('Sample Problem 3.4 (p. 16–18): ejes macizos con engranajes, G = 11.2×10⁶ psi, τadm = 8 ksi', () => {
  // p. 18: τmax = T·c/J con c_AB = 0.375 in → T0 = 663 lb·in; con c_CD = 0.5 in y T_CD = 2.8·T0 → T0 = 561 lb·in.
  it('esfuerzo en eje macizo: T0 = 663 lb·in en AB (c = 0.375 in) da 8000 psi', () => {
    const tau = fromSI(calc('tau_max_macizo', { T: [663, 'lb·in'], c: [0.375, 'in'] }), 'psi');
    expect(rel(tau, 8000)).toBeLessThan(0.001);
  });
  it('esfuerzo en eje macizo: T_CD = 2.8·561 lb·in en CD (c = 0.5 in) da 8000 psi', () => {
    const tau = fromSI(calc('tau_max_macizo', { T: [2.8 * 561, 'lb·in'], c: [0.5, 'in'] }), 'psi');
    expect(rel(tau, 8000)).toBeLessThan(0.002);
  });
  // p. 18: φ_A/B = T L/(G J) con T = 561 lb·in, L = 24 in, c = 0.375 in → "0.387 rad = 2.22°".
  // El texto extraído muestra "0.387 rad" pero 2.22° = 0.0387 rad (se pierde el cero en la extracción o es errata).
  it('ángulo de giro AB = 2.22° (0.0387 rad)', () => {
    const G: [number, string] = [11.2e6, 'psi'], L: [number, string] = [24, 'in'];
    const phiAB = calc('phi_macizo', { T: [561, 'lb·in'], L, c: [0.375, 'in'], G });
    expect(convert(phiAB, 'rad', '°')).toBeCloseTo(2.22, 2);
    expect(phiAB).toBeCloseTo(0.0387, 4);
  });
  // p. 18: φ_C/D se escribe con 2.8·(561 lb·in)·(24 in)/[(π/2)(0.5 in)⁴ (11.2×10⁶ psi)] = "0.514 rad = 2.95°".
  // Con esos datos literales el motor da 1.96°; 2.95° correspondería a L_CD = 36 in, que solo aparecería en la figura
  // (no legible como texto). NO verificado: se documenta la discrepancia en vez de inventar el dato.
  it('ángulo de giro CD con los datos literales de la diapositiva (discrepancia documentada)', () => {
    const phiCD = convert(calc('phi_macizo', { T: [2.8 * 561, 'lb·in'], L: [24, 'in'], c: [0.5, 'in'], G: [11.2e6, 'psi'] }), 'rad', '°');
    expect(phiCD).toBeCloseTo(1.964, 2);
    expect(rel(phiCD * 36 / 24, 2.95)).toBeLessThan(0.005);
  });
});
