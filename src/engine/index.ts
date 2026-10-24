/**
 * index.ts — public entry point of the PureStep interpreter engine.
 *
 *   import { createExecution } from "./engine";
 *   const session = createExecution("map (\\x -> x * 2) [1, 2, 3, 4]");
 *   session.next();      // one reduction
 *   session.previous();  // exact prior view
 *   session.reset();     // back to the initial view
 *
 * The session keeps a deterministic history of immutable snapshots. `next()`
 * past the end of the history performs a real reduction and appends a
 * snapshot; `previous()` / `next()` inside the history just move a cursor,
 * so stepping back and forward always yields identical views. Every view
 * handed out is a fresh copy, so the UI may keep or mutate it freely.
 */

import type { ElementStatus, EngineStatus, ExecutionSession, ExecutionView } from "./contract";
import type { Expr } from "./ast";
import { PureStepError, runtimeError } from "./ast";
import { parse } from "./parser";
import { printExpr, printFocus } from "./prettyPrint";
import type { ListTrace } from "./reducer";
import { assertClosed, deriveListTrace, isValue, step } from "./reducer";

export type { EngineStatus, ElementStatus, ExecutionView, ExecutionSession, VisualizationMode } from "./contract";

/** Safety net against non-terminating programs such as (\x -> x x) (\x -> x x). */
const MAX_STEPS = 5000;

interface Snapshot {
  /** The expression at this point; null only when the program failed to parse. */
  readonly expr: Expr | null;
  readonly trace: ListTrace | null;
  /** Private canonical copy; never handed out directly. */
  readonly view: ExecutionView;
}

interface ViewParts {
  readonly source: string;
  readonly currentExpression: string;
  readonly explanation: string;
  readonly status: EngineStatus;
  readonly stepNumber: number;
  readonly trace: ListTrace | null;
  readonly result: string | null;
  readonly error: string | null;
}

function makeView(parts: ViewParts): ExecutionView {
  const { trace } = parts;
  const inputItems: ExecutionView["inputItems"] =
    trace === null
      ? []
      : trace.input.map((value, i) => {
          const status: ElementStatus =
            i < trace.committed ? "done" : i === trace.activeIndex ? "active" : "pending";
          return { value, status };
        });
  return {
    source: parts.source,
    currentExpression: parts.currentExpression,
    explanation: parts.explanation,
    status: parts.status,
    stepNumber: parts.stepNumber,
    inputItems,
    outputItems: trace === null || trace.mode === "foldl" ? [] : [...trace.output],
    activeIndex: trace === null ? null : trace.activeIndex,
    visualizationMode: trace?.mode ?? null,
    accumulator: trace?.mode === "foldl" ? trace.accumulator : null,
    result: parts.result,
    error: parts.error,
  };
}

function cloneView(view: ExecutionView): ExecutionView {
  return {
    ...view,
    inputItems: view.inputItems.map((item) => ({ ...item })),
    outputItems: [...view.outputItems],
  };
}

function describeError(err: unknown): string {
  if (err instanceof PureStepError) return err.message;
  if (err instanceof RangeError) return "This program is nested too deeply for PureStep to process.";
  return `Internal error: ${err instanceof Error ? err.message : String(err)}`;
}

function createInitialSnapshot(source: string): Snapshot {
  try {
    const expr = parse(source);
    assertClosed(expr);
    const trace = deriveListTrace(expr, null);
    return {
      expr,
      trace,
      view: makeView({
        source,
        currentExpression: printFocus(expr),
        explanation: "The program parsed successfully. Press Next to evaluate it one reduction at a time.",
        status: "ready",
        stepNumber: 0,
        trace,
        result: null,
        error: null,
      }),
    };
  } catch (err) {
    const message = describeError(err);
    return {
      expr: null,
      trace: null,
      view: makeView({
        source,
        currentExpression: source,
        explanation: "The program could not be run because it contains an error. Fix it and start again.",
        status: "error",
        stepNumber: 0,
        trace: null,
        result: null,
        error: message,
      }),
    };
  }
}

/** Performs one reduction on a ready/running snapshot and returns the next snapshot. */
function advance(prev: Snapshot): Snapshot {
  const expr = prev.expr;
  if (expr === null) return prev;
  const stepNumber = prev.view.stepNumber + 1;

  try {
    if (prev.view.stepNumber >= MAX_STEPS) {
      throw runtimeError(
        `Stopped after ${MAX_STEPS} steps. This program may never finish (for example, a function that keeps calling itself).`
      );
    }

    const result = step(expr);

    // The whole program was already a value: nothing to reduce.
    if (result === null) {
      const text = printExpr(expr);
      return {
        expr,
        trace: prev.trace,
        view: makeView({
          source: prev.view.source,
          currentExpression: text,
          explanation: `The program is already a value, so there is nothing left to reduce. Result: ${text}.`,
          status: "complete",
          stepNumber,
          trace: prev.trace,
          result: text,
          error: null,
        }),
      };
    }

    const trace = result.trace !== undefined ? result.trace : deriveListTrace(result.expr, prev.trace);
    const complete = isValue(result.expr);
    const text = printExpr(result.expr);
    return {
      expr: result.expr,
      trace,
      view: makeView({
        source: prev.view.source,
        currentExpression: complete ? text : printFocus(result.expr),
        explanation: complete
          ? `${result.explanation} Evaluation is complete: the result is ${text}.`
          : result.explanation,
        status: complete ? "complete" : "running",
        stepNumber,
        trace,
        result: complete ? text : null,
        error: null,
      }),
    };
  } catch (err) {
    // Keep the expression that got stuck; the failed attempt is not counted as a step.
    const message = describeError(err);
    return {
      expr,
      trace: prev.trace,
      view: {
        ...cloneView(prev.view),
        explanation: `Evaluation stopped. ${message}`,
        status: "error",
        result: null,
        error: message,
      },
    };
  }
}

export function createExecution(source: string): ExecutionSession {
  const text = typeof source === "string" ? source : "";
  const initial = createInitialSnapshot(text);
  let history: Snapshot[] = [initial];
  let cursor = 0;

  const snapshotAt = (index: number): Snapshot => {
    const snapshot = history[index];
    if (snapshot === undefined) throw new Error("PureStep internal error: history index out of range");
    return snapshot;
  };

  const viewNow = (): ExecutionView => cloneView(snapshotAt(cursor).view);

  return {
    current(): ExecutionView {
      return viewNow();
    },

    next(): ExecutionView {
      if (cursor < history.length - 1) {
        cursor += 1; // replay a step that was already computed
      } else {
        const last = snapshotAt(cursor);
        if (last.view.status === "ready" || last.view.status === "running") {
          history.push(advance(last));
          cursor = history.length - 1;
        }
      }
      return viewNow();
    },

    previous(): ExecutionView {
      if (cursor > 0) cursor -= 1;
      return viewNow();
    },

    reset(): ExecutionView {
      history = [initial];
      cursor = 0;
      return viewNow();
    },
  };
}
