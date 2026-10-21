import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { completedRanges } from "../src/completed";
import { completedFilter, setCompletedFilter } from "../src/filter";
const hidden = (text: string) => completedRanges(text).map(r => text.slice(r.from, r.to));
describe("display-only completed task filtering", () => {
  it("keeps headings and incomplete tasks while accepting uppercase and numbered checks", () => {
    expect(hidden("## Work\n- [x] Done\n- [ ] Pending\n1. [X] Also done")).toEqual(["- [x] Done\n", "1. [X] Also done"]);
  });
  it("ignores frontmatter and fenced examples", () => {
    expect(hidden("---\n- [x] YAML\n---\n```md\n- [x] example\n```\n~~~\n- [x] example\n~~~\n- [x] real")).toEqual(["- [x] real"]);
  });
  it("ignores top-level indented code", () => {
    expect(hidden("    - [x] code\n\n- [ ] Parent\n\t- [x] Nested")).toEqual(["\t- [x] Nested"]);
  });
  it("keeps completed parents if an unfinished descendant exists", () => {
    expect(hidden("- [x] Parent\n\t- [ ] Still needed\n\t- [x] Finished\n## Next")).toEqual(["\t- [x] Finished\n"]);
  });
  it("hides completed subtrees and descriptions without consuming the next heading", () => {
    expect(hidden("- [x] Parent\n  description\n  - [x] Child\n## Keep")).toEqual(["- [x] Parent\n  description\n  - [x] Child\n"]);
  });
  it("handles CRLF and a final line without a newline", () => {
    expect(hidden("## A\r\n- [x] Done\r\n- [ ] Keep\r\n- [X] Last")).toEqual(["- [x] Done\r\n", "- [X] Last"]);
  });
  it("never edits the native document when filtering or undoing the filter", () => {
    const doc = "## A\n- [x] Done\n- [ ] Keep";
    let state = EditorState.create({ doc, extensions: [completedFilter] });
    state = state.update({ effects: setCompletedFilter.of(true) }).state;
    expect(state.field(completedFilter).decorations.size).toBe(1);
    expect(state.doc.toString()).toBe(doc);
    state = state.update({ effects: setCompletedFilter.of(false) }).state;
    expect(state.field(completedFilter).decorations.size).toBe(0);
    expect(state.doc.toString()).toBe(doc);
  });
  it("reveals selected completed text for editing and refilters when selection leaves", () => {
    const doc = "## A\n- [x] Done\n- [ ] Keep";
    let state = EditorState.create({ doc, selection: { anchor: 12 }, extensions: [completedFilter] });
    state = state.update({ effects: setCompletedFilter.of(true) }).state;
    expect(state.field(completedFilter).decorations.size).toBe(0);
    state = state.update({ selection: { anchor: 0 } }).state;
    expect(state.field(completedFilter).decorations.size).toBe(1);
  });
  it("updates the filter after a native checkbox edit", () => {
    let state = EditorState.create({ doc: "# A\n- [ ] Task", extensions: [completedFilter] });
    state = state.update({ effects: setCompletedFilter.of(true) }).state;
    expect(state.field(completedFilter).decorations.size).toBe(0);
    state = state.update({ changes: { from: 7, to: 8, insert: "x" } }).state;
    expect(state.field(completedFilter).decorations.size).toBe(1);
  });
});
