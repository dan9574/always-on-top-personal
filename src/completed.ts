export interface HiddenRange { from: number; to: number }
/** Display-only ranges; fenced code, frontmatter and unfinished subtasks stay visible. */
export function completedRanges(text: string): HiddenRange[] {
  const lines = text.split("\n");
  const offsets: number[] = [];
  const eligible: boolean[] = [];
  let offset = 0;
  let fence: { char: string; size: number } | null = null;
  let frontmatter = lines[0]?.trim() === "---";
  for (let i = 0; i < lines.length; i++) {
    offsets.push(offset);
    offset += lines[i].length + 1;
    eligible.push(!frontmatter && !fence);
    if (frontmatter) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(lines[i])) frontmatter = false;
      continue;
    }
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (marker) {
      eligible[i] = false;
      if (!fence) fence = { char: marker[1][0], size: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2].trim()) fence = null;
    }
  }
  const ranges: HiddenRange[] = [];
  const indent = (line: string): number => (line.match(/^[\t ]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
  for (let i = 0; i < lines.length; i++) {
    if (!eligible[i] || !/^\s*(?:[-+*]|\d+[.)])\s+\[[xX]\]\s/.test(lines[i])) continue;
    const depth = indent(lines[i]);
    if (depth >= 4) {
      let ancestor = i - 1;
      while (ancestor >= 0 && (!lines[ancestor].trim() || indent(lines[ancestor]) >= depth)) ancestor--;
      if (ancestor < 0 || !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[ancestor])) continue;
    }
    let end = i + 1;
    let unfinished = false;
    while (end < lines.length && lines[end].trim() && indent(lines[end]) > depth) {
      if (!eligible[end] || /^\s*(?:[-+*]|\d+[.)])\s+\[ \]/.test(lines[end])) unfinished = true;
      end++;
    }
    if (unfinished) continue;
    const from = offsets[i];
    const to = end < lines.length ? offsets[end] : text.length;
    if (to > from) ranges.push({ from, to });
    i = end - 1;
  }
  return ranges;
}
