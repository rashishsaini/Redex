/** Source-like printer for parsed and in-flight expressions. */
import type { Expr, FoldRun, MapRun } from "./ast";
import { assertNever } from "./ast";

const PREC_LOWEST = 0;
const PREC_SUM = 1;
const PREC_PRODUCT = 2;
const PREC_UNARY = 3;
const PREC_APP = 4;
const PREC_ATOM = 5;

function precedence(e: Expr): number {
  switch (e.tag) {
    case "let": case "lam": return PREC_LOWEST;
    case "binop": return e.op === "*" ? PREC_PRODUCT : PREC_SUM;
    case "unary": return PREC_UNARY;
    case "app": case "mapRun": case "foldRun": return PREC_APP;
    case "int": case "var": case "list": return PREC_ATOM;
    default: return assertNever(e);
  }
}

function printAt(e: Expr, minPrecedence: number): string {
  const text = printNode(e);
  return precedence(e) < minPrecedence ? `(${text})` : text;
}

function printLambda(e: Expr): string {
  const params: string[] = [];
  let body: Expr = e;
  while (body.tag === "lam") { params.push(body.param); body = body.body; }
  return `\\${params.join(" ")} -> ${printAt(body, PREC_LOWEST)}`;
}

function printMapRun(e: MapRun): string {
  const remaining = e.input.slice(e.done.length);
  return `map ${printAt(e.fn, PREC_ATOM)} [${remaining.map((item) => printAt(item, PREC_LOWEST)).join(", ")}]`;
}
function printFoldRun(e: FoldRun): string {
  const remaining = e.input.slice(e.index);
  return `foldl ${printAt(e.fn, PREC_ATOM)} ${printAt(e.accumulator, PREC_ATOM)} [${remaining.map((item) => printAt(item, PREC_LOWEST)).join(", ")}]`;
}

function printNode(e: Expr): string {
  switch (e.tag) {
    case "int": return String(e.value);
    case "var": return e.name;
    case "lam": return printLambda(e);
    case "app": return `${printAt(e.fn, PREC_APP)} ${printAt(e.arg, PREC_ATOM)}`;
    case "binop": {
      const leftPrec = precedence(e);
      // All binary operators are left associative; a right-nested equal-precedence expression needs parentheses.
      const rightMin = e.op === "*" ? PREC_UNARY : PREC_PRODUCT;
      return `${printAt(e.left, leftPrec)} ${e.op} ${printAt(e.right, rightMin)}`;
    }
    case "unary": return `-${printAt(e.expr, PREC_UNARY)}`;
    case "list": return `[${e.items.map((item) => printAt(item, PREC_LOWEST)).join(", ")}]`;
    case "let": return `let ${e.name} = ${printAt(e.value, PREC_LOWEST)} in ${printAt(e.body, PREC_LOWEST)}`;
    case "mapRun": return printMapRun(e);
    case "foldRun": return printFoldRun(e);
    default: return assertNever(e);
  }
}

export function printExpr(e: Expr): string { return printAt(e, PREC_LOWEST); }
export function printAtom(e: Expr): string { return printAt(e, PREC_ATOM); }

/** Prefer the expression currently reduced inside map/foldl, otherwise print the full program. */
export function printFocus(e: Expr): string {
  const active = findActiveRun(e);
  if (active === null || active.current === null) return printExpr(e);
  return printFocus(active.current);
}

function findActiveRun(e: Expr): MapRun | FoldRun | null {
  switch (e.tag) {
    case "mapRun":
      return e.current === null ? e : findActiveRun(e.current) ?? e;
    case "foldRun":
      return e.current === null ? e : findActiveRun(e.current) ?? e;
    case "app": return findActiveRun(e.fn) ?? findActiveRun(e.arg);
    case "binop": return findActiveRun(e.left) ?? findActiveRun(e.right);
    case "unary": return findActiveRun(e.expr);
    case "list":
      for (const item of e.items) { const found = findActiveRun(item); if (found !== null) return found; }
      return null;
    case "let": return findActiveRun(e.value) ?? findActiveRun(e.body);
    case "int": case "var": case "lam": return null;
    default: return assertNever(e);
  }
}
