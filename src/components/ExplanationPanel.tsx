import type { ExecutionView } from "../engine/engineAdapter";

export function ExplanationPanel({ view }: { view: ExecutionView }) {
  return (
    <section className="panel explanation-panel" aria-labelledby="explanation-title">
      <div className="panel-head">
        <h2 className="panel-title" id="explanation-title">
          Explanation
        </h2>
      </div>

      <div className="panel-body" aria-live="polite">
        {view.error ? (
          <p className="placeholder">
            Execution did not start, so there is nothing to explain yet.
          </p>
        ) : (
          <p key={view.stepNumber} className="explanation fade-in">
            {view.explanation || "—"}
          </p>
        )}

        {view.result !== null && (
          <div className="result">
            <span className="result-label">Result</span>
            <code className="result-value">{view.result}</code>
          </div>
        )}
      </div>
    </section>
  );
}
