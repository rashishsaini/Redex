import type { ReactNode } from "react";

interface ControlsProps {
  canPrevious: boolean;
  canNext: boolean;
  canRunAll: boolean;
  canReset: boolean;
  autoRunning: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRunAll: () => void;
  onReset: () => void;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Controls({
  canPrevious,
  canNext,
  canRunAll,
  canReset,
  autoRunning,
  onPrevious,
  onNext,
  onRunAll,
  onReset,
}: ControlsProps) {
  return (
    <div className="btn-group" role="group" aria-label="Execution controls">
      <button type="button" className="btn" onClick={onPrevious} disabled={!canPrevious}>
        <Icon>
          <path d="M10 3 5 8l5 5" />
        </Icon>
        Previous Step
      </button>

      <button
        type="button"
        className="btn btn-primary"
        onClick={onNext}
        disabled={!canNext}
      >
        Next Step
        <Icon>
          <path d="m6 3 5 5-5 5" />
        </Icon>
      </button>

      <button
        type="button"
        className={`btn btn-outline${autoRunning ? " is-on" : ""}`}
        onClick={onRunAll}
        disabled={!canRunAll}
        aria-label={autoRunning ? "Pause automatic execution" : undefined}
      >
        {autoRunning ? (
          <>
            <Icon>
              <path d="M5.5 3.5v9M10.5 3.5v9" />
            </Icon>
            Pause
          </>
        ) : (
          <>
            <Icon>
              <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none" />
            </Icon>
            Run All
          </>
        )}
      </button>

      <button type="button" className="btn btn-ghost" onClick={onReset} disabled={!canReset}>
        <Icon>
          <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" />
          <path d="M2.5 2.8v3h3" />
        </Icon>
        Reset
      </button>
    </div>
  );
}
