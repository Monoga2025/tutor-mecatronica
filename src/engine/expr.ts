// Mini-intérprete seguro de expresiones aritméticas. Nada de eval ni Function.
export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

export class ExprError extends Error {}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };
const FUNCS: Record<string, (...x: number[]) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  ln: Math.log, log10: Math.log10, exp: Math.exp,
  min: (...x) => Math.min(...x), max: (...x) => Math.max(...x),
};
const ARITY: Record<string, [number, number]> = { min: [1, 8], max: [1, 8] };
/** raw(x): valor de x en su unidad mostrada, sin convertir a SI (para modelar errores de unidades). */
export const RAW_FN = 'raw';

const MAX_LEN = 2000;

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new ExprError('Expresión demasiado larga');
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`Número inválido en posición ${i}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_Ͱ-Ͽ]/.test(c)) {
      const m = /^[A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') { out.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c === '·' ? '*' : c }); i++; continue; }
    if (c === '·' || c === '×') { out.push({ t: 'op', v: '*' }); i++; continue; }
    throw new ExprError(`Carácter inesperado "${c}" en posición ${i}`);
  }
  return out;
}

class Parser {
  private p = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private isOp(v: string): boolean { const t = this.peek(); return t?.t === 'op' && t.v === v; }
  private expect(v: string): void {
    if (!this.isOp(v)) throw new ExprError(`Se esperaba "${v}"`);
    this.p++;
  }
  parse(): Node {
    const n = this.expr();
    if (this.p !== this.toks.length) throw new ExprError('Sobra texto al final de la expresión');
    return n;
  }
  private expr(): Node {
    let a = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.p++] as { v: '+' | '-' }).v;
      a = { k: 'bin', op, a, b: this.term() };
    }
    return a;
  }
  private term(): Node {
    let a = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.toks[this.p++] as { v: '*' | '/' }).v;
      a = { k: 'bin', op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp('-')) { this.p++; return { k: 'neg', a: this.unary() }; }
    if (this.isOp('+')) { this.p++; return this.unary(); }
    return this.power();
  }
  private power(): Node {
    const base = this.atom();
    if (this.isOp('^')) { this.p++; return { k: 'bin', op: '^', a: base, b: this.unary() }; }
    return base;
  }
  private atom(): Node {
    if (++this.depth > 200) throw new ExprError('Expresión demasiado anidada');
    try {
      const t = this.peek();
      if (!t) throw new ExprError('Expresión incompleta');
      if (t.t === 'num') { this.p++; return { k: 'num', v: t.v }; }
      if (t.t === 'id') {
        this.p++;
        if (this.isOp('(')) {
          this.p++;
          const args: Node[] = [];
          if (!this.isOp(')')) {
            args.push(this.expr());
            while (this.isOp(',')) { this.p++; args.push(this.expr()); }
          }
          this.expect(')');
          if (t.v === RAW_FN) {
            if (args.length !== 1 || args[0]!.k !== 'var') throw new ExprError('raw() recibe un nombre de variable');
          } else {
            if (!(t.v in FUNCS)) throw new ExprError(`Función desconocida: ${t.v}`);
            const [lo, hi] = ARITY[t.v] ?? [1, 1];
            if (args.length < lo || args.length > hi) throw new ExprError(`Número de argumentos incorrecto para ${t.v}`);
          }
          return { k: 'call', fn: t.v, args };
        }
        return { k: 'var', name: t.v };
      }
      if (t.v === '(') { this.p++; const n = this.expr(); this.expect(')'); return n; }
      throw new ExprError(`Símbolo inesperado "${t.v}"`);
    } finally { this.depth--; }
  }
}

const cache = new Map<string, Node>();

export function parse(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const n = new Parser(tokenize(src)).parse();
  if (cache.size > 500) cache.clear();
  cache.set(src, n);
  return n;
}

export type Scope = Readonly<Record<string, number>>;

export function evaluate(src: string | Node, scope: Scope = {}, raw: Scope = {}): number {
  const n = typeof src === 'string' ? parse(src) : src;
  return ev(n, scope, raw);
}

function lookup(name: string, scope: Scope): number {
  if (Object.prototype.hasOwnProperty.call(scope, name)) return scope[name]!;
  if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name]!;
  throw new ExprError(`Variable sin valor: ${name}`);
}

function ev(n: Node, scope: Scope, raw: Scope): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': return lookup(n.name, scope);
    case 'neg': return -ev(n.a, scope, raw);
    case 'call': {
      if (n.fn === RAW_FN) {
        const name = (n.args[0] as { name: string }).name;
        if (!Object.prototype.hasOwnProperty.call(raw, name)) throw new ExprError(`raw(${name}) sin valor mostrado`);
        return raw[name]!;
      }
      return FUNCS[n.fn]!(...n.args.map((a) => ev(a, scope, raw)));
    }
    case 'bin': {
      const a = ev(n.a, scope, raw), b = ev(n.b, scope, raw);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return Math.pow(a, b);
      }
    }
  }
}

/** Nombres de variables libres (excluye constantes; incluye las usadas dentro de raw()). */
export function variablesOf(src: string | Node): string[] {
  const n = typeof src === 'string' ? parse(src) : src;
  const s = new Set<string>();
  const walk = (x: Node): void => {
    if (x.k === 'var') { if (!(x.name in CONSTANTS)) s.add(x.name); }
    else if (x.k === 'neg') walk(x.a);
    else if (x.k === 'bin') { walk(x.a); walk(x.b); }
    else if (x.k === 'call') x.args.forEach(walk);
  };
  walk(n);
  return [...s];
}
