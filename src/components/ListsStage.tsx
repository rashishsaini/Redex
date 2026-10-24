import type { ExecutionView } from "../engine/engineAdapter";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ListsStage({ view }: { view: ExecutionView }) {
  const { inputItems, outputItems, activeIndex } = view;
  const isFold = view.visualizationMode === "foldl";
  const computed = outputItems.filter((value) => value !== null).length;

  return (
    <section className="stage" aria-label="Input and output lists">
      <div className="lane">
        <div className="lane-head">
          <h2 className="panel-title" id="input-title">
            Input
          </h2>
          <span className="lane-meta">{plural(inputItems.length, "item")}</span>
        </div>

        {inputItems.length > 0 ? (
          <ul className="boxes" aria-labelledby="input-title">
            {inputItems.map((item, index) => (
              <li key={index} className={`box box-input is-${item.status}`}>
                <span className="box-index" aria-hidden="true">
                  {index}
                </span>
                <span className="box-value">{item.value}</span>
                <span className="sr-only">
                  {`Input at index ${index}, ${item.status}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lane-empty">No input list</p>
        )}
      </div>

      <div className="lane">
        <div className="lane-head">
          <h2 className="panel-title" id="output-title">
            {isFold ? "Accumulator" : "Output"}
          </h2>
          <span className="lane-meta">
            {isFold
              ? (view.accumulator !== null ? "current value" : "—")
              : outputItems.length > 0
                ? `${computed} / ${outputItems.length} computed`
                : "—"}
          </span>
        </div>

        {isFold && view.accumulator !== null ? (
          <ul className="boxes" aria-labelledby="output-title">
            <li className="box box-output is-filled">
              <span className="box-value">{view.accumulator}</span>
              <span className="sr-only">Current foldl accumulator: {view.accumulator}</span>
            </li>
          </ul>
        ) : outputItems.length > 0 ? (
          <ul className="boxes" aria-labelledby="output-title">
            {outputItems.map((value, index) => {
              const state =
                value !== null
                  ? index === activeIndex
                    ? "is-filled is-fresh"
                    : "is-filled"
                  : index === activeIndex
                    ? "is-empty is-target"
                    : "is-empty";
              return (
                <li key={index} className={`box box-output ${state}`}>
                  <span className="box-index" aria-hidden="true">
                    {index}
                  </span>
                  <span className="box-value">{value !== null ? value : "·"}</span>
                  <span className="sr-only">
                    {value !== null
                      ? `Output at index ${index}: ${value}`
                      : `Output at index ${index}: not computed yet`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="lane-empty">{isFold ? "Accumulator not available yet" : "No output yet"}</p>
        )}
      </div>
    </section>
  );
}
