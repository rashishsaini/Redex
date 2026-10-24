import type { ExecutionView } from "../engine/engineAdapter";
import { CodeText } from "./CodeText";

export function ExpressionPanel({ view }: { view: ExecutionView }) {
  return (
    <section className="panel expression-panel" aria-labelledby="expression-title">
      <div className="panel-head">
        <h2 className="panel-title" id="expression-title">
          Current expression
        </h2>
      </div>

      <div className="panel-body">
        {view.error ? (
          <div className="error-block" role="alert">
            <p className="error-title">Couldn’t run this program</p>
            <pre className="error-message">{view.error}</pre>
            <p className="error-hint">Fix the source, then press Parse / Run.</p>
          </div>
        ) : view.currentExpression ? (
          <code
            key={`${view.stepNumber}:${view.currentExpression}`}
            className="expression fade-in"
          >
            <CodeText text={view.currentExpression} />
          </code>
        ) : (
          <p className="placeholder">Nothing to evaluate yet.</p>
        )}
      </div>
    </section>
  );
}
