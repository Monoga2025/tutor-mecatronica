export interface UpdateMeta {
  /** Pistas usadas en el intento. Un acierto con pista aporta menos evidencia. */
  pistas?: number;
  ts?: number;
  exerciseId?: string;
}

export interface LearnerSnapshot { tipo: string; version: 1; data: unknown }

/** Interfaz intercambiable del modelo del jugador (BKT hoy; otro modelo más adelante). */
export interface LearnerModel {
  readonly tipo: string;
  update(kcIds: readonly string[], correct: boolean, meta?: UpdateMeta): void;
  /** Probabilidad estimada de dominio del KC (nunca 0 ni 1 exactos). */
  pMastery(kcId: string): number;
  /** Probabilidad predicha de acertar el siguiente intento que use el KC. */
  pCorrect(kcId: string): number;
  /** Número de observaciones del KC. */
  count(kcId: string): number;
  snapshot(): LearnerSnapshot;
  restore(s: LearnerSnapshot): void;
}
