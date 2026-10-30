import { describe, expect, it } from 'vitest';
import { generate } from '../../src/engine/generator';
import { judge, type Submission } from '../../src/engine/judge';
import { consecuenciaVisual, exageracionPara, MATERIALES, phiReal, tauEn } from '../../src/game/modules/ejeMacizo/consecuencia';
import { exprToLatex } from '../../src/ui/exprLatex';
import { torsion } from './helpers';

const sub = (c: number, cu = 'm', formulaId = 'tau_max_macizo'): Submission => ({
  formulaId, bindings: { T: { valor: 1500, unidad: 'N·m' }, c: { valor: c, unidad: cu } }, confianza: 'media',
});

describe('consecuencia visual del eje macizo', () => {
  const v0 = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 0 });

  it('φ y τ siguen las fórmulas exactas; la exageración es redonda', () => {
    expect(tauEn(1500, 0.02, 0.02)).toBeCloseTo(119.366e6, -3);
    expect(phiReal(1500, 0.5, 0.02, 77e9)).toBeCloseTo(0.0387553, 6);
    expect(exageracionPara(0.0387553)).toBe(20);
    expect(exageracionPara(0.9)).toBe(1);
  });

  it('correcto: estado real (rompe a 1,05/u de la carga), sin fantasma', () => {
    const v = judge(torsion, v0, sub(0.02));
    const vis = consecuenciaVisual(v0, v, MATERIALES.acero, 0.02);
    expect(vis.estado).toBe('rompe');
    expect(vis.fractura).toBe('ductil');
    expect(vis.breakAt).toBeCloseTo(1.05 / 1.19366, 4);
    expect(vis.ghostScale).toBe(null);
    expect(consecuenciaVisual(v0, v, MATERIALES.fundicion, 0.02).fractura).toBe('fragil');
  });

  it('diámetro por radio y mm sin convertir: mismo estado, fantasma distinto (×2 y ×1000)', () => {
    const a = consecuenciaVisual(v0, judge(torsion, v0, sub(0.04)), MATERIALES.acero, 0.02);
    const b = consecuenciaVisual(v0, judge(torsion, v0, sub(20)), MATERIALES.acero, 0.02);
    expect(a.estado).toBe('rompe');
    expect(b.estado).toBe('rompe');
    expect(a.ghostScale).toBeCloseTo(2, 9);
    expect(b.ghostScale).toBeCloseTo(1000, 6);
    expect(a.decisionJugador).toBe('aprueba');
    expect(a.decisionCoincide).toBe(false);
  });

  it('rechazar un eje que bastaba → sobra (engordado hasta que tu τ pase)', () => {
    const v1 = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 1 });
    const v = judge(torsion, v1, { ...sub(0.02, 'm', 'tau_j_cuarto'), bindings: { T: { valor: 800, unidad: 'N·m' }, c: { valor: 0.02, unidad: 'm' } } });
    expect(v.errorId).toBe('j_polar_cuarto');
    const vis = consecuenciaVisual(v1, v, MATERIALES.acero, 0.02);
    expect(vis.estado).toBe('sobra');
    expect(vis.surplusScale).toBeCloseTo(Math.cbrt(2 * v1.fisica!.utilizacion), 9);
  });

  it('eje real con material de sobra: núcleo que bastaba', () => {
    const v2 = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 2 });
    const v = judge(torsion, v2, { formulaId: 'tau_max_macizo', bindings: { T: { valor: 2000, unidad: 'N·m' }, c: { valor: 0.03, unidad: 'm' } }, confianza: 'alta' });
    const vis = consecuenciaVisual(v2, v, MATERIALES.acero, 0.03);
    expect(vis.estado).toBe('sobra');
    expect(vis.neededScale).toBeCloseTo(Math.cbrt(v2.fisica!.utilizacion), 9);
  });

  it('exprToLatex: fracciones, potencias y huecos compuestos', () => {
    expect(exprToLatex('T*c/(pi*c^4/2)')).toBe('\\dfrac{T\\,c}{\\dfrac{\\pi\\,{c}^{4}}{2}}');
    expect(exprToLatex('T*c/(pi*c^4/2)', (v) => `[${v}]`, true)).toBe('\\dfrac{[T]\\cdot [c]}{\\dfrac{\\pi\\cdot {\\left([c]\\right)}^{4}}{2}}');
  });
});
