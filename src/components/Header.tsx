import type { EngineStatus } from "../engine/engineAdapter";

const STATUS_LABEL: Record<EngineStatus, string> = {
  ready: "Ready",
  running: "Running",
  complete: "Complete",
  error: "Error",
};

interface HeaderProps {
  status: EngineStatus;
  autoRunning: boolean;
}

export function Header({ status, autoRunning }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          λ
        </span>
        <h1>Redex</h1>
        <p>A visual functional programming interpreter</p>
      </div>

      <span
        className={`pill${autoRunning ? " is-auto" : ""}`}
        data-status={status}
        role="status"
      >
        <span className="pill-dot" aria-hidden="true" />
        {STATUS_LABEL[status]}
        {autoRunning ? " · auto" : ""}
      </span>
    </header>
  );
}
