import { describe, expect, it } from 'vitest';
import { compatible, convert, formatNumber, formatQuantity, fromSI, normalizeUnit, toSI, UnitError } from '../../src/engine/units';

describe('unidades', () => {
  it('conversiones SI básicas', () => {
    expect(toSI(40, 'mm')).toBeCloseTo(0.04, 15);
    expect(toSI(1.5, 'kN·m')).toBe(1500);
    expect(toSI(77, 'GPa')).toBe(77e9);
    expect(toSI(15, 'kW')).toBe(15000);
    expect(toSI(1200, 'rpm')).toBe(20);
    expect(toSI(180, '°')).toBeCloseTo(Math.PI, 15);
    expect(fromSI(119.366e6, 'MPa')).toBeCloseTo(119.366, 6);
    expect(fromSI(1e-12, 'mm^4')).toBeCloseTo(1, 12);
  });
  it('unidades inglesas', () => {
    expect(convert(1, 'in', 'mm')).toBeCloseTo(25.4, 12);
    expect(convert(1, 'ksi', 'psi')).toBeCloseTo(1000, 9);
    expect(convert(1, 'psi', 'Pa')).toBeCloseTo(6894.757, 3);
    expect(convert(1, 'lb·ft', 'lb·in')).toBeCloseTo(12, 12);
    expect(convert(1, 'lb·in', 'N·m')).toBeCloseTo(0.112985, 6);
  });
  it('alias y dimensiones', () => {
    expect(normalizeUnit('kN*m')).toBe('kN·m');
    expect(normalizeUnit('deg')).toBe('°');
    expect(compatible('mm', 'in')).toBe(true);
    expect(compatible('MPa', 'GPa')).toBe(true);
    expect(compatible('mm', 'N·m')).toBe(false);
    expect(compatible('rpm', 'Hz')).toBe(true);
    expect(() => convert(1, 'mm', 'MPa')).toThrow(UnitError);
    expect(() => toSI(1, 'furlong')).toThrow(UnitError);
  });
  it('formato', () => {
    expect(formatNumber(119.366)).toBe('119');
    expect(formatNumber(2.2209, 3)).toBe('2.22');
    expect(formatNumber(0.0387, 3)).toBe('0.0387');
    expect(formatQuantity(1.5, 'kN·m')).toBe('1.5 kN·m');
    expect(formatQuantity(2.22, '°')).toBe('2.22°');
  });
});
