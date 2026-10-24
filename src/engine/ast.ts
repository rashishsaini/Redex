/**
 * Immutable AST nodes and capture-avoiding substitution for PureStep.
 * Runtime-only MapRun/FoldRun nodes expose progress without precomputing the
 * final result; parser input can never create those nodes directly.
 */

export type ErrorKind = "syntax" | "name" | "runtime";

export class PureStepError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "PureStepError";
    this.kind = kind;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function syntaxError(message: string, line: number, column: number): PureStepError {
  return new PureStepError("syntax", `Syntax error at line ${line}, column ${column}: ${message}`);
}
export function nameError(message: string): PureStepError {
  return new PureStepError("name", `Name error: ${message}`);
}
export function runtimeError(message: string): PureStepError {
  return new PureStepError("runtime", `Runtime error: ${message}`);
}
export function assertNever(value: never): never {
  throw new Error(`PureStep internal error: unhandled case ${JSON.stringify(value)}`);
}

export type BinaryOperator = "+" | "-" | "*";

export interface IntLit { readonly tag: "int"; readonly value: number }
export interface Var { readonly tag: "var"; readonly name: string }
export interface Lam { readonly tag: "lam"; readonly param: string; readonly body: Expr }
export interface App { readonly tag: "app"; readonly fn: Expr; readonly arg: Expr }
export interface BinOp { readonly tag: "binop"; readonly op: BinaryOperator; readonly left: Expr; readonly right: Expr }
export interface UnaryOp { readonly tag: "unary"; readonly op: "-"; readonly expr: Expr }
export interface ListLit { readonly tag: "list"; readonly items: readonly Expr[] }
export interface LetExpr { readonly tag: "let"; readonly name: string; readonly value: Expr; readonly body: Expr }

/** A map call being evaluated element by element. */
export interface MapRun {
  readonly tag: "mapRun";
  readonly fn: Expr;
  readonly input: readonly Expr[];
  readonly done: readonly Expr[];
  readonly current: Expr | null;
}

/** A foldl call being evaluated left to right. `current` is fn accumulator element. */
export interface FoldRun {
  readonly tag: "foldRun";
  readonly fn: Expr;
  readonly input: readonly Expr[];
  readonly accumulator: Expr;
  readonly index: number;
  readonly current: Expr | null;
}

export type Expr = IntLit | Var | Lam | App | BinOp | UnaryOp | ListLit | LetExpr | MapRun | FoldRun;

export function intLit(value: number): IntLit { return Object.freeze({ tag: "int", value }); }
export function variable(name: string): Var { return Object.freeze({ tag: "var", name }); }
export function lambda(param: string, body: Expr): Lam { return Object.freeze({ tag: "lam", param, body }); }
export function apply(fn: Expr, arg: Expr): App { return Object.freeze({ tag: "app", fn, arg }); }
export function binary(op: BinaryOperator, left: Expr, right: Expr): BinOp {
  return Object.freeze({ tag: "binop", op, left, right });
}
export function negate(expr: Expr): UnaryOp { return Object.freeze({ tag: "unary", op: "-", expr }); }
export function listLit(items: readonly Expr[]): ListLit {
  return Object.freeze({ tag: "list", items: Object.freeze(items.slice()) });
}
export function letBinding(name: string, value: Expr, body: Expr): LetExpr {
  return Object.freeze({ tag: "let", name, value, body });
}
export function mapRun(fn: Expr, input: readonly Expr[], done: readonly Expr[], current: Expr | null): MapRun {
  return Object.freeze({ tag: "mapRun", fn, input: Object.freeze(input.slice()), done: Object.freeze(done.slice()), current });
}
export function foldRun(
  fn: Expr,
  input: readonly Expr[],
  accumulator: Expr,
  index: number,
  current: Expr | null,
): FoldRun {
  return Object.freeze({
    tag: "foldRun",
    fn,
    input: Object.freeze(input.slice()),
    accumulator,
    index,
    current,
  });
}

/** Unwinds `f a b c` into head `f` and args `[a, b, c]`. */
export function spine(e: Expr): { head: Expr; args: Expr[] } {
  const args: Expr[] = [];
  let head: Expr = e;
  while (head.tag === "app") { args.unshift(head.arg); head = head.fn; }
  return { head, args };
}

export function freeVars(e: Expr): ReadonlySet<string> {
  const out = new Set<string>();
  collectFree(e, new Set<string>(), out);
  return out;
}

function collectFree(e: Expr, bound: ReadonlySet<string>, out: Set<string>): void {
  switch (e.tag) {
    case "int": return;
    case "var": if (!bound.has(e.name)) out.add(e.name); return;
    case "lam": {
      const inner = new Set(bound); inner.add(e.param); collectFree(e.body, inner, out); return;
    }
    case "app": collectFree(e.fn, bound, out); collectFree(e.arg, bound, out); return;
    case "binop": collectFree(e.left, bound, out); collectFree(e.right, bound, out); return;
    case "unary": collectFree(e.expr, bound, out); return;
    case "list": for (const item of e.items) collectFree(item, bound, out); return;
    case "let": {
      collectFree(e.value, bound, out);
      const inner = new Set(bound); inner.add(e.name); collectFree(e.body, inner, out); return;
    }
    case "mapRun":
      collectFree(e.fn, bound, out);
      for (const item of e.input) collectFree(item, bound, out);
      for (const item of e.done) collectFree(item, bound, out);
      if (e.current !== null) collectFree(e.current, bound, out);
      return;
    case "foldRun":
      collectFree(e.fn, bound, out);
      for (const item of e.input) collectFree(item, bound, out);
      collectFree(e.accumulator, bound, out);
      if (e.current !== null) collectFree(e.current, bound, out);
      return;
    default: return assertNever(e);
  }
}

function freshName(base: string, avoid: ReadonlySet<string>): string {
  let candidate = `${base}'`;
  while (avoid.has(candidate)) candidate += "'";
  return candidate;
}

/** Capture-avoiding substitution: `e[name := value]`. */
export function substitute(e: Expr, name: string, value: Expr): Expr {
  switch (e.tag) {
    case "int": return e;
    case "var": return e.name === name ? value : e;
    case "lam": {
      if (e.param === name || !freeVars(e.body).has(name)) return e;
      const valueFree = freeVars(value);
      if (!valueFree.has(e.param)) return lambda(e.param, substitute(e.body, name, value));
      const avoid = new Set<string>(valueFree);
      freeVars(e.body).forEach((n) => avoid.add(n)); avoid.add(name);
      const fresh = freshName(e.param, avoid);
      const renamedBody = substitute(e.body, e.param, variable(fresh));
      return lambda(fresh, substitute(renamedBody, name, value));
    }
    case "app": return apply(substitute(e.fn, name, value), substitute(e.arg, name, value));
    case "binop": return binary(e.op, substitute(e.left, name, value), substitute(e.right, name, value));
    case "unary": return negate(substitute(e.expr, name, value));
    case "list": return listLit(e.items.map((item) => substitute(item, name, value)));
    case "let": {
      const boundValue = substitute(e.value, name, value); // let binder is not in scope here
      if (e.name === name || !freeVars(e.body).has(name)) return letBinding(e.name, boundValue, e.body);
      const valueFree = freeVars(value);
      if (!valueFree.has(e.name)) return letBinding(e.name, boundValue, substitute(e.body, name, value));
      const avoid = new Set<string>(valueFree);
      freeVars(e.body).forEach((n) => avoid.add(n)); avoid.add(name);
      const fresh = freshName(e.name, avoid);
      const renamedBody = substitute(e.body, e.name, variable(fresh));
      return letBinding(fresh, boundValue, substitute(renamedBody, name, value));
    }
    case "mapRun":
      return mapRun(
        substitute(e.fn, name, value),
        e.input.map((item) => substitute(item, name, value)),
        e.done.map((item) => substitute(item, name, value)),
        e.current === null ? null : substitute(e.current, name, value),
      );
    case "foldRun":
      return foldRun(
        substitute(e.fn, name, value),
        e.input.map((item) => substitute(item, name, value)),
        substitute(e.accumulator, name, value),
        e.index,
        e.current === null ? null : substitute(e.current, name, value),
      );
    default: return assertNever(e);
  }
}
