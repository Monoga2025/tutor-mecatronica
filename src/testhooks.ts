export interface GameHook {
  ready: boolean;
  seed: number;
  getState(): unknown;
  setInput(keys: Record<string, boolean>): void;
  step(dt: number, n?: number): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  enterModule(id: string): void;
  engine: unknown;
  clock: { set(ms: number): void; now(): number };
  /** Eventos emitidos por el juego, en orden (para pruebas). */
  events: { type: string; detail: unknown; t: number }[];
  /** Instancia del juego (capas siguientes: registerModule, exitModule...). */
  game?: unknown;
  /** Módulo activo (ganchos propios del módulo para el bot). */
  module?: unknown;
}

declare global {
  interface Window { __game: GameHook }
}

export function installHook(partial: Partial<GameHook> & Pick<GameHook, 'seed' | 'step'>): GameHook {
  let clockOffset = 0;
  const hook: GameHook = {
    ready: false,
    getState: () => ({}),
    setInput: () => {},
    teleport: () => {},
    enterModule: () => {},
    engine: {},
    clock: {
      set: (ms: number) => { clockOffset = ms - Date.now(); },
      now: () => Date.now() + clockOffset,
    },
    events: [],
    ...partial,
  };
  window.__game = hook;
  return hook;
}
