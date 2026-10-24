/** Lightweight executable regression tests for PureStep's parser and evaluator. */
import { createExecution } from "./index";
import type { ExecutionView } from "./contract";

let passed = 0;
const failures: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
  else passed += 1;
}
function same(actual: unknown, expected: unknown, message: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}
function run(source: string, maxSteps = 1000): { view: ExecutionView; history: ExecutionView[] } {
  const session = createExecution(source);
  const history = [session.current()];
  let view = history[0];
  if (view === undefined) throw new Error("Missing initial execution view");
  for (let i = 0; i < maxSteps && (view.status === "ready" || view.status === "running"); i += 1) {
    view = session.next(); history.push(view);
  }
  return { view, history };
}
function resultIs(source: string, expected: string, label: string): ExecutionView {
  const { view } = run(source);
  check(view.status === "complete", `${label}: expected complete, got ${view.status}${view.error ? ` (${view.error})` : ""}`);
  check(view.result === expected, `${label}: expected result ${expected}, got ${String(view.result)}`);
  return view;
}

// Acceptance examples.
resultIs("(2 + 3) * 4", "20", "Arithmetic precedence");
resultIs("let x = 5 in x * 2", "10", "Let binding");
const mapFinal = resultIs("map (\\x -> x * 2) [1, 2, 3, 4]", "[2, 4, 6, 8]", "Map acceptance");
resultIs("foldl (\\acc x -> acc + x) 0 [1, 2, 3]", "6", "Foldl acceptance");
const nestedSource = "let xs = [1, 2, 3] in foldl (\\acc x -> acc + x) 0 (map (\\x -> x * 2) xs)";
resultIs(nestedSource, "12", "Nested let/map/foldl acceptance");

// Map really advances one reduction at a time and only commits actual results.
const mapSession = createExecution("map (\\x -> x * 2) [1, 2, 3]");
let mapView = mapSession.current();
same(mapView.visualizationMode, "map", "Initial Map visualization mode");
same(mapView.outputItems, [null, null, null], "Map output begins empty");
const mapFirst = mapSession.next();
same(mapFirst.stepNumber, 1, "Next increments the step count by exactly one");
same(mapFirst.currentExpression, "(\\x -> x * 2) 1", "Map first step exposes the active function application");
mapSession.reset();
mapView = mapSession.current();
let priorFilled = 0;
let observedActive = false;
for (let i = 0; i < 100 && (mapView.status === "ready" || mapView.status === "running"); i += 1) {
  mapView = mapSession.next();
  const filled = mapView.outputItems.filter((item) => item !== null).length;
  check(filled >= priorFilled, "Map output count never decreases during forward execution");
  priorFilled = filled;
  if (mapView.activeIndex !== null && mapView.inputItems[mapView.activeIndex]?.status === "active") observedActive = true;
}
check(observedActive, "Map highlights an active input element");
same(mapView.outputItems, [2, 4, 6], "Map commits output values in order");

// Foldl shows and updates the accumulator as elements are consumed.
const foldSession = createExecution("foldl (\\acc x -> acc + x) 0 [1, 2, 3]");
let foldView = foldSession.current();
same(foldView.visualizationMode, "foldl", "Initial foldl visualization mode");
same(foldView.accumulator, "0", "Foldl exposes initial accumulator");
const observedAccumulators = new Set<string>();
let foldActive = false;
for (let i = 0; i < 100 && (foldView.status === "ready" || foldView.status === "running"); i += 1) {
  foldView = foldSession.next();
  if (foldView.accumulator !== null) observedAccumulators.add(foldView.accumulator);
  if (foldView.activeIndex !== null) foldActive = true;
}
check(observedAccumulators.has("1") && observedAccumulators.has("3"), "Foldl visibly updates the accumulator across commits");
check(foldActive, "Foldl highlights its active input element");
same(foldView.accumulator, "6", "Foldl final accumulator is visible");

// The nested acceptance must first visualize map, then visualize foldl.
const nestedSession = createExecution(nestedSource);
const modes = new Set<string>();
let nestedView = nestedSession.current();
for (let i = 0; i < 200 && (nestedView.status === "ready" || nestedView.status === "running"); i += 1) {
  if (nestedView.visualizationMode !== null) modes.add(nestedView.visualizationMode);
  nestedView = nestedSession.next();
}
if (nestedView.visualizationMode !== null) modes.add(nestedView.visualizationMode);
check(modes.has("map") && modes.has("foldl"), "Nested program switches visualization from map to foldl");

// Empty lists.
resultIs("map (\\x -> x * 2) []", "[]", "Empty map");
resultIs("foldl (\\acc x -> acc + x) 7 []", "7", "Empty foldl");

// Nested arithmetic, subtraction and unary negative integers.
resultIs("2 + 3 * 4 - 5", "9", "Operator precedence and subtraction");
resultIs("-3 * 2", "-6", "Unary negative integers");
resultIs("let x = 5 in (\\x -> x + 1) 3", "4", "Lexical shadowing");
resultIs("let f = \\x -> x + 1 in f (2 * 3)", "7", "Function let binding and nested argument");
resultIs("(foldl (\\acc x -> acc + x) 0 [1, 2, 3]) * 2", "12", "Foldl nested inside arithmetic");
const nestedFoldSession = createExecution("(foldl (\\acc x -> acc + x) 0 [1, 2, 3]) * 2");
let nestedFoldView = nestedFoldSession.current();
let preservedFoldAccumulator = false;
for (let i = 0; i < 100 && (nestedFoldView.status === "ready" || nestedFoldView.status === "running"); i += 1) {
  nestedFoldView = nestedFoldSession.next();
  if (nestedFoldView.currentExpression === "6 * 2") preservedFoldAccumulator = nestedFoldView.accumulator === "6";
}
check(preservedFoldAccumulator, "Foldl keeps its final accumulator when nested in a larger expression");

// History states are exact and reversible.
const historySession = createExecution("map (\\x -> x * 2) [1, 2, 3]");
const states: ExecutionView[] = [historySession.current()];
let h = states[0];
if (h === undefined) throw new Error("Missing history initial state");
for (let i = 0; i < 100 && (h.status === "ready" || h.status === "running"); i += 1) {
  h = historySession.next(); states.push(h);
}
for (let i = states.length - 2; i >= 0; i -= 1) {
  const actual = historySession.previous();
  const expected = states[i];
  check(JSON.stringify(actual) === JSON.stringify(expected), `Previous restores exact state ${i}`);
}
same(historySession.reset(), states[0], "Reset restores the initial state");
const replay = historySession.next();
same(replay, states[1], "Next after Previous replays the exact saved state");

// Friendly syntax and runtime errors.
check(createExecution("unknown + 1").current().status === "error", "Undefined variable is caught before execution");
check(createExecution("let x = 2 x").current().status === "error", "Malformed let expression is a syntax error");
const { view: typeError } = run("1 + [2]");
check(typeError.status === "error" && typeError.error?.includes("integer operands") === true, "Arithmetic type error is reported clearly");
const recoverableErrorSession = createExecution("1 + [2]");
const recoverableInitial = recoverableErrorSession.current();
const errorStep = recoverableErrorSession.next();
check(errorStep.status === "error", "Runtime error is preserved as a history state");
check(recoverableErrorSession.previous().status === "ready", "Previous can step back out of a runtime error");
check(recoverableErrorSession.next().status === "error", "Next replays the same runtime error state");
same(recoverableErrorSession.reset(), recoverableInitial, "Reset returns to the initial state after a runtime error");

// Step limit guards non-terminating lambda expressions.
const loop = createExecution("(\\x -> x x) (\\x -> x x)");
let loopView = loop.current();
for (let i = 0; i < 5002 && (loopView.status === "ready" || loopView.status === "running"); i += 1) loopView = loop.next();
check(loopView.status === "error" && loopView.error?.includes("5000 steps") === true, "Non-terminating evaluation hits the step limit");

if (failures.length > 0) {
  console.error(`PureStep self-check failed: ${failures.length} of ${passed + failures.length} checks.`);
  for (const failure of failures) console.error(`- ${failure}`);
  throw new Error("PureStep engine self-check failed.");
}
console.log(`PureStep self-check passed: ${passed} checks.`);
console.log(`Map: ${mapFinal.result}; nested let/map/foldl: ${run(nestedSource).view.result}.`);
