import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/engine/rng';

describe('mulberry32', () => {
  it('es determinista por semilla', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  it('semillas distintas dan secuencias distintas', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it('valores en [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
