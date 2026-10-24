import type { KeyboardEvent } from "react";

interface SourceEditorProps {
  value: string;
  /** True when the text differs from the source of the running session. */
  dirty: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
}

export function SourceEditor({ value, dirty, onChange, onRun }: SourceEditorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun();
    }
  };

  return (
    <section className="panel editor" aria-labelledby="source-title">
      <div className="panel-head">
        <div className="panel-head-left">
          <h2 className="panel-title" id="source-title">
            Source
          </h2>
          <span className="file-chip">main.hs</span>
          {dirty && <span className="dirty-chip">edited</span>}
        </div>
        <div className="panel-head-right">
          <span className="hint">Ctrl / ⌘ + Enter</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRun}>
            Parse / Run
          </button>
        </div>
      </div>

      <textarea
        className="editor-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Program source code"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        placeholder="Enter a program, e.g. map (\x -> x * 2) [1, 2, 3, 4]"
      />

      <p className={`panel-foot${dirty ? " is-dirty" : ""}`}>
        {dirty
          ? "Source edited — press Parse / Run to start a new execution."
          : "Edit the program, then press Parse / Run to start a new execution."}
      </p>
    </section>
  );
}
