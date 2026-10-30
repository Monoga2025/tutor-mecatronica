// Dimensiones como exponentes [L, M, T]. Los radianes y las revoluciones son adimensionales.
export type Dim = readonly [number, number, number];

export interface UnitDef { factor: number; dim: Dim }

const L: Dim = [1, 0, 0];
const F: Dim = [1, 1, -2];
const TORQUE: Dim = [2, 1, -2];
const STRESS: Dim = [-1, 1, -2];
const POWER: Dim = [2, 1, -3];
const FREQ: Dim = [0, 0, -1];
const NONE: Dim = [0, 0, 0];
const L4: Dim = [4, 0, 0];

const IN = 0.0254;
const LBF = 4.4482216152605;
const PSI = LBF / (IN * IN);

const TABLE: Record<string, UnitDef> = {
  '1': { factor: 1, dim: NONE },
  m: { factor: 1, dim: L },
  cm: { factor: 1e-2, dim: L },
  mm: { factor: 1e-3, dim: L },
  in: { factor: IN, dim: L },
  ft: { factor: 12 * IN, dim: L },
  N: { factor: 1, dim: F },
  kN: { factor: 1e3, dim: F },
  lb: { factor: LBF, dim: F },
  kip: { factor: 1e3 * LBF, dim: F },
  'N·m': { factor: 1, dim: TORQUE },
  'kN·m': { factor: 1e3, dim: TORQUE },
  'N·mm': { factor: 1e-3, dim: TORQUE },
  'lb·in': { factor: LBF * IN, dim: TORQUE },
  'lb·ft': { factor: LBF * 12 * IN, dim: TORQUE },
  'kip·in': { factor: 1e3 * LBF * IN, dim: TORQUE },
  Pa: { factor: 1, dim: STRESS },
  kPa: { factor: 1e3, dim: STRESS },
  MPa: { factor: 1e6, dim: STRESS },
  GPa: { factor: 1e9, dim: STRESS },
  psi: { factor: PSI, dim: STRESS },
  ksi: { factor: 1e3 * PSI, dim: STRESS },
  rad: { factor: 1, dim: NONE },
  '°': { factor: Math.PI / 180, dim: NONE },
  'rad/s': { factor: 1, dim: FREQ },
  Hz: { factor: 1, dim: FREQ },
  rpm: { factor: 1 / 60, dim: FREQ },
  W: { factor: 1, dim: POWER },
  kW: { factor: 1e3, dim: POWER },
  hp: { factor: 745.69987158227, dim: POWER },
  'm^4': { factor: 1, dim: L4 },
  'mm^4': { factor: 1e-12, dim: L4 },
  'in^4': { factor: IN ** 4, dim: L4 },
};

const ALIASES: Record<string, string> = {
  '': '1', '-': '1',
  'N*m': 'N·m', 'Nm': 'N·m', 'N.m': 'N·m',
  'kN*m': 'kN·m', 'kNm': 'kN·m', 'kN.m': 'kN·m',
  'N*mm': 'N·mm',
  'lb*in': 'lb·in', 'lb-in': 'lb·in', 'lb*ft': 'lb·ft', 'lb-ft': 'lb·ft', 'kip*in': 'kip·in', 'kip-in': 'kip·in',
  deg: '°', grados: '°',
  'rev/min': 'rpm', 'r/min': 'rpm', 'rad/seg': 'rad/s',
  'm4': 'm^4', 'mm4': 'mm^4', 'm⁴': 'm^4', 'mm⁴': 'mm^4', 'in4': 'in^4', 'in⁴': 'in^4',
};

export class UnitError extends Error {}

export function normalizeUnit(u: string): string {
  const k = u.trim();
  if (k in TABLE) return k;
  const a = ALIASES[k];
  if (a !== undefined) return a;
  throw new UnitError(`Unidad desconocida: "${u}"`);
}

export function isUnit(u: string): boolean {
  try { normalizeUnit(u); return true; } catch { return false; }
}

export function unitDef(u: string): UnitDef {
  return TABLE[normalizeUnit(u)]!;
}

export function sameDim(a: Dim, b: Dim): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function compatible(a: string, b: string): boolean {
  return sameDim(unitDef(a).dim, unitDef(b).dim);
}

export function toSI(value: number, unit: string): number {
  return value * unitDef(unit).factor;
}

export function fromSI(value: number, unit: string): number {
  return value / unitDef(unit).factor;
}

export function convert(value: number, from: string, to: string): number {
  const f = unitDef(from), t = unitDef(to);
  if (!sameDim(f.dim, t.dim)) throw new UnitError(`No se puede convertir ${from} a ${to}`);
  return (value * f.factor) / t.factor;
}

export function listUnits(): string[] {
  return Object.keys(TABLE);
}

/** Formato con cifras significativas, sin notación científica salvo números extremos. */
export function formatNumber(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e6 || ax < 1e-3) return x.toExponential(sig - 1).replace('e', '×10^').replace('^+', '^');
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(ax)));
  return Number(x.toFixed(digits)).toString();
}

export function formatQuantity(value: number, unit: string, sig = 3): string {
  const u = normalizeUnit(unit);
  return u === '1' ? formatNumber(value, sig) : u === '°' ? `${formatNumber(value, sig)}°` : `${formatNumber(value, sig)} ${u}`;
}
