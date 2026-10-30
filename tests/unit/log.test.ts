import { describe, expect, it } from 'vitest';
import { DAY_MS, fakeClock } from '../../src/engine/clock';
import { generate } from '../../src/engine/generator';
import { judge } from '../../src/engine/judge';
import { BktModel } from '../../src/engine/learner/bkt';
import { Schedule } from '../../src/engine/learner/schedule';
import { intentoDesde, MemoryEventLog } from '../../src/engine/log';
import { Tutor } from '../../src/engine/tutor';
import { torsion } from './helpers';

describe('registro de eventos en memoria', () => {
  it('guarda intentos con reloj inyectable, filtra y exporta JSON', async () => {
    const clock = fakeClock(Date.UTC(2026, 9, 7));
    const log = new MemoryEventLog(clock);
    const inst = generate(torsion, 'eje_macizo_aprueba', 0, { variante: 0 });
    const sub = { formulaId: 'tau_max_macizo', bindings: { T: { valor: 1.5, unidad: 'kN·m' }, c: { valor: 40, unidad: 'mm' } }, confianza: 'alta' as const };
    const v = judge(torsion, inst, sub);
    const e1 = await log.append(intentoDesde(inst, sub, v, { pistas: 1, tiempoMs: 4200 }));
    expect(e1).toMatchObject({ id: 1, ts: clock.now(), tipo: 'intento', errorId: 'diametro_por_radio', resultado: 'error', pistas: 1, confianza: 'alta', kcs: inst.kcs });
    clock.advance(1000);
    await log.append({ tipo: 'pista', exerciseId: 'predecir_giro_macizo', escalon: 0 });
    sub.bindings.T.valor = 99;
    expect((await log.all())[0]!.tipo === 'intento' && (await log.all())[0]).toMatchObject({ bindings: { T: { valor: 1.5 } } });
    expect(await log.query({ tipo: 'pista' })).toHaveLength(1);
    expect(await log.query({ exerciseId: 'eje_macizo_aprueba' })).toHaveLength(1);
    expect(await log.query({ desde: clock.now() })).toHaveLength(1);
    const json = JSON.parse(await log.exportJSON());
    expect(json.formato).toBe('raton-ingeniero/eventos');
    expect(json.eventos).toHaveLength(2);
    expect(json.exportado).toBe(new Date(clock.now()).toISOString());
    await log.clear();
    expect(await log.all()).toEqual([]);
  });
});

describe('Tutor (fachada para la UI)', () => {
  it('un error actualiza modelo, agenda el repaso y se registra; vuelve al día siguiente con otros valores', async () => {
    const clock = fakeClock(0);
    const t = new Tutor(torsion, new BktModel(), new Schedule(clock), new MemoryEventLog(clock), clock);
    const inst = t.generar('eje_macizo_aprueba', 7);
    const T = inst.datos.T!, d = inst.datos.d!;
    const v = await t.responder(inst, { formulaId: 'tau_max_macizo', bindings: { T: { valor: T.valor, unidad: T.unidad }, c: { valor: d.valor, unidad: d.unidad } }, confianza: 'media' }, { pistas: 0, tiempoMs: 1000 });
    expect(v.errorId).toBe('diametro_por_radio');
    expect(t.model.pMastery('identificar_datos')).toBeLessThan(0.2);
    expect(t.model.pMastery('j_macizo')).toBeGreaterThan(0.2);
    expect(t.schedule.get('error:diametro_por_radio')).toBeDefined();
    expect(await t.log.all()).toHaveLength(1);

    t.siguiente();
    clock.advance(DAY_MS);
    const e = t.siguiente();
    expect(e.tipo).toBe('repaso');
    expect(e.errorId).toBe('diametro_por_radio');
    const opts = e.evitarVariante !== undefined ? { evitarVariante: e.evitarVariante } : {};
    const r = t.generar(e.exerciseId, 99, opts);
    if (r.exerciseId === inst.exerciseId) expect(r.variante).not.toBe(inst.variante);

    const f = torsion.formulas.find((x) => x.id === r.formulaCorrecta)!;
    const bindings = Object.fromEntries(f.variables.map((k) => [k, { valor: r.asignacionSI[k]!, unidad: f.unidades![k]! }]));
    const ok = await t.responder(r, { formulaId: f.id, bindings, confianza: 'alta' }, { pistas: 0, tiempoMs: 900 });
    expect(ok.correcto).toBe(true);
    expect(t.schedule.get('error:diametro_por_radio')!.etapa).toBe(1);
  });

  it('un envío inválido no toca el modelo pero sí se registra', async () => {
    const clock = fakeClock(0);
    const t = new Tutor(torsion, new BktModel(), new Schedule(clock), new MemoryEventLog(clock), clock);
    const inst = t.generar('eje_macizo_aprueba', 1);
    const v = await t.responder(inst, { formulaId: 'tau_max_macizo', bindings: {}, confianza: 'baja' }, { pistas: 0, tiempoMs: 10 });
    expect(v.resultado).toBe('invalido');
    expect(t.model.count('j_macizo')).toBe(0);
    expect(await t.log.all()).toHaveLength(1);
  });
});
