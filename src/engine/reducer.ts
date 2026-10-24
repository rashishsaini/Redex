/** Deterministic left-to-right, call-by-value small-step evaluator. */
import type { App, BinOp, Expr, FoldRun, ListLit, MapRun } from "./ast";
import {
  apply, assertNever, binary, foldRun, intLit, letBinding, listLit, mapRun, nameError,
  negate, runtimeError, spine, substitute,
} from "./ast";
import { printAtom, printExpr } from "./prettyPrint";

export interface StepResult { readonly expr: Expr; readonly explanation: string; readonly trace?: ListTrace | null }
export type VisualizationMode = "map" | "foldl";
export interface ListTrace {
  readonly mode: VisualizationMode;
  readonly input: readonly number[];
  readonly output: ReadonlyArray<number | null>;
  readonly committed: number;
  readonly activeIndex: number | null;
  readonly accumulator: string | null;
}

interface BuiltinSpec {
  readonly arity: number;
  readonly run: (args: readonly Expr[]) => StepResult;
}
const BUILTINS: ReadonlyMap<string, BuiltinSpec> = new Map([
  ["map", { arity: 2, run: runMap }],
  ["foldl", { arity: 3, run: runFoldl }],
]);
const BUILTIN_NAMES = new Set(BUILTINS.keys());
const KNOWN_BUT_UNSUPPORTED = new Set(["in", "let", "if", "then", "else", "fold", "foldr", "filter", "sum", "length", "zip", "head", "tail"]);

function undefinedVariableMessage(name: string): string {
  if (KNOWN_BUT_UNSUPPORTED.has(name)) return `'${name}' is a reserved or unsupported name in this PureStep program.`;
  return `Undefined variable '${name}'. A variable must be bound by let/a lambda parameter, or be the built-in map or foldl.`;
}

export function isValue(e: Expr): boolean {
  switch (e.tag) {
    case "int": case "lam": return true;
    case "var": return BUILTINS.has(e.name);
    case "list": return e.items.every(isValue);
    case "app": {
      const { head, args } = spine(e);
      if (head.tag !== "var") return false;
      const spec = BUILTINS.get(head.name);
      return spec !== undefined && args.length < spec.arity && args.every(isValue);
    }
    case "binop": case "unary": case "let": case "mapRun": case "foldRun": return false;
    default: return assertNever(e);
  }
}

function isFunctionValue(e: Expr): boolean {
  if (e.tag === "lam") return true;
  const { head } = spine(e);
  return isValue(e) && head.tag === "var" && BUILTINS.has(head.name);
}
function describe(e: Expr): string {
  if (e.tag === "int") return `the integer ${e.value}`;
  if (e.tag === "list") return `the list ${printExpr(e)}`;
  if (e.tag === "lam") return `the function ${printAtom(e)}`;
  if (isFunctionValue(e)) return `the built-in function ${printExpr(e)}`;
  return `the expression ${printExpr(e)}`;
}
function internalError(what: string): Error { return runtimeError(`Internal error: ${what}`); }

export function findUnboundVariable(e: Expr, bound: ReadonlySet<string> = new Set()): string | null {
  switch (e.tag) {
    case "int": return null;
    case "var": return bound.has(e.name) || BUILTIN_NAMES.has(e.name) ? null : e.name;
    case "lam": { const inner = new Set(bound); inner.add(e.param); return findUnboundVariable(e.body, inner); }
    case "app": return findUnboundVariable(e.fn, bound) ?? findUnboundVariable(e.arg, bound);
    case "binop": return findUnboundVariable(e.left, bound) ?? findUnboundVariable(e.right, bound);
    case "unary": return findUnboundVariable(e.expr, bound);
    case "list":
      for (const item of e.items) { const found = findUnboundVariable(item, bound); if (found !== null) return found; }
      return null;
    case "let": {
      const fromValue = findUnboundVariable(e.value, bound);
      if (fromValue !== null) return fromValue;
      const inner = new Set(bound); inner.add(e.name); return findUnboundVariable(e.body, inner);
    }
    case "mapRun": case "foldRun": return null; // internal execution states only
    default: return assertNever(e);
  }
}
export function assertClosed(e: Expr): void {
  const name = findUnboundVariable(e);
  if (name !== null) throw nameError(undefinedVariableMessage(name));
}

/** One meaningful semantic reduction, or null if the expression is a value. */
export function step(e: Expr): StepResult | null {
  if (isValue(e)) return null;
  switch (e.tag) {
    case "int": case "lam": return null;
    case "var": throw nameError(undefinedVariableMessage(e.name));
    case "list": return stepList(e);
    case "binop": return stepBinOp(e);
    case "unary": return stepUnary(e);
    case "let": return stepLet(e);
    case "app": return stepApp(e);
    case "mapRun": return stepMapRun(e);
    case "foldRun": return stepFoldRun(e);
    default: return assertNever(e);
  }
}
function mustStep(e: Expr): StepResult {
  const result = step(e);
  if (result === null) throw internalError("expected a reducible expression");
  return result;
}
function stepList(e: ListLit): StepResult {
  const index = e.items.findIndex((item) => !isValue(item));
  const item = e.items[index];
  if (item === undefined) throw internalError("list has no reducible element");
  const inner = mustStep(item); const items = e.items.slice(); items[index] = inner.expr;
  return { expr: listLit(items), explanation: `List element ${index + 1}: ${inner.explanation}` };
}
function stepBinOp(e: BinOp): StepResult {
  if (!isValue(e.left)) {
    const inner = mustStep(e.left);
    return { expr: binary(e.op, inner.expr, e.right), explanation: `Left operand of ${e.op}: ${inner.explanation}`, trace: inner.trace };
  }
  if (!isValue(e.right)) {
    const inner = mustStep(e.right);
    return { expr: binary(e.op, e.left, inner.expr), explanation: `Right operand of ${e.op}: ${inner.explanation}`, trace: inner.trace };
  }
  if (e.left.tag !== "int" || e.right.tag !== "int") {
    throw runtimeError(`Operator '${e.op}' expects integer operands, but received ${describe(e.left)} and ${describe(e.right)}.`);
  }
  const a = e.left.value; const b = e.right.value;
  const value = e.op === "+" ? a + b : e.op === "-" ? a - b : a * b;
  if (!Number.isSafeInteger(value)) throw runtimeError(`Integer overflow: ${a} ${e.op} ${b} is outside the safe integer range.`);
  const label = e.op === "+" ? "Addition" : e.op === "-" ? "Subtraction" : "Multiplication";
  return { expr: intLit(value), explanation: `${label}: ${a} ${e.op} ${b} = ${value}.` };
}
function stepUnary(e: Extract<Expr, { tag: "unary" }>): StepResult {
  if (!isValue(e.expr)) {
    const inner = mustStep(e.expr);
    return { expr: negate(inner.expr), explanation: `Unary minus: ${inner.explanation}`, trace: inner.trace };
  }
  if (e.expr.tag !== "int") throw runtimeError(`Unary '-' expects an integer, but received ${describe(e.expr)}.`);
  return { expr: intLit(-e.expr.value), explanation: `Unary minus: -(${e.expr.value}) = ${-e.expr.value}.` };
}
function stepLet(e: Extract<Expr, { tag: "let" }>): StepResult {
  if (!isValue(e.value)) {
    const inner = mustStep(e.value);
    return {
      expr: letBinding(e.name, inner.expr, e.body),
      explanation: `Evaluate the value bound to '${e.name}' first: ${inner.explanation}`,
      trace: inner.trace,
    };
  }
  const body = substitute(e.body, e.name, e.value);
  return {
    expr: body,
    explanation: `Let substitution: bind ${e.name} = ${printAtom(e.value)} and replace its free occurrences in ${printExpr(e.body)} with ${printAtom(e.value)}.`,
  };
}
function stepApp(e: App): StepResult {
  if (!isValue(e.fn)) {
    const inner = mustStep(e.fn);
    return { expr: apply(inner.expr, e.arg), explanation: `Evaluate the function part first: ${inner.explanation}`, trace: inner.trace };
  }
  if (!isValue(e.arg)) {
    const inner = mustStep(e.arg);
    return { expr: apply(e.fn, inner.expr), explanation: `Evaluate the argument before the call: ${inner.explanation}`, trace: inner.trace };
  }
  return callFunction(e.fn, e.arg);
}
function callFunction(fn: Expr, arg: Expr): StepResult {
  if (fn.tag === "lam") {
    const body = substitute(fn.body, fn.param, arg);
    return {
      expr: body,
      explanation: `Function application: call ${printAtom(fn)} with ${printAtom(arg)}; substitute ${fn.param} = ${printAtom(arg)} in the function body to obtain ${printExpr(body)}.`,
    };
  }
  const { head, args } = spine(fn);
  if (head.tag === "var") {
    const spec = BUILTINS.get(head.name);
    if (spec !== undefined) {
      const all = [...args, arg];
      if (all.length === spec.arity) return spec.run(all);
    }
  }
  throw runtimeError(`Cannot apply ${describe(fn)} to ${printAtom(arg)}: only functions can be applied.`);
}

/* ------------------------------ map ----------------------------------- */
function runMap(args: readonly Expr[]): StepResult {
  const [fn, xs] = args;
  if (fn === undefined || xs === undefined) throw internalError("map needs two arguments");
  if (!isFunctionValue(fn)) throw runtimeError(`map expects a function as its first argument, but received ${describe(fn)}.`);
  if (xs.tag !== "list") throw runtimeError(`map expects a list as its second argument, but received ${describe(xs)}.`);
  const first = xs.items[0];
  if (first === undefined) return { expr: listLit([]), explanation: "map over an empty list returns [] without applying the function." };
  return {
    expr: mapRun(fn, xs.items, [], apply(fn, first)),
    explanation: `map starts its left-to-right traversal. Apply the function to element 1 of ${xs.items.length} (value ${printExpr(first)}).`,
  };
}
function stepMapRun(m: MapRun): StepResult {
  const count = m.input.length; const index = m.done.length;
  if (m.current === null) {
    const next = m.input[index];
    if (next === undefined) throw internalError("map has no element left to process");
    return {
      expr: mapRun(m.fn, m.input, m.done, apply(m.fn, next)),
      explanation: `Map progress: begin element ${index + 1} of ${count} (value ${printExpr(next)}).`,
    };
  }
  if (!isValue(m.current)) {
    const inner = mustStep(m.current);
    return { expr: mapRun(m.fn, m.input, m.done, inner.expr), explanation: `Map element ${index + 1} of ${count}: ${inner.explanation}`, trace: inner.trace };
  }
  const done = [...m.done, m.current];
  if (done.length === count) {
    const result = listLit(done);
    return { expr: result, explanation: `Map element ${count} of ${count} committed as ${printExpr(m.current)}. The map result is ${printExpr(result)}.` };
  }
  return {
    expr: mapRun(m.fn, m.input, done, null),
    explanation: `Map element ${index + 1} committed as ${printExpr(m.current)}. Output so far: ${printExpr(listLit(done))}.`,
  };
}

/* ----------------------------- foldl ---------------------------------- */
function runFoldl(args: readonly Expr[]): StepResult {
  const [fn, initial, xs] = args;
  if (fn === undefined || initial === undefined || xs === undefined) throw internalError("foldl needs three arguments");
  if (!isFunctionValue(fn)) throw runtimeError(`foldl expects a function as its first argument, but received ${describe(fn)}.`);
  if (xs.tag !== "list") throw runtimeError(`foldl expects a list as its third argument, but received ${describe(xs)}.`);
  const first = xs.items[0];
  if (first === undefined) return { expr: initial, explanation: `foldl over an empty list returns its initial accumulator ${printExpr(initial)}.` };
  return {
    expr: foldRun(fn, xs.items, initial, 0, apply(apply(fn, initial), first)),
    explanation: `foldl starts with accumulator ${printExpr(initial)} and input element 1 of ${xs.items.length} (value ${printExpr(first)}). Apply the combining function to the accumulator and element.`,
  };
}
function completedFoldTrace(run: FoldRun, accumulator: Expr): ListTrace | null {
  const input = intsOf(run.input);
  if (input === null) return null;
  return {
    mode: "foldl",
    input,
    output: [],
    committed: input.length,
    activeIndex: null,
    accumulator: printExpr(accumulator),
  };
}

function stepFoldRun(f: FoldRun): StepResult {
  const count = f.input.length;
  if (f.current === null) {
    const element = f.input[f.index];
    if (element === undefined) throw internalError("foldl has no element left to process");
    return {
      expr: foldRun(f.fn, f.input, f.accumulator, f.index, apply(apply(f.fn, f.accumulator), element)),
      explanation: `Foldl progress: combine accumulator ${printExpr(f.accumulator)} with element ${f.index + 1} of ${count} (${printExpr(element)}).`,
    };
  }
  if (!isValue(f.current)) {
    const inner = mustStep(f.current);
    return { expr: foldRun(f.fn, f.input, f.accumulator, f.index, inner.expr), explanation: `Foldl element ${f.index + 1} of ${count}: ${inner.explanation}`, trace: inner.trace };
  }
  const nextIndex = f.index + 1;
  if (nextIndex >= count) {
    return {
      expr: f.current,
      explanation: `Foldl commit: the combining function returns ${printExpr(f.current)}, which becomes the final accumulator. foldl is complete.`,
      trace: completedFoldTrace(f, f.current),
    };
  }
  return {
    expr: foldRun(f.fn, f.input, f.current, nextIndex, null),
    explanation: `Foldl commit: accumulator becomes ${printExpr(f.current)} after element ${f.index + 1}. Next, process element ${nextIndex + 1} of ${count}.`,
  };
}

/* ------------------------- visual trace -------------------------------- */
export function deriveListTrace(expr: Expr, previous: ListTrace | null): ListTrace | null {
  const active = findRuntimeRun(expr);
  if (active?.tag === "mapRun") return traceOfMap(active);
  if (active?.tag === "foldRun") return traceOfFold(active);

  const pending = findNextVisualCall(expr);
  if (pending?.mode === "map") {
    const input = intsOf(pending.input.items);
    if (input !== null) return { mode: "map", input, output: input.map(() => null), committed: 0, activeIndex: null, accumulator: null };
  }
  if (pending?.mode === "foldl") {
    const input = intsOf(pending.input.items);
    if (input !== null) return {
      mode: "foldl", input, output: [], committed: 0, activeIndex: null,
      accumulator: printExpr(pending.accumulator),
    };
  }

  if (previous?.mode === "map" && expr.tag === "list") {
    const output = intsOf(expr.items);
    if (output !== null && output.length === previous.input.length) {
      return { ...previous, output, committed: output.length, activeIndex: null };
    }
  }
  if (previous?.mode === "foldl" && previous.activeIndex !== null && isValue(expr)) {
    return { ...previous, output: [], committed: previous.input.length, activeIndex: null, accumulator: printExpr(expr) };
  }
  return previous;
}

function traceOfMap(run: MapRun): ListTrace | null {
  const input = intsOf(run.input); const done = intsOf(run.done);
  if (input === null || done === null) return null;
  return {
    mode: "map", input, output: input.map((_, index) => done[index] ?? null),
    committed: done.length, activeIndex: run.current === null ? null : done.length, accumulator: null,
  };
}
function traceOfFold(run: FoldRun): ListTrace | null {
  const input = intsOf(run.input);
  if (input === null) return null;
  return {
    mode: "foldl", input, output: [], committed: run.index,
    activeIndex: run.current === null ? null : run.index,
    accumulator: printExpr(run.accumulator),
  };
}
function intsOf(items: readonly Expr[]): number[] | null {
  const out: number[] = [];
  for (const item of items) { if (item.tag !== "int") return null; out.push(item.value); }
  return out;
}

function findRuntimeRun(e: Expr): MapRun | FoldRun | null {
  switch (e.tag) {
    case "mapRun": return findRuntimeRun(e.current ?? e.fn) ?? e;
    case "foldRun": return findRuntimeRun(e.current ?? e.accumulator) ?? e;
    case "app": return findRuntimeRun(e.fn) ?? findRuntimeRun(e.arg);
    case "binop": return findRuntimeRun(e.left) ?? findRuntimeRun(e.right);
    case "unary": return findRuntimeRun(e.expr);
    case "list":
      for (const item of e.items) { const found = findRuntimeRun(item); if (found !== null) return found; }
      return null;
    case "let": return findRuntimeRun(e.value) ?? findRuntimeRun(e.body);
    case "int": case "var": case "lam": return null;
    default: return assertNever(e);
  }
}

interface PendingVisualCall {
  readonly mode: VisualizationMode;
  readonly input: ListLit;
  readonly accumulator: Expr;
}
/** Follow the evaluator's strict evaluation path; never peek inside a lambda body. */
function findNextVisualCall(e: Expr): PendingVisualCall | null {
  if (e.tag === "mapRun" || e.tag === "foldRun") return null;
  switch (e.tag) {
    case "app": {
      if (!isValue(e.fn)) return findNextVisualCall(e.fn);
      if (!isValue(e.arg)) return findNextVisualCall(e.arg);
      const { head, args } = spine(e);
      if (head.tag === "var" && head.name === "map" && args.length === 2) {
        const input = args[1]; return input?.tag === "list" ? { mode: "map", input, accumulator: intLit(0) } : null;
      }
      if (head.tag === "var" && head.name === "foldl" && args.length === 3) {
        const initial = args[1]; const input = args[2];
        return initial !== undefined && input?.tag === "list" ? { mode: "foldl", input, accumulator: initial } : null;
      }
      return null;
    }
    case "binop":
      if (!isValue(e.left)) return findNextVisualCall(e.left);
      if (!isValue(e.right)) return findNextVisualCall(e.right);
      return null;
    case "unary": return isValue(e.expr) ? null : findNextVisualCall(e.expr);
    case "list":
      for (const item of e.items) { if (!isValue(item)) return findNextVisualCall(item); }
      return null;
    case "let": return isValue(e.value) ? null : findNextVisualCall(e.value);
    case "int": case "var": case "lam": return null;
    default: return assertNever(e);
  }
}
