import type { ExecutionView } from "../engine/engineAdapter";

/**
 * Progress (0..1) derived purely from the public `ExecutionView`.
 *
 * The contract has no "total steps" field, so progress counts how many input
 * elements are finished plus how many output slots are filled. It starts at 0,
 * only grows as the engine reports more work done, and is 1 once complete.
 */
export function progressOf(view: ExecutionView): number {
  if (view.status === "complete") return 1;

  const total = view.inputItems.length + view.outputItems.length;
  if (total === 0) return 0;

  const finished =
    view.inputItems.filter((item) => item.status === "done").length +
    view.outputItems.filter((value) => value !== null).length;

  return Math.min(1, finished / total);
}
