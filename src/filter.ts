import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { completedRanges } from "./completed";
export const setCompletedFilter = StateEffect.define<boolean>();
interface FilterState { enabled: boolean; decorations: DecorationSet }
function decorations(state: EditorState, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;
  const selection = state.selection.main;
  return Decoration.set(completedRanges(state.doc.toString())
    // Keep the item currently being edited visible; never replace editor text.
    .filter(r => selection.to < r.from || selection.from >= r.to)
    .map(r => Decoration.replace({ block: true }).range(r.from, r.to)), true);
}
export const completedFilter = StateField.define<FilterState>({
  create: () => ({ enabled: false, decorations: Decoration.none }),
  update(value, transaction) {
    let enabled = value.enabled;
    for (const effect of transaction.effects) if (effect.is(setCompletedFilter)) enabled = effect.value;
    if (enabled === value.enabled && !transaction.docChanged && !transaction.selection) return value;
    return { enabled, decorations: decorations(transaction.state, enabled) };
  },
  provide: field => [
    EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).decorations),
  ],
});
