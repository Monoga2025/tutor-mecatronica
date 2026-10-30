import type { LearnerModel, LearnerSnapshot, UpdateMeta } from './LearnerModel';

export interface BktParams { p0: number; T: number; S: number; G: number }

/** Parámetros compartidos por todos los KC (pocos datos de un solo jugador: nada de ajuste individual). */
export const BKT_DEFAULT: BktParams = { p0: 0.2, T: 0.15, S: 0.1, G: 0.2 };
/** Adivinanza efectiva cuando el acierto llegó con pistas. */
const G_CON_PISTA = 0.5;

interface KcState { p: number; n: number }

export function bktPosterior(p: number, correct: boolean, S: number, G: number): number {
  return correct ? (p * (1 - S)) / (p * (1 - S) + (1 - p) * G) : (p * S) / (p * S + (1 - p) * (1 - G));
}

export class BktModel implements LearnerModel {
  readonly tipo = 'bkt';
  private kcs = new Map<string, KcState>();
  constructor(readonly params: BktParams = BKT_DEFAULT) {}

  private st(kc: string): KcState {
    let s = this.kcs.get(kc);
    if (!s) { s = { p: this.params.p0, n: 0 }; this.kcs.set(kc, s); }
    return s;
  }

  update(kcIds: readonly string[], correct: boolean, meta: UpdateMeta = {}): void {
    const { S, T } = this.params;
    const G = correct && (meta.pistas ?? 0) > 0 ? Math.max(this.params.G, G_CON_PISTA) : this.params.G;
    for (const kc of kcIds) {
      const s = this.st(kc);
      const post = bktPosterior(s.p, correct, S, G);
      s.p = post + (1 - post) * T;
      s.n++;
    }
  }

  pMastery(kcId: string): number { return this.kcs.get(kcId)?.p ?? this.params.p0; }

  pCorrect(kcId: string): number {
    const p = this.pMastery(kcId);
    return p * (1 - this.params.S) + (1 - p) * this.params.G;
  }

  count(kcId: string): number { return this.kcs.get(kcId)?.n ?? 0; }

  snapshot(): LearnerSnapshot {
    return { tipo: this.tipo, version: 1, data: { params: this.params, kcs: Object.fromEntries(this.kcs) } };
  }

  restore(s: LearnerSnapshot): void {
    if (s.tipo !== this.tipo) throw new Error(`Snapshot de otro modelo: ${s.tipo}`);
    const d = s.data as { kcs: Record<string, KcState> };
    this.kcs = new Map(Object.entries(d.kcs).map(([k, v]) => [k, { p: v.p, n: v.n }]));
  }
}
