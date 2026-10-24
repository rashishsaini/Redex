import { useState } from "react";
import { Controls } from "./components/Controls";
import { ExplanationPanel } from "./components/ExplanationPanel";
import { ExpressionPanel } from "./components/ExpressionPanel";
import { Header } from "./components/Header";
import { ListsStage } from "./components/ListsStage";
import { ProgressBar } from "./components/ProgressBar";
import { SourceEditor } from "./components/SourceEditor";
import { DEFAULT_SOURCE } from "./defaultProgram";
import { useExecution } from "./hooks/useExecution";
import { progressOf } from "./lib/progress";

export default function App() {
  const [draft, setDraft] = useState(DEFAULT_SOURCE);
  const execution = useExecution(DEFAULT_SOURCE);
  const { view } = execution;

  return (
    <div className="app">
      <Header status={view.status} autoRunning={execution.isAutoRunning} />

      <main className="workspace">
        <SourceEditor
          value={draft}
          dirty={draft !== execution.source}
          onChange={setDraft}
          onRun={() => execution.run(draft)}
        />

        <div className="evaluation">
          <ExpressionPanel view={view} />
          <ExplanationPanel view={view} />
        </div>

        <ListsStage view={view} />
      </main>

      <footer className="controls">
        <Controls
          canPrevious={execution.canPrevious}
          canNext={execution.canNext}
          canRunAll={execution.canRunAll}
          canReset={execution.canReset}
          autoRunning={execution.isAutoRunning}
          onPrevious={execution.previous}
          onNext={execution.next}
          onRunAll={execution.toggleAutoRun}
          onReset={execution.reset}
        />
        <ProgressBar
          stepNumber={view.stepNumber}
          progress={progressOf(view)}
          status={view.status}
        />
      </footer>
    </div>
  );
}
