import { describe, expect, it } from 'vitest';
import { allVariants, generate, type Instance } from '../../src/engine/generator';
import { evaluarFormula, judge, observaciones, within, type Submission } from '../../src/engine/judge';
import { findFormula } from '../../src/engine/pack';
import { packConDirecto, torsion } from './helpers';

const conf = 'media' as const;

/** Envío correcto: cada variable de la fórmula en su unidad SI de referencia. */
function correcta(inst: Instance): Submission {
  const f = findFormula(torsion, inst.formulaCorrecta);
  const bindings = Object.fromEntries(f.variables.map((v) => [v, { valor: inst.asignacionSI[v]!, unidad: f.unidades![v]! }]));
  return { formulaId: f.id, bindings, confianza: conf };
}

const directo = packConDirecto();
const siUnit = (inst: Instance): string => findFormula(torsion, inst.formulaCorrecta).resultado.unidad;
const valorDirecto = (inst: Instance, x: number): Submission => ({ formulaId: `directo_${siUnit(inst)}`, bindings: { x: { valor: x, unidad: siUnit(inst) } }, confianza: conf });

describe('juez', () => {
  it('within: tolerancia relativa 3 %', () => {
    expect(within(103, 100)).toBe(true);
    expect(within(96.9, 100)).toBe(false);
    expect(within(NaN, 1)).toBe(false);
  });

  it('acepta la respuesta correcta en todas las variantes de todos los ejercicios', () => {
    for (const e of torsion.ejercicios) for (const inst of allVariants(torsion, e.id)) {
      const v = judge(torsion, inst, correcta(inst));
      expect(v.resultado, `${e.id}#${inst.variante}`).toBe('correcto');
      expect(v.correcto).toBe(true);
      expect(v.formulaElegidaCorrecta).toBe(true);
      expect(v.consecuencia).toBe('ninguna');
    }
  });

  it('acepta redondeos de hasta 3 % y otras unidades (mm, kN·m)', () => {
    const inst = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 0 });
    const v = judge(torsion, inst, { formulaId: 'tau_max_macizo', bindings: { T: { valor: 1.5, unidad: 'kN·m' }, c: { valor: 20.15, unidad: 'mm' } }, confianza: 'alta' });
    expect(v.resultado).toBe('correcto');
  });

  it('clasifica cada error típico (valor de su expr_equivocada ±1 %) en todas las variantes', () => {
    for (const e of directo.ejercicios) for (const inst of allVariants(directo, e.id)) for (const er of inst.errores) {
      for (const f of [0.99, 1, 1.01]) {
        const v = judge(directo, inst, valorDirecto(inst, er.si * f));
        expect(v.resultado, `${e.id}#${inst.variante}/${er.id}`).toBe('error');
        expect(v.errorId).toBe(er.id);
        expect(v.consecuencia).toBe(er.consecuencia);
        expect(v.error?.pista_diagnostico).toBe(er.pista_diagnostico);
      }
    }
  });

  it('clasifica errores producidos por rutas reales del jugador', () => {
    const inst = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 0 });
    const T = { valor: 1.5, unidad: 'kN·m' };
    const cases: [Submission['bindings'], string, string][] = [
      [{ T, c: { valor: 40, unidad: 'mm' } }, 'tau_max_macizo', 'diametro_por_radio'],
      [{ T, c: { valor: 20, unidad: 'm' } }, 'tau_max_macizo', 'mm_sin_convertir'],
      [{ T: { valor: 1.5, unidad: 'N·m' }, c: { valor: 20, unidad: 'mm' } }, 'tau_max_macizo', 'knm_sin_convertir'],
      [{ T, c: { valor: 20, unidad: 'mm' } }, 'tau_j_cuarto', 'j_polar_cuarto'],
      [{ T, c: { valor: 20, unidad: 'mm' } }, 'tau_sin_pi', 'j_sin_pi'],
    ];
    for (const [bindings, formulaId, err] of cases) {
      const v = judge(torsion, inst, { formulaId, bindings, confianza: conf });
      expect(v.errorId, err).toBe(err);
      expect(v.formulaElegidaCorrecta).toBe(formulaId === 'tau_max_macizo');
    }
    const g = generate(torsion, 'predecir_giro_macizo', 0, { variante: 0 });
    const v = judge(torsion, g, { formulaId: 'phi_macizo', bindings: { T: { valor: 500, unidad: 'N·m' }, L: { valor: 1.5, unidad: 'm' }, c: { valor: 20, unidad: 'mm' }, G: { valor: 77, unidad: 'Pa' } }, confianza: conf });
    expect(v.errorId).toBe('g_gpa_sin_convertir');
    expect(v.consecuencia).toBe('gira_menos');
    const p = generate(torsion, 'potencia_rpm_torque', 0, { variante: 0 });
    const vp = judge(torsion, p, { formulaId: 'torque_sin_2pi', bindings: { P: { valor: 15, unidad: 'kW' }, f: { valor: 1200, unidad: 'rpm' } }, confianza: conf });
    expect(vp.errorId).toBe('sin_2pi');
    const vr = judge(torsion, p, { formulaId: 'torque_potencia', bindings: { P: { valor: 15, unidad: 'kW' }, f: { valor: 1200, unidad: 'Hz' } }, confianza: conf });
    expect(vr.errorId).toBe('rpm_como_hz');
  });

  it('no_clasificado cuando no coincide con nada, con consecuencia por sentido', () => {
    const inst = generate(directo, 'eje_macizo_aprueba', 0, { variante: 0 });
    const bajo = judge(directo, inst, valorDirecto(inst, inst.correcto.si * 0.8));
    expect(bajo.resultado).toBe('no_clasificado');
    expect(bajo.correcto).toBe(false);
    expect(bajo.errorId).toBeUndefined();
    expect(bajo.consecuencia).toBe('rompe');
    const alto = judge(directo, inst, valorDirecto(inst, inst.correcto.si * 1.3));
    expect(alto.resultado).toBe('no_clasificado');
    expect(alto.consecuencia).toBe('sobra');
    expect(alto.desviacion).toBeCloseTo(0.3, 9);
  });

  it('inválido: falta variable, unidades incompatibles, fórmula de otra magnitud, fórmula desconocida', () => {
    const inst = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 0 });
    const r1 = judge(torsion, inst, { formulaId: 'tau_max_macizo', bindings: { T: { valor: 1.5, unidad: 'kN·m' } }, confianza: conf });
    expect(r1.resultado).toBe('invalido');
    expect(r1.motivoInvalido).toMatch(/Falta/);
    const r2 = judge(torsion, inst, { formulaId: 'tau_max_macizo', bindings: { T: { valor: 40, unidad: 'mm' }, c: { valor: 1.5, unidad: 'kN·m' } }, confianza: conf });
    expect(r2.resultado).toBe('invalido');
    expect(r2.motivoInvalido).toMatch(/unidades/);
    const r3 = judge(torsion, inst, { formulaId: 'torque_potencia', bindings: { P: { valor: 1, unidad: 'kW' }, f: { valor: 1, unidad: 'rpm' } }, confianza: conf });
    expect(r3.resultado).toBe('invalido');
    expect(judge(torsion, inst, { formulaId: 'nada', bindings: {}, confianza: conf }).resultado).toBe('invalido');
    expect(evaluarFormula(torsion, 'tau_max_macizo', { T: { valor: 1, unidad: 'parsec' }, c: { valor: 1, unidad: 'm' } }).ok).toBe(false);
    expect(evaluarFormula(torsion, 'tau_max_macizo', { T: { valor: NaN, unidad: 'N·m' }, c: { valor: 1, unidad: 'm' } }).ok).toBe(false);
  });

  it('criterio de falla y predicción', () => {
    const vs = allVariants(torsion, 'eje_macizo_aprueba');
    const rompe = vs.find((i) => i.fisica!.estado === 'rompe')!;
    const ok = vs.find((i) => i.fisica!.estado === 'ok')!;
    const v1 = judge(torsion, rompe, { ...correcta(rompe), prediccion: 'no_aprueba' });
    expect(v1.prediccion).toEqual({ dada: 'no_aprueba', acierta: true });
    expect(v1.fisica!.apruebaSegunJugador).toBe(false);
    expect(judge(torsion, ok, { ...correcta(ok), prediccion: 'no_aprueba' }).prediccion!.acierta).toBe(false);
    expect(judge(torsion, ok, { ...correcta(ok), prediccion: 'aprueba' }).prediccion!.acierta).toBe(true);
    const errDiam = rompe.errores.find((e) => e.id === 'diametro_por_radio')!;
    const vd = judge(directo, rompe, valorDirecto(rompe, errDiam.si));
    expect(vd.fisica!.apruebaSegunJugador).toBe(true);
    expect(vd.fisica!.aprueba).toBe(false);

    const g = generate(torsion, 'predecir_giro_macizo', 0, { variante: 1 });
    expect(judge(torsion, g, { ...correcta(g), prediccion: g.correcto.mostrado * 1.2 }).prediccion!.acierta).toBe(true);
    expect(judge(torsion, g, { ...correcta(g), prediccion: g.correcto.mostrado * 2 }).prediccion!.acierta).toBe(false);
  });

  it('observaciones por KC según el error', () => {
    const inst = generate(directo, 'eje_macizo_aprueba', 0, { variante: 0 });
    const er = inst.errores.find((e) => e.id === 'mm_sin_convertir')!;
    const v = judge(directo, inst, valorDirecto(inst, er.si));
    const obs = observaciones(v, inst);
    expect(obs.find((o) => o.kc === 'conversion_unidades')!.correcto).toBe(false);
    expect(obs.find((o) => o.kc === 'j_macizo')!.correcto).toBe(true);
    const nc = judge(directo, inst, valorDirecto(inst, inst.correcto.si * 0.7));
    expect(observaciones(nc, inst).every((o) => !o.correcto)).toBe(true);
    const ok = judge(directo, inst, valorDirecto(inst, inst.correcto.si));
    expect(observaciones(ok, inst).every((o) => o.correcto)).toBe(true);
  });
});
