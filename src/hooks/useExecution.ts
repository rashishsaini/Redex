import { useCallback, useEffect, useState } from "react";
import { createExecution } from "../engine/engineAdapter";
import type { ExecutionSession, ExecutionView } from "../engine/engineAdapter";

/** Pause between steps while "Run All" advances, so each state is visible. */
export const AUTO_STEP_DELAY_MS = 850;

interface ExecutionState {
  /** The source text this session was created from. */
  source: string;
  /** `null` when the engine threw instead of returning a session. */
  session: ExecutionSession | null;
  view: ExecutionView;
}

function describeError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * A contract-shaped view used only to *display* an exception thrown by the
 * engine. It carries no evaluation logic.
 */
function failureView(source: string, message: string): ExecutionView {
  return {
    source,
    currentExpression: "",
    explanation: "",
    status: "error",
    stepNumber: 0,
    inputItems: [],
    outputItems: [],
    activeIndex: null,
    visualizationMode: null,
    accumulator: null,
    result: null,
    error: message,
  };
}

function begin(source: string): ExecutionState {
  try {
    const session = createExecution(source);
    return { source, session, view: session.current() };
  } catch (err) {
    return { source, session: null, view: failureView(source, describeError(err)) };
  }
}

/**
 * Owns the execution session and the "Run All" timer.
 * Every value the UI renders comes from the session's `ExecutionView`.
 */
export function useExecution(initialSource: string) {
  const [state, setState] = useState<ExecutionState>(() => begin(initialSource));
  const [autoRunning, setAutoRunning] = useState(false);

  const { session, view } = state;
  const hasSession = session !== null;
  const canAdvance = view.status === "ready" || view.status === "running";
  // A runtime error is a recorded execution state, so Previous/Reset should be
  // available to recover from it. Initial parse errors have no prior state.
  const reversibleError = view.status === "error" && view.explanation.startsWith("Evaluation stopped.");
  const inProgress = view.status === "running" || view.status === "complete" || reversibleError;

  /** Run one session method and show its result; never lets an exception escape. */
  const step = useCallback(
    (action: (s: ExecutionSession) => ExecutionView) => {
      if (!session) return;
      try {
        const nextView = action(session);
        setState((prev) => ({ ...prev, view: nextView }));
        if (nextView.status === "complete" || nextView.status === "error") {
          setAutoRunning(false);
        }
      } catch (err) {
        setAutoRunning(false);
        setState((prev) => ({
          ...prev,
          session: null,
          view: failureView(prev.source, describeError(err)),
        }));
      }
    },
    [session]
  );

  /** Parse / Run: always starts a brand-new session. */
  const run = useCallback((source: string) => {
    setAutoRunning(false);
    setState(begin(source));
  }, []);

  const next = useCallback(() => step((s) => s.next()), [step]);

  const previous = useCallback(() => {
    setAutoRunning(false);
    step((s) => s.previous());
  }, [step]);

  const reset = useCallback(() => {
    setAutoRunning(false);
    step((s) => s.reset());
  }, [step]);

  /** Run All / Pause. Starting takes one step immediately, then the timer continues. */
  const toggleAutoRun = useCallback(() => {
    if (autoRunning) {
      setAutoRunning(false);
      return;
    }
    setAutoRunning(true);
    step((s) => s.next());
  }, [autoRunning, step]);

  // One timer per pending step. Re-created after every view change and cleared
  // on pause, reset, new execution and unmount.
  useEffect(() => {
    if (!autoRunning) return;
    const timer = window.setTimeout(() => step((s) => s.next()), AUTO_STEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoRunning, state, step]);

  return {
    source: state.source,
    view,
    isAutoRunning: autoRunning && canAdvance,
    canNext: hasSession && canAdvance && !autoRunning,
    canPrevious: hasSession && inProgress && !autoRunning,
    canRunAll: hasSession && canAdvance,
    canReset: hasSession && inProgress,
    run,
    next,
    previous,
    reset,
    toggleAutoRun,
  };
}
