import type { EstadoFisico, Instance } from '../../../engine/generator';
import { within, type Verdict } from '../../../engine/judge';

/** Lo que la escena muestra al aplicar la carga. Puro: sin three ni DOM. */
export type EstadoVisual = EstadoFisico | 'gira_mas' | 'gira_menos';
export type Fractura = 'ductil' | 'fragil';
export type Prediccion = 'rompe' | 'aprueba' | 'sobra';

export interface Material { nombre: string; G: number; fractura: Fractura }
export const MATERIALES: Record<'acero' | 'fundicion' | 'aluminio', Material> = {
  acero: { nombre: 'acero', G: 77e9, fractura: 'ductil' },
  fundicion: { nombre: 'fundición', G: 41e9, fractura: 'fragil' },
  aluminio: { nombre: 'aluminio', G: 26e9, fractura: 'ductil' },
};

export function materialDe(enunciado: string): Material {
  if (/fundici/i.test(enunciado)) return MATERIALES.fundicion;
  if (/alumin/i.test(enunciado)) return MATERIALES.aluminio;
  return MATERIALES.acero;
}

/** Longitud de la escena cuando el enunciado no la da: 12,5 diámetros (eje esbelto típico). */
export const L_POR_DIAMETRO = 12.5;

export const jMacizo = (c: number): number => (Math.PI * c ** 4) / 2;
/** φ(x) = T·x/(J·G) en radianes. */
export const phiReal = (T: number, x: number, c: number, G: number): number => (T * x) / (jMacizo(c) * G);
/** τ(ρ) = T·ρ/J en Pa. */
export const tauEn = (T: number, rho: number, c: number): number => (T * rho) / jMacizo(c);

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
/** Exageración "redonda" para que el giro dibujado quede cerca de `objetivo` rad. */
export function exageracionPara(phi: number, objetivo = 0.8): number {
  if (!(phi > 0)) return 1;
  const ideal = objetivo / phi;
  let best = 1;
  for (const n of NICE) if (n <= ideal * 1.25) best = n;
  return best;
}

export interface Visual {
  estado: EstadoVisual;
  fractura: Fractura | null;
  /** Utilización real τ/τadm y la que implica el número del jugador. */
  uReal: number;
  uJugador: number | null;
  tauReal: number;
  tauJugador: number | null;
  tauAdm: number | null;
  decisionJugador: 'aprueba' | 'no_aprueba' | null;
  decisionCoincide: boolean | null;
  /** Radio del eje que describe tu cálculo (con el mismo T) / radio real. */
  ghostScale: number | null;
  /** Radio del eje engordado que elegirías / radio real (rechazaste un eje que bastaba). */
  surplusScale: number | null;
  /** Radio que bastaba / radio real (el eje real tiene material de sobra). */
  neededScale: number | null;
  /** Fracción de la carga a la que se rompe (0..1) si estado = rompe. */
  breakAt: number | null;
  titulo: string;
  texto: string;
}

export const observadoDe = (e: EstadoVisual): Prediccion => (e === 'rompe' ? 'rompe' : e === 'sobra' ? 'sobra' : 'aprueba');

const pct = (x: number): string => `${Math.round(x * 100)} %`;

/**
 * Consecuencia física honesta: el eje real responde a la carga real; tu número decide qué habrías hecho
 * con él (aprobarlo, rechazarlo, engordarlo) y el fantasma muestra el eje que tu cálculo describe.
 */
export function consecuenciaVisual(inst: Instance, v: Verdict, material: Material, cReal: number): Visual {
  const tauAdm = inst.limites.tau_adm?.si ?? null;
  const uReal = inst.fisica?.utilizacion ?? 1;
  const real = inst.fisica?.estado ?? 'ok';
  const tauReal = inst.correcto.si;
  const base: Visual = {
    estado: real, fractura: null, uReal, uJugador: null, tauReal, tauJugador: null, tauAdm,
    decisionJugador: null, decisionCoincide: null, ghostScale: null, surplusScale: null, neededScale: null, breakAt: null,
    titulo: '', texto: '',
  };
  const out = { ...base };
  if (v.resultado !== 'invalido' && v.valor) {
    out.tauJugador = v.valor.si;
    if (tauAdm) {
      out.uJugador = v.valor.si / tauAdm;
      out.decisionJugador = out.uJugador <= 1 ? 'aprueba' : 'no_aprueba';
      out.decisionCoincide = (out.decisionJugador === 'aprueba') === (uReal <= 1);
    }
  }
  if (v.correcto || out.uJugador === null) {
    out.estado = real;
  } else if (out.decisionJugador === 'aprueba') {
    out.estado = real;
  } else {
    // Rechazas el eje: si bastaba, lo engordarías hasta que TU τ pase → material de sobra.
    out.estado = real === 'rompe' || real === 'al_limite' ? real : 'sobra';
    if (out.estado === 'sobra') out.surplusScale = Math.cbrt(out.uJugador);
  }
  if (!v.correcto && out.tauJugador && out.tauJugador > 0 && !within(out.tauJugador, tauReal)) {
    out.ghostScale = Math.cbrt(tauReal / out.tauJugador);
  }
  if (out.estado === 'sobra' && out.surplusScale === null) out.neededScale = Math.cbrt(uReal);
  if (out.estado === 'rompe') {
    out.fractura = material.fractura;
    out.breakAt = Math.min(1, 1.05 / uReal);
  }

  const dmm = (scale: number): string => `${Math.round(2 * cReal * scale * 1000)} mm`;
  switch (out.estado) {
    case 'rompe':
      out.titulo = material.fractura === 'ductil' ? 'Se rompe: fractura dúctil, plana' : 'Se rompe: fractura frágil en hélice a 45°';
      out.texto = `τ real = ${(tauReal / 1e6).toFixed(1)} MPa supera τadm (${pct(uReal)} de utilización).`;
      break;
    case 'al_limite':
      out.titulo = 'Al límite: vibra';
      out.texto = `Trabaja al ${pct(uReal)} de τadm: pasa por poco, sin margen.`;
      break;
    case 'sobra':
      out.titulo = 'Sobra material';
      out.texto = out.surplusScale
        ? `El eje bastaba (${pct(uReal)}); con tu número lo engordarías a d ≈ ${dmm(out.surplusScale)} (+${pct(out.surplusScale ** 2 - 1)} de material).`
        : `Trabaja al ${pct(uReal)}: bastaba d ≈ ${dmm(out.neededScale!)}; sobra ${pct(1 - out.neededScale! ** 2)} del material.`;
      break;
    case 'ok':
      out.titulo = 'Aguanta';
      out.texto = `Trabaja al ${pct(uReal)} de τadm.`;
      break;
    default:
      out.titulo = out.estado === 'gira_mas' ? 'Gira de más' : 'Gira de menos';
      out.texto = '';
  }
  if (out.ghostScale !== null) {
    const fuera = out.ghostScale > 3.5 || out.ghostScale < 0.3;
    out.texto += ` Tu cálculo describe un eje de d ≈ ${dmm(out.ghostScale)}${fuera ? ' (fuera de escala)' : ''}, no el real.`;
  }
  return out;
}
