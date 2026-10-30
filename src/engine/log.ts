import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Clock } from './clock';
import type { Instance } from './generator';
import type { Confianza, Submission, Verdict } from './judge';

export interface EventoIntento {
  tipo: 'intento';
  exerciseId: string;
  modulo: string;
  seed: number;
  variante: number;
  kcs: string[];
  formulaId: string;
  bindings: Submission['bindings'];
  valorMostrado?: number;
  esperadoMostrado: number;
  unidad: string;
  resultado: Verdict['resultado'];
  errorId?: string;
  motivoInvalido?: string;
  pistas: number;
  tiempoMs: number;
  confianza: Confianza;
  prediccion?: string | number | boolean;
  prediccionAcierta?: boolean;
  modo?: 'practica' | 'repaso' | 'prueba' | 'examen';
}
export interface EventoPista { tipo: 'pista'; exerciseId: string; escalon: number }
export interface EventoOtro { tipo: 'otro'; nombre: string; datos?: unknown }

export type EventoDatos = EventoIntento | EventoPista | EventoOtro;
export type Evento = EventoDatos & { id: number; ts: number };

export interface EventLog {
  append(e: EventoDatos): Promise<Evento>;
  all(): Promise<Evento[]>;
  query(f: { tipo?: Evento['tipo']; desde?: number; hasta?: number; exerciseId?: string }): Promise<Evento[]>;
  exportJSON(): Promise<string>;
  clear(): Promise<void>;
}

export function intentoDesde(inst: Instance, sub: Submission, v: Verdict, extra: { pistas: number; tiempoMs: number; modo?: EventoIntento['modo'] }): EventoIntento {
  const e: EventoIntento = {
    tipo: 'intento', exerciseId: inst.exerciseId, modulo: inst.modulo, seed: inst.seed, variante: inst.variante,
    kcs: [...inst.kcs], formulaId: sub.formulaId, bindings: structuredClone(sub.bindings),
    esperadoMostrado: inst.correcto.mostrado, unidad: inst.incognita.unidad, resultado: v.resultado,
    pistas: extra.pistas, tiempoMs: extra.tiempoMs, confianza: sub.confianza,
  };
  if (v.valor) e.valorMostrado = v.valor.mostrado;
  if (v.errorId) e.errorId = v.errorId;
  if (v.motivoInvalido) e.motivoInvalido = v.motivoInvalido;
  if (sub.prediccion !== undefined) e.prediccion = sub.prediccion;
  if (v.prediccion) e.prediccionAcierta = v.prediccion.acierta;
  if (extra.modo) e.modo = extra.modo;
  return e;
}

function filtrar(evs: Evento[], f: Parameters<EventLog['query']>[0]): Evento[] {
  return evs.filter((e) =>
    (!f.tipo || e.tipo === f.tipo) && (f.desde === undefined || e.ts >= f.desde) && (f.hasta === undefined || e.ts <= f.hasta)
    && (!f.exerciseId || ('exerciseId' in e && e.exerciseId === f.exerciseId)));
}

function exportar(evs: Evento[], clock: Clock): string {
  return JSON.stringify({ formato: 'raton-ingeniero/eventos', version: 1, exportado: new Date(clock.now()).toISOString(), eventos: evs }, null, 2);
}

export class MemoryEventLog implements EventLog {
  private evs: Evento[] = [];
  private next = 1;
  constructor(private clock: Clock) {}
  async append(e: EventoDatos): Promise<Evento> {
    const ev = { ...structuredClone(e), id: this.next++, ts: this.clock.now() } as Evento;
    this.evs.push(ev);
    return ev;
  }
  async all(): Promise<Evento[]> { return structuredClone(this.evs); }
  async query(f: Parameters<EventLog['query']>[0]): Promise<Evento[]> { return filtrar(await this.all(), f); }
  async exportJSON(): Promise<string> { return exportar(this.evs, this.clock); }
  async clear(): Promise<void> { this.evs = []; }
}

interface LogDB extends DBSchema {
  eventos: { key: number; value: Evento; indexes: { ts: number } };
}

/** Registro persistente en IndexedDB del navegador. Los datos no salen del equipo. */
export class IdbEventLog implements EventLog {
  private db: Promise<IDBPDatabase<LogDB>>;
  constructor(private clock: Clock, name = 'raton-ingeniero') {
    this.db = openDB<LogDB>(name, 1, {
      upgrade(db) {
        const s = db.createObjectStore('eventos', { keyPath: 'id', autoIncrement: true });
        s.createIndex('ts', 'ts');
      },
    });
  }
  async append(e: EventoDatos): Promise<Evento> {
    const db = await this.db;
    const sin = { ...structuredClone(e), ts: this.clock.now() } as Omit<Evento, 'id'>;
    const id = await db.add('eventos', sin as Evento);
    return { ...sin, id } as Evento;
  }
  async all(): Promise<Evento[]> { return (await this.db).getAll('eventos'); }
  async query(f: Parameters<EventLog['query']>[0]): Promise<Evento[]> { return filtrar(await this.all(), f); }
  async exportJSON(): Promise<string> { return exportar(await this.all(), this.clock); }
  async clear(): Promise<void> { await (await this.db).clear('eventos'); }
}
