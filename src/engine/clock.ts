export interface Clock { now(): number }

export const systemClock: Clock = { now: () => Date.now() };

export interface FakeClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

export function fakeClock(start = 0): FakeClock {
  let t = start;
  return {
    now: () => t,
    set: (ms) => { t = ms; },
    advance: (ms) => { t += ms; },
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;
