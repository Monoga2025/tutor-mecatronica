import { parse, type Node } from '../engine/expr';
import { symLatex } from './katex';

const prec = (n: Node): number => (n.k === 'bin' ? ({ '+': 1, '-': 1, '*': 2, '/': 3, '^': 4 } as const)[n.op] : n.k === 'neg' ? 1.5 : 9);

/** Convierte una expresión del paquete a LaTeX; `variable` decide cómo se dibuja cada variable (p. ej. un hueco). */
export function exprToLatex(src: string, variable: (name: string) => string = symLatex, compuestas = false): string {
  const go = (n: Node): string => {
    switch (n.k) {
      case 'num': return String(n.v);
      case 'var': return n.name === 'pi' ? '\\pi' : variable(n.name);
      case 'neg': return `-${wrap(n.a, 2)}`;
      case 'call': return `\\operatorname{${n.fn}}\\left(${n.args.map(go).join(',')}\\right)`;
      case 'bin': {
        if (n.op === '/') return `\\dfrac{${go(n.a)}}{${go(n.b)}}`;
        if (n.op === '^') return `{${compuestas && n.a.k === 'var' && n.a.name !== 'pi' ? `\\left(${go(n.a)}\\right)` : wrap(n.a, 5)}}^{${go(n.b)}}`;
        if (n.op === '*') return `${wrap(n.a, 2)}${compuestas ? '\\cdot ' : '\\,'}${wrap(n.b, 2)}`;
        return `${wrap(n.a, 1)} ${n.op} ${wrap(n.b, n.op === '-' ? 2 : 1)}`;
      }
    }
  };
  const wrap = (n: Node, min: number): string => (prec(n) < min ? `\\left(${go(n)}\\right)` : go(n));
  return go(parse(src));
}
