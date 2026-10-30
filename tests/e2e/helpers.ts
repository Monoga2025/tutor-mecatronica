import { expect, type Page } from '@playwright/test';

export interface V3 { x: number; y: number; z: number }
export interface State {
  t: number; pos: V3; vel: V3; speed: number; yaw: number; grounded: boolean;
  camera: V3 & { dist: number; inside?: boolean; clearance?: number };
  touchControls: boolean;
  module?: string | null;
  perf: { frameMs: number; cpuMs: number; heapMB: number | null; geometries: number; textures: number; drawCalls: number };
  [k: string]: unknown;
}

export async function boot(page: Page, query = '?test=1'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__game?.ready === true);
  return errors;
}

export const state = (page: Page): Promise<State> => page.evaluate(() => window.__game.getState() as State);

export async function run(page: Page, keys: Record<string, boolean>, n: number): Promise<State> {
  return page.evaluate(([k, steps]) => {
    window.__game.setInput(k as Record<string, boolean>);
    window.__game.step(1 / 60, steps as number);
    return window.__game.getState() as State;
  }, [keys, n] as const);
}

export function expectNoErrors(errors: string[]): void {
  expect(errors, errors.join('\n')).toEqual([]);
}
