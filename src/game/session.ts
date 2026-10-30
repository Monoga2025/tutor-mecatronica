import raw from '../../contenido/paquetes/torsion.json';
import type { Clock } from '../engine/clock';
import { BktModel } from '../engine/learner/bkt';
import { Schedule } from '../engine/learner/schedule';
import { MemoryEventLog } from '../engine/log';
import { loadPack, type Pack } from '../engine/pack';
import { Tutor } from '../engine/tutor';

/** Estado del jugador durante la sesión de la página (la capa e lo hará persistente). */
export interface Session {
  pack: Pack;
  tutor: Tutor;
  clock: Clock;
  /** Instancias ya trabajadas por ejercicio (para retirar el ejemplo resuelto). */
  vistos: Map<string, number>;
  seedBase: number;
  nextSeed(): number;
}

let current: Session | null = null;

export function getSession(): Session {
  if (current) return current;
  const clock: Clock = { now: () => window.__game?.clock?.now() ?? Date.now() };
  const pack = loadPack(raw);
  const tutor = new Tutor(pack, new BktModel(), new Schedule(clock), new MemoryEventLog(clock), clock);
  let n = 0;
  const seedBase = window.__game?.seed ?? 1;
  current = { pack, tutor, clock, vistos: new Map(), seedBase, nextSeed: () => (seedBase + 7919 * n++) >>> 0 };
  return current;
}
