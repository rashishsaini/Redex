/** Public, renderer-facing contract shared by the execution engine and UI. */
export type EngineStatus = "ready" | "running" | "complete" | "error";
export type ElementStatus = "pending" | "active" | "done";
export type VisualizationMode = "map" | "foldl" | null;

export interface ExecutionView {
  source: string;
  currentExpression: string;
  explanation: string;
  status: EngineStatus;
  stepNumber: number;
  inputItems: Array<{ value: number; status: ElementStatus }>;
  outputItems: Array<number | null>;
  activeIndex: number | null;
  /** The operation represented by the Input/Output stage, if any. */
  visualizationMode: VisualizationMode;
  /** Printed accumulator for foldl; null for map or when no trace is visible. */
  accumulator: string | null;
  result: string | null;
  error: string | null;
}

export interface ExecutionSession {
  current(): ExecutionView;
  next(): ExecutionView;
  previous(): ExecutionView;
  reset(): ExecutionView;
}

/** Implementation is exported by ./index.ts; import it from the engine entry point. */
export declare function createExecution(source: string): ExecutionSession;
