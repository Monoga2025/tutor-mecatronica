import { DAY_MS, type Clock } from '../clock';

/** Intervalos de repaso espaciado en días. */
export const INTERVALOS_DIAS = [1, 3, 7, 21] as const;

export type TipoRepaso = 'error' | 'kc';

export interface ItemRepaso {
  key: string;
  tipo: TipoRepaso;
  ref: string;
  /** Ejercicio donde apareció el error (para generarlo después con otros valores). */
  exerciseId?: string;
  variante?: number;
  kcs: string[];
  etapa: number;
  vence: number;
  veces: number;
  ultimo: number;
  retirado: boolean;
}

export const keyOf = (tipo: TipoRepaso, ref: string): string => `${tipo}:${ref}`;

export class Schedule {
  private items = new Map<string, ItemRepaso>();
  constructor(private clock: Clock) {}

  private dueAt(etapa: number, now: number): number {
    return now + INTERVALOS_DIAS[Math.min(etapa, INTERVALOS_DIAS.length - 1)]! * DAY_MS;
  }

  /** Un error cometido vuelve a etapa 0: reaparece en 1 día. */
  registrarError(errorId: string, ctx: { exerciseId?: string; variante?: number; kcs?: string[] } = {}): ItemRepaso {
    const now = this.clock.now();
    const key = keyOf('error', errorId);
    const prev = this.items.get(key);
    const it: ItemRepaso = {
      key, tipo: 'error', ref: errorId, kcs: ctx.kcs ?? prev?.kcs ?? [], etapa: 0,
      vence: this.dueAt(0, now), veces: (prev?.veces ?? 0) + 1, ultimo: now, retirado: false,
    };
    const ex = ctx.exerciseId ?? prev?.exerciseId;
    if (ex !== undefined) it.exerciseId = ex;
    const va = ctx.variante ?? prev?.variante;
    if (va !== undefined) it.variante = va;
    this.items.set(key, it);
    return it;
  }

  /** Práctica de un KC: lo agenda la primera vez; si estaba vencido avanza o reinicia; un fallo siempre reinicia. */
  registrarPractica(kc: string, correcto: boolean): ItemRepaso {
    const now = this.clock.now();
    const key = keyOf('kc', kc);
    const prev = this.items.get(key);
    if (!prev) {
      const it: ItemRepaso = { key, tipo: 'kc', ref: kc, kcs: [kc], etapa: 0, vence: this.dueAt(0, now), veces: 1, ultimo: now, retirado: false };
      this.items.set(key, it);
      return it;
    }
    prev.veces++;
    prev.ultimo = now;
    if (!correcto) { prev.etapa = 0; prev.vence = this.dueAt(0, now); prev.retirado = false; }
    else if (now >= prev.vence && !prev.retirado) this.avanzar(prev, now);
    return prev;
  }

  /** Resultado de un repaso de un ítem (error o KC). */
  registrarRepaso(key: string, correcto: boolean): ItemRepaso | undefined {
    const it = this.items.get(key);
    if (!it) return undefined;
    const now = this.clock.now();
    it.ultimo = now;
    if (correcto) this.avanzar(it, now);
    else { it.etapa = 0; it.vence = this.dueAt(0, now); it.retirado = false; }
    return it;
  }

  private avanzar(it: ItemRepaso, now: number): void {
    it.etapa++;
    if (it.etapa >= INTERVALOS_DIAS.length) { it.retirado = true; it.vence = Number.POSITIVE_INFINITY; return; }
    it.vence = this.dueAt(it.etapa, now);
  }

  get(key: string): ItemRepaso | undefined { return this.items.get(key); }

  /** Ítems vencidos, primero los errores y luego por fecha de vencimiento. */
  vencidos(now = this.clock.now()): ItemRepaso[] {
    return [...this.items.values()]
      .filter((i) => !i.retirado && i.vence <= now)
      .sort((a, b) => (a.tipo === b.tipo ? a.vence - b.vence : a.tipo === 'error' ? -1 : 1));
  }

  todos(): ItemRepaso[] { return [...this.items.values()]; }

  snapshot(): ItemRepaso[] {
    return this.todos().map((i) => ({ ...i, kcs: [...i.kcs], vence: Number.isFinite(i.vence) ? i.vence : -1 }));
  }

  restore(items: ItemRepaso[]): void {
    this.items = new Map(items.map((i) => [i.key, { ...i, kcs: [...i.kcs], vence: i.retirado ? Number.POSITIVE_INFINITY : i.vence }]));
  }
}
