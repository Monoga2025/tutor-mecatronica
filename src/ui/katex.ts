import katex from 'katex';
import 'katex/dist/katex.min.css';

const OPTS = {
  throwOnError: false,
  strict: false as const,
  trust: (c: { command: string }) => c.command === '\\htmlData' || c.command === '\\htmlClass',
};

/** Renderiza LaTeX con KaTeX dentro de el. */
export function tex(el: HTMLElement, latex: string, display = false): HTMLElement {
  katex.render(latex, el, { ...OPTS, displayMode: display });
  return el;
}

export function texEl(latex: string, display = false, tag = 'span'): HTMLElement {
  return tex(document.createElement(tag), latex, display);
}

/** Símbolo de la fórmula → LaTeX (tau_max → \tau_{máx}, c2 → c_2, pi → \pi). */
export function symLatex(s: string): string {
  const greek: Record<string, string> = { tau: '\\tau', phi: '\\phi', pi: '\\pi', omega: '\\omega', theta: '\\theta', rho: '\\rho' };
  const m = /^([a-zA-Z]+)(?:_([a-zA-Z0-9]+)|(\d+))?$/.exec(s);
  if (!m) return s;
  const head = greek[m[1]!] ?? m[1]!;
  const sub = m[2] ?? m[3];
  return sub ? `${head}_{${sub === 'adm' ? '\\text{adm}' : sub === 'max' ? '\\text{máx}' : sub}}` : head;
}

/** Unidad → LaTeX en texto. */
export function unitLatex(u: string): string {
  const map: Record<string, string> = { 'N·m': '\\text{N·m}', 'kN·m': '\\text{kN·m}', '°': '^\\circ', 'm^4': '\\text{m}^4', 'mm^4': '\\text{mm}^4' };
  return map[u] ?? `\\text{${u}}`;
}
