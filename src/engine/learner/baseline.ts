import type { LearnerModel, LearnerSnapshot } from './LearnerModel';

/** Línea base: promedio móvil exponencial de aciertos por KC. */
export class MovingAverageModel implements LearnerModel {
  readonly tipo = 'promedio_movil';
  private kcs = new Map<string, { m: number; n: number }>();
  constructor(readonly alpha = 0.3, readonly inicial = 0.5) {}

  update(kcIds: readonly string[], correct: boolean): void {
    for (const kc of kcIds) {
      const s = this.kcs.get(kc) ?? { m: this.inicial, n: 0 };
      s.m = (1 - this.alpha) * s.m + this.alpha * (correct ? 1 : 0);
      s.n++;
      this.kcs.set(kc, s);
    }
  }

  pCorrect(kcId: string): number { return clamp(this.kcs.get(kcId)?.m ?? this.inicial); }
  pMastery(kcId: string): number { return this.pCorrect(kcId); }
  count(kcId: string): number { return this.kcs.get(kcId)?.n ?? 0; }

  snapshot(): LearnerSnapshot { return { tipo: this.tipo, version: 1, data: Object.fromEntries(this.kcs) }; }
  restore(s: LearnerSnapshot): void {
    if (s.tipo !== this.tipo) throw new Error(`Snapshot de otro modelo: ${s.tipo}`);
    this.kcs = new Map(Object.entries(s.data as Record<string, { m: number; n: number }>));
  }
}

const clamp = (p: number): number => Math.min(0.99, Math.max(0.01, p));

export interface Observacion { kc: string; correct: boolean; pistas?: number }

/** Pérdida logarítmica media y exactitud de las predicciones del modelo, prediciendo antes de cada observación. */
export function evaluarPredicciones(model: LearnerModel, seq: readonly Observacion[]): { logLoss: number; accuracy: number; n: number } {
  let ll = 0, ok = 0;
  for (const o of seq) {
    const p = clamp(model.pCorrect(o.kc));
    ll += -(o.correct ? Math.log(p) : Math.log(1 - p));
    if ((p >= 0.5) === o.correct) ok++;
    model.update([o.kc], o.correct, { pistas: o.pistas ?? 0 });
  }
  const n = seq.length || 1;
  return { logLoss: ll / n, accuracy: ok / n, n: seq.length };
}
