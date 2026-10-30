import { describe, expect, it } from 'vitest';
import { DAY_MS, fakeClock } from '../../src/engine/clock';
import { MovingAverageModel, evaluarPredicciones, type Observacion } from '../../src/engine/learner/baseline';
import { BKT_DEFAULT, BktModel, bktPosterior } from '../../src/engine/learner/bkt';
import { AYUDA_DEFAULT, decidirAyuda, pAcierto, presentacion, siguienteEjercicio, ZONA_OBJETIVO } from '../../src/engine/learner/policy';
import { INTERVALOS_DIAS, Schedule } from '../../src/engine/learner/schedule';
import { mulberry32 } from '../../src/engine/rng';
import { findExercise } from '../../src/engine/pack';
import { torsion } from './helpers';

describe('BKT', () => {
  it('parámetros compartidos del contrato', () => {
    expect(BKT_DEFAULT).toEqual({ p0: 0.2, T: 0.15, S: 0.1, G: 0.2 });
    expect(new BktModel().pMastery('x')).toBe(0.2);
  });

  it('actualización correcta a mano', () => {
    const m = new BktModel();
    m.update(['k'], true);
    const post = (0.2 * 0.9) / (0.2 * 0.9 + 0.8 * 0.2);
    expect(m.pMastery('k')).toBeCloseTo(post + (1 - post) * 0.15, 12);
    expect(bktPosterior(0.5, false, 0.1, 0.2)).toBeCloseTo(0.05 / (0.05 + 0.4), 12);
  });

  it('sube con aciertos, baja con errores, nunca llega a 0 ni 1', () => {
    const m = new BktModel();
    let prev = m.pMastery('k');
    for (let i = 0; i < 10; i++) { m.update(['k'], true); const p = m.pMastery('k'); expect(p).toBeGreaterThan(prev); prev = p; }
    expect(prev).toBeLessThan(1);
    expect(prev).toBeGreaterThan(0.95);
    m.update(['k'], false);
    expect(m.pMastery('k')).toBeLessThan(prev);
    for (let i = 0; i < 20; i++) m.update(['k'], false);
    expect(m.pMastery('k')).toBeGreaterThan(0);
    expect(m.pMastery('k')).toBeGreaterThanOrEqual(BKT_DEFAULT.T - 1e-12);
  });

  it('acierto con pista aporta menos evidencia que sin pista', () => {
    const a = new BktModel(), b = new BktModel();
    a.update(['k'], true, { pistas: 0 });
    b.update(['k'], true, { pistas: 2 });
    expect(b.pMastery('k')).toBeLessThan(a.pMastery('k'));
    expect(b.pMastery('k')).toBeGreaterThan(0.2);
  });

  it('KCs independientes, conteo, snapshot/restore', () => {
    const m = new BktModel();
    m.update(['a', 'b'], true);
    m.update(['a'], false);
    expect(m.count('a')).toBe(2);
    expect(m.count('b')).toBe(1);
    expect(m.pMastery('c')).toBe(0.2);
    const s = JSON.parse(JSON.stringify(m.snapshot()));
    const r = new BktModel();
    r.restore(s);
    expect(r.pMastery('a')).toBe(m.pMastery('a'));
    expect(r.count('b')).toBe(1);
    expect(() => r.restore({ tipo: 'otro', version: 1, data: {} })).toThrow();
  });

  it('pCorrect = p(1−S) + (1−p)G', () => {
    const m = new BktModel();
    expect(m.pCorrect('k')).toBeCloseTo(0.2 * 0.9 + 0.8 * 0.2, 12);
  });

  it('compara contra la línea base (promedio móvil) en estudiantes simulados con BKT', () => {
    const rng = mulberry32(2024);
    let bkt = 0, base = 0, n = 0;
    for (let s = 0; s < 300; s++) {
      let sabe = rng() < BKT_DEFAULT.p0;
      const seq: Observacion[] = [];
      for (let t = 0; t < 25; t++) {
        const correct = sabe ? rng() > BKT_DEFAULT.S : rng() < BKT_DEFAULT.G;
        seq.push({ kc: 'k', correct });
        if (!sabe && rng() < BKT_DEFAULT.T) sabe = true;
      }
      const rb = evaluarPredicciones(new BktModel(), seq);
      const rm = evaluarPredicciones(new MovingAverageModel(), seq);
      bkt += rb.logLoss * rb.n; base += rm.logLoss * rm.n; n += rb.n;
    }
    const llBkt = bkt / n, llBase = base / n;
    expect(llBkt).toBeLessThan(llBase);
    expect(llBkt).toBeLessThan(0.6);
  });

  it('línea base: promedio móvil coherente', () => {
    const m = new MovingAverageModel(0.5, 0.5);
    m.update(['k'], true);
    expect(m.pCorrect('k')).toBe(0.75);
    m.update(['k'], false);
    expect(m.pCorrect('k')).toBe(0.375);
    const r = new MovingAverageModel();
    r.restore(m.snapshot());
    expect(r.count('k')).toBe(2);
  });
});

describe('repaso espaciado 1/3/7/21 con reloj simulado', () => {
  it('un error reaparece a 1, 3, 7 y 21 días y luego se retira', () => {
    const clock = fakeClock(1_000_000);
    const s = new Schedule(clock);
    s.registrarError('diametro_por_radio', { exerciseId: 'eje_macizo_aprueba', variante: 2, kcs: ['identificar_datos'] });
    expect(INTERVALOS_DIAS).toEqual([1, 3, 7, 21]);
    for (const dias of INTERVALOS_DIAS) {
      clock.advance(dias * DAY_MS - 1);
      expect(s.vencidos().map((i) => i.key)).toEqual([]);
      clock.advance(1);
      expect(s.vencidos().map((i) => i.key)).toEqual(['error:diametro_por_radio']);
      s.registrarRepaso('error:diametro_por_radio', true);
    }
    expect(s.get('error:diametro_por_radio')!.retirado).toBe(true);
    clock.advance(365 * DAY_MS);
    expect(s.vencidos()).toEqual([]);
  });

  it('fallar un repaso reinicia a 1 día; repetir el error suma veces', () => {
    const clock = fakeClock(0);
    const s = new Schedule(clock);
    s.registrarError('e1');
    clock.advance(DAY_MS);
    s.registrarRepaso('error:e1', true);
    expect(s.get('error:e1')!.etapa).toBe(1);
    clock.advance(3 * DAY_MS);
    s.registrarRepaso('error:e1', false);
    expect(s.get('error:e1')!.etapa).toBe(0);
    expect(s.get('error:e1')!.vence).toBe(clock.now() + DAY_MS);
    s.registrarError('e1');
    expect(s.get('error:e1')!.veces).toBe(2);
    expect(s.registrarRepaso('no:existe', true)).toBeUndefined();
  });

  it('práctica de KC: agenda, avanza solo si está vencido, el fallo reinicia; errores primero', () => {
    const clock = fakeClock(0);
    const s = new Schedule(clock);
    s.registrarPractica('j_macizo', true);
    s.registrarPractica('j_macizo', true);
    expect(s.get('kc:j_macizo')!.etapa).toBe(0);
    clock.advance(DAY_MS);
    s.registrarPractica('j_macizo', true);
    expect(s.get('kc:j_macizo')!.etapa).toBe(1);
    s.registrarPractica('j_macizo', false);
    expect(s.get('kc:j_macizo')!.etapa).toBe(0);
    s.registrarError('x');
    clock.advance(DAY_MS);
    expect(s.vencidos().map((i) => i.tipo)).toEqual(['error', 'kc']);
    const r = new Schedule(clock);
    r.restore(JSON.parse(JSON.stringify(s.snapshot())));
    expect(r.vencidos().map((i) => i.key)).toEqual(s.vencidos().map((i) => i.key));
  });
});

describe('política de siguiente ejercicio', () => {
  it('sin historial elige el KC más débil y un ejercicio cerca de la zona 70–80 %', () => {
    const clock = fakeClock(0);
    const m = new BktModel();
    for (const k of torsion.kcs.map((x) => x.id)) if (k !== 'potencia_torque') for (let i = 0; i < 6; i++) m.update([k], true);
    const e = siguienteEjercicio({ pack: torsion, model: m, schedule: new Schedule(clock), now: clock.now() });
    expect(e.tipo).toBe('nuevo');
    expect(e.kcObjetivo).toBe('potencia_torque');
    expect(e.exerciseId).toBe('potencia_rpm_torque');
  });

  it('elige la dificultad más cercana a la zona objetivo', () => {
    const m = new BktModel();
    for (const k of torsion.kcs.map((x) => x.id)) for (let i = 0; i < 3; i++) m.update([k], true);
    m.update(['j_macizo'], false);
    const clock = fakeClock(0);
    const e = siguienteEjercicio({ pack: torsion, model: m, schedule: new Schedule(clock), now: 0 });
    const objetivo = (ZONA_OBJETIVO.min + ZONA_OBJETIVO.max) / 2;
    const cands = torsion.ejercicios.filter((x) => x.kcs.includes(e.kcObjetivo!));
    const mejor = Math.min(...cands.map((x) => Math.abs(pAcierto(x, m) - objetivo)));
    expect(Math.abs(e.pAcierto - objetivo)).toBeCloseTo(mejor, 12);
  });

  it('la dificultad baja la probabilidad predicha', () => {
    const m = new BktModel();
    const facil = findExercise(torsion, 'eje_macizo_aprueba'), dificil = findExercise(torsion, 'dimensionar_macizo');
    for (const k of torsion.kcs.map((x) => x.id)) m.update([k], true);
    expect(pAcierto(dificil, m)).toBeLessThan(pAcierto(facil, m));
  });

  it('repaso vencido de un error: otro ejercicio con ese error, o la misma con otra variante; alterna con material nuevo', () => {
    const clock = fakeClock(0);
    const m = new BktModel();
    const s = new Schedule(clock);
    s.registrarError('g_gpa_sin_convertir', { exerciseId: 'predecir_giro_macizo', variante: 1 });
    clock.advance(DAY_MS);
    const r = siguienteEjercicio({ pack: torsion, model: m, schedule: s, now: clock.now(), ultimoTipo: 'nuevo' });
    expect(r).toMatchObject({ tipo: 'repaso', motivo: 'repaso_error', errorId: 'g_gpa_sin_convertir', exerciseId: 'predecir_giro_macizo', evitarVariante: 1 });
    const n = siguienteEjercicio({ pack: torsion, model: m, schedule: s, now: clock.now(), ultimoTipo: 'repaso' });
    expect(n.tipo).toBe('nuevo');

    s.registrarError('diametro_por_radio', { exerciseId: 'eje_macizo_aprueba', variante: 0 });
    clock.advance(DAY_MS);
    const r2 = siguienteEjercicio({ pack: torsion, model: m, schedule: s, now: clock.now(), ultimoTipo: null });
    expect(r2.tipo).toBe('repaso');
    if (r2.errorId === 'diametro_por_radio') expect(r2.exerciseId).not.toBe('eje_macizo_aprueba');
  });

  it('respeta los módulos desbloqueados', () => {
    const clock = fakeClock(0);
    const e = siguienteEjercicio({ pack: torsion, model: new BktModel(), schedule: new Schedule(clock), now: 0, modulos: ['predecir_giro'] });
    expect(e.exerciseId).toBe('predecir_giro_macizo');
    expect(() => siguienteEjercicio({ pack: torsion, model: new BktModel(), schedule: new Schedule(clock), now: 0, modulos: ['nada'] })).toThrow();
  });
});

describe('política de ayuda', () => {
  it('deja intentar primero (fracaso productivo)', () => {
    expect(decidirAyuda({ intentos: 0, erroresSeguidos: 0, segundos: 10, pistasUsadas: 0 })).toEqual({ accion: 'esperar', motivo: 'primer_intento' });
    expect(decidirAyuda({ intentos: 1, erroresSeguidos: 1, segundos: 30, pistasUsadas: 0 })).toEqual({ accion: 'esperar', motivo: 'fracaso_productivo' });
  });
  it('ofrece la siguiente pista tras N intentos o tiempo', () => {
    expect(decidirAyuda({ intentos: 2, erroresSeguidos: 2, segundos: 40, pistasUsadas: 0 })).toMatchObject({ accion: 'ofrecer_pista', escalon: 0, motivo: 'intentos' });
    expect(decidirAyuda({ intentos: 0, erroresSeguidos: 0, segundos: AYUDA_DEFAULT.ofrecerTrasSegundos, pistasUsadas: 0 })).toMatchObject({ accion: 'ofrecer_pista', escalon: 0, motivo: 'tiempo' });
    expect(decidirAyuda({ intentos: 2, erroresSeguidos: 2, segundos: 40, pistasUsadas: 1 })).toMatchObject({ accion: 'esperar' });
    expect(decidirAyuda({ intentos: 3, erroresSeguidos: 3, segundos: 40, pistasUsadas: 1 })).toMatchObject({ accion: 'ofrecer_pista', escalon: 1 });
  });
  it('corta tras errores seguidos, tiempo excesivo o pistas agotadas', () => {
    expect(decidirAyuda({ intentos: 4, erroresSeguidos: 4, segundos: 60, pistasUsadas: 0 })).toMatchObject({ accion: 'cortar', motivo: 'errores_seguidos' });
    expect(decidirAyuda({ intentos: 1, erroresSeguidos: 1, segundos: 601, pistasUsadas: 0 })).toMatchObject({ accion: 'cortar', motivo: 'tiempo' });
    expect(decidirAyuda({ intentos: 3, erroresSeguidos: 1, segundos: 60, pistasUsadas: 3 })).toMatchObject({ accion: 'cortar', motivo: 'sin_pistas' });
  });
  it('ejemplo resuelto primero, luego se retiran los pasos', () => {
    expect([0, 1, 2, 3, 10].map(presentacion)).toEqual(['ejemplo_resuelto', 'pasos_parciales', 'pasos_parciales', 'sin_pasos', 'sin_pasos']);
  });
});
