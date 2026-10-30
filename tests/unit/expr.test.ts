import { describe, expect, it } from 'vitest';
import { evaluate, ExprError, parse, variablesOf } from '../../src/engine/expr';

describe('expr', () => {
  it('precedencia y asociatividad', () => {
    expect(evaluate('1+2*3')).toBe(7);
    expect(evaluate('(1+2)*3')).toBe(9);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('-2^2')).toBe(-4);
    expect(evaluate('2^-1')).toBe(0.5);
    expect(evaluate('10/4/5')).toBe(0.5);
    expect(evaluate('8-3-2')).toBe(3);
    expect(evaluate('2**3')).toBe(8);
    expect(evaluate('3·2×2')).toBe(12);
  });
  it('números, constantes y funciones', () => {
    expect(evaluate('1.5e3 + .5')).toBe(1500.5);
    expect(evaluate('pi')).toBeCloseTo(Math.PI, 15);
    expect(evaluate('π*2')).toBeCloseTo(2 * Math.PI, 15);
    expect(evaluate('sqrt(16)+cbrt(27)+abs(-1)')).toBe(8);
    expect(evaluate('max(1, 5, 3)')).toBe(5);
    expect(evaluate('27^(1/3)')).toBeCloseTo(3, 12);
  });
  it('variables y raw()', () => {
    expect(evaluate('T*c/(pi*c^4/2)', { T: 1000, c: 0.02 })).toBeCloseTo(2000 / (Math.PI * 8e-6), 3);
    expect(evaluate('raw(d)/2', { d: 0.04 }, { d: 40 })).toBe(20);
    expect(variablesOf('T*L/((pi*raw(d)^4/2)*G)').sort()).toEqual(['G', 'L', 'T', 'd']);
  });
  it('rechaza entradas peligrosas o mal formadas', () => {
    for (const bad of ['alert(1)', 'constructor', '__proto__', 'a.b', '1+', '(1', '1)', 'x[0]', '"s"', 'raw(1)', 'sqrt(1,2)', '2 3', ';', 'T=1', '']) {
      expect(() => evaluate(bad, { T: 1 }), bad).toThrow(ExprError);
    }
    expect(() => evaluate('toString')).toThrow(ExprError);
    expect(() => evaluate('x', {})).toThrow(/sin valor/);
    expect(() => parse('('.repeat(300) + '1' + ')'.repeat(300))).toThrow(ExprError);
    expect(() => parse('1+'.repeat(1500) + '1')).toThrow(ExprError);
  });
  it('no usa eval ni Function', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../src/engine/expr.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\beval\s*\(|new Function|Function\(/);
  });
});
