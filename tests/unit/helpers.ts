import raw from '../../contenido/paquetes/torsion.json';
import { loadPack, type Pack } from '../../src/engine/pack';

export const torsion: Pack = loadPack(raw);

/** Copia del paquete con una fórmula "directo" (x → x) por cada unidad de resultado, para probar el juez con valores exactos. */
export function packConDirecto(): Pack {
  const p = structuredClone(torsion);
  for (const u of ['Pa', 'rad', 'N·m', 'm']) {
    p.formulas.push({ id: `directo_${u}`, latex: 'x', expr: 'x', resultado: { simbolo: 'x', unidad: u }, variables: ['x'] });
  }
  return p;
}
