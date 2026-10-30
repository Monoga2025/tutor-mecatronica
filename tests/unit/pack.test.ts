import { describe, expect, it } from 'vitest';
import { allVariants, generate } from '../../src/engine/generator';
import { loadPack, PackError } from '../../src/engine/pack';
import { formatNumber } from '../../src/engine/units';
import { torsion } from './helpers';

const noSolapan = (a: number, b: number): boolean => Math.abs(a - b) > 0.03 * (Math.abs(a) + Math.abs(b));

describe('paquete de torsión', () => {
  it('carga y cubre los KCs pedidos', () => {
    const kcs = torsion.kcs.map((k) => k.id);
    for (const k of ['identificar_datos', 'formula_esfuerzo', 'j_macizo', 'j_hueco', 'angulo_torsion', 'conversion_unidades', 'potencia_torque', 'criterio_falla', 'dimensionamiento']) {
      expect(kcs).toContain(k);
      expect(torsion.ejercicios.some((e) => e.kcs.includes(k)), `KC sin ejercicio: ${k}`).toBe(true);
    }
  });

  it('módulos requeridos y número de variantes', () => {
    const mods = (m: string) => torsion.ejercicios.filter((e) => e.modulo === m);
    for (const m of ['eje_macizo', 'predecir_giro']) {
      expect(mods(m).length).toBeGreaterThan(0);
      for (const e of mods(m)) { const n = allVariants(torsion, e.id).length; expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(5); }
    }
    expect(mods('eje_hueco').length).toBeGreaterThan(0);
    expect(mods('potencia_rpm').length).toBeGreaterThan(0);
  });

  it('errores típicos requeridos presentes', () => {
    const ids = new Set(torsion.ejercicios.flatMap((e) => e.errores.map((er) => er.id)));
    for (const id of ['diametro_por_radio', 'j_polar_cuarto', 'j_sin_pi', 'sin_factor_2', 'mm_sin_convertir', 'rpm_sin_convertir', 'g_gpa_sin_convertir']) expect(ids).toContain(id);
  });

  for (const e of torsion.ejercicios) {
    describe(e.id, () => {
      const vs = allVariants(torsion, e.id);
      it('respuestas correcta y de cada error difieren > 3 % entre sí (ventanas de tolerancia disjuntas) en todas las variantes', () => {
        for (const inst of vs) {
          const vals = [{ id: 'correcta', v: inst.correcto.si }, ...inst.errores.map((x) => ({ id: x.id, v: x.si }))];
          for (const x of vals) expect(Number.isFinite(x.v) && x.v > 0, `${e.id}#${inst.variante} ${x.id}`).toBe(true);
          for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
            expect(noSolapan(vals[i]!.v, vals[j]!.v), `${e.id}#${inst.variante}: ${vals[i]!.id} vs ${vals[j]!.id}`).toBe(true);
          }
        }
      });
      it('la consecuencia declarada de cada error coincide con el sentido del error', () => {
        for (const inst of vs) for (const er of inst.errores) {
          const esperada = er.si < inst.correcto.si ? e.consecuencias!.subestima : e.consecuencias!.sobreestima;
          expect(er.consecuencia, `${e.id}/${er.id}`).toBe(esperada);
        }
      });
      it('cada error tiene pista de diagnóstico y consecuencia física; 3 pistas sin el resultado', () => {
        for (const er of e.errores) { expect(er.pista_diagnostico.length).toBeGreaterThan(10); expect(er.consecuencia_texto?.length ?? 0).toBeGreaterThan(10); }
        expect(e.pistas).toHaveLength(3);
        for (const inst of vs) for (const p of e.pistas) {
          for (const sig of [2, 3, 4]) expect(p, `pista con resultado en ${e.id}`).not.toContain(formatNumber(inst.correcto.mostrado, sig));
          expect(p).not.toMatch(/\{[^}]+\}/);
        }
      });
      it('enunciado sin placeholders sin resolver y pasos con valores', () => {
        for (const inst of vs) {
          expect(inst.enunciado).not.toMatch(/\{[^}]+\}/);
          for (const p of inst.pasos) if (p.valor !== undefined) expect(Number.isFinite(p.valor)).toBe(true);
        }
      });
      it('el último paso con valor reproduce la respuesta correcta', () => {
        for (const inst of vs) {
          const last = [...inst.pasos].reverse().find((p) => p.unidad === inst.incognita.unidad);
          if (last) expect(last.valor!).toBeCloseTo(inst.correcto.mostrado, 9);
        }
      });
    });
  }

  it('eje macizo: las variantes cubren rompe, aprueba y sobra', () => {
    const estados = new Set(allVariants(torsion, 'eje_macizo_aprueba').map((i) => i.fisica!.estado));
    expect([...estados].sort()).toEqual(['ok', 'rompe', 'sobra']);
    for (const i of allVariants(torsion, 'eje_macizo_aprueba')) {
      const u = i.fisica!.utilizacion;
      expect(Math.abs(u - 1) > 0.08 && Math.abs(u - 0.8) > 0.02, `utilización ambigua ${u}`).toBe(true);
    }
  });

  it('generador determinista por semilla y evitarVariante', () => {
    const a = generate(torsion, 'eje_macizo_aprueba', 123), b = generate(torsion, 'eje_macizo_aprueba', 123);
    expect(a).toEqual(b);
    const c = generate(torsion, 'eje_macizo_aprueba', 123, { evitarVariante: a.variante });
    expect(c.variante).not.toBe(a.variante);
    const seen = new Set<number>();
    for (let s = 0; s < 200; s++) seen.add(generate(torsion, 'predecir_giro_macizo', s).variante);
    expect(seen.size).toBe(4);
  });

  it('valores concretos: eje macizo variante 0', () => {
    const i = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 0 });
    expect(i.enunciado).toContain('40 mm');
    expect(i.enunciado).toContain('1.5 kN·m');
    expect(i.correcto.mostrado).toBeCloseTo(16 * 1500 / (Math.PI * 0.04 ** 3) / 1e6, 9);
    expect(i.errores.find((e) => e.id === 'diametro_por_radio')!.si / i.correcto.si).toBeCloseTo(1 / 8, 12);
    expect(i.errores.find((e) => e.id === 'mm_sin_convertir')!.si / i.correcto.si).toBeCloseTo(1e-9, 18);
  });

  it('rechaza paquetes inválidos con mensajes claros', () => {
    const bad = structuredClone(torsion) as unknown as { ejercicios: { kcs: string[]; errores: { expr_equivocada: string }[]; formula_correcta: string }[] };
    bad.ejercicios[0]!.kcs.push('kc_inexistente');
    bad.ejercicios[0]!.errores[0]!.expr_equivocada = 'T*(';
    bad.ejercicios[1]!.formula_correcta = 'no_existe';
    try { loadPack(bad); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(PackError);
      const msg = (e as PackError).issues.join('\n');
      expect(msg).toMatch(/kc_inexistente/);
      expect(msg).toMatch(/expresión inválida/);
      expect(msg).toMatch(/no_existe/);
    }
    expect(() => loadPack({ id: 'x' })).toThrow(PackError);
    expect(() => loadPack('{"id":')).toThrow();
  });
});
