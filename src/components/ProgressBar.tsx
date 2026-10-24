import type { EngineStatus } from "../engine/engineAdapter";

interface ProgressBarProps {
  stepNumber: number;
  /** 0..1 */
  progress: number;
  status: EngineStatus;
}

export function ProgressBar({ stepNumber, progress, status }: ProgressBarProps) {
  const percent = Math.round(progress * 100);

  return (
    <div className="progress" data-status={status}>
      <span className="step-count">
        Step <strong>{stepNumber}</strong>
      </span>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Execution progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-pct">{percent}%</span>
    </div>
  );
}
