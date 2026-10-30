import type { Clock } from './clock';
import { generate, type GenerateOptions, type Instance } from './generator';
import { judge, observaciones, type Submission, type Verdict } from './judge';
import type { LearnerModel } from './learner/LearnerModel';
import { siguienteEjercicio, type Eleccion, type TipoEleccion } from './learner/policy';
import { keyOf, type Schedule } from './learner/schedule';
import { intentoDesde, type EventLog, type EventoIntento } from './log';
import type { Pack } from './pack';

export interface RegistroExtra { pistas: number; tiempoMs: number; modo?: EventoIntento['modo']; eleccion?: Eleccion }

/** Fachada para la UI: genera, juzga y registra el intento en el modelo, el repaso y el log. */
export class Tutor {
  private ultimoTipo: TipoEleccion | null = null;
  constructor(readonly pack: Pack, readonly model: LearnerModel, readonly schedule: Schedule, readonly log: EventLog, readonly clock: Clock) {}

  siguiente(modulos?: readonly string[]): Eleccion {
    const ctx = { pack: this.pack, model: this.model, schedule: this.schedule, now: this.clock.now(), ultimoTipo: this.ultimoTipo };
    const e = siguienteEjercicio(modulos ? { ...ctx, modulos } : ctx);
    this.ultimoTipo = e.tipo;
    return e;
  }

  generar(exerciseId: string, seed: number, opts?: GenerateOptions): Instance {
    return generate(this.pack, exerciseId, seed, opts);
  }

  async responder(inst: Instance, sub: Submission, extra: RegistroExtra): Promise<Verdict> {
    const v = judge(this.pack, inst, sub);
    if (v.resultado !== 'invalido') {
      for (const o of observaciones(v, inst)) this.model.update([o.kc], o.correcto, { pistas: extra.pistas, exerciseId: inst.exerciseId });
      for (const kc of inst.kcs) this.schedule.registrarPractica(kc, v.correcto);
      if (v.resultado === 'error' && v.errorId) {
        this.schedule.registrarError(v.errorId, { exerciseId: inst.exerciseId, variante: inst.variante, kcs: v.error?.kcs ?? inst.kcs });
      } else if (v.correcto) {
        const now = this.clock.now();
        for (const er of inst.errores) {
          const it = this.schedule.get(keyOf('error', er.id));
          if (it && !it.retirado && it.vence <= now) this.schedule.registrarRepaso(it.key, true);
        }
      }
    }
    await this.log.append(intentoDesde(inst, sub, v, extra));
    return v;
  }
}
