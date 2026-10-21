export interface Point { x: number; y: number }
export interface Bounds extends Point { width: number; height: number }
export function validBounds(value: unknown): Bounds | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Bounds;
  if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width < 220 || b.height < 100) return null;
  return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
}
export function visibleBounds(bounds: Bounds, work: Bounds): Bounds {
  const width = Math.min(bounds.width, work.width), height = Math.min(bounds.height, work.height);
  return { width, height, x: Math.round(Math.max(work.x, Math.min(bounds.x, work.x + work.width - width))), y: Math.round(Math.max(work.y, Math.min(bounds.y, work.y + work.height - height))) };
}
/** All values are Electron DIP coordinates. Width/height never come from a move event. */
export function draggedBounds(start: Bounds, cursorStart: Point, cursor: Point): Bounds {
  return { ...start, x: Math.round(start.x + cursor.x - cursorStart.x), y: Math.round(start.y + cursor.y - cursorStart.y) };
}
export function fittedHeight(content: number, toolbar: number, frame: number, max: number): number {
  return Math.min(max, Math.max(100, Math.ceil(content + toolbar + frame + 12)));
}
/** Compensate Windows/Electron fractional-DPI round-trip expansion once, never recursively. */
export function setStableBounds(native: { setBounds(bounds: Bounds): void; getBounds(): Bounds }, target: Bounds): void {
  const before = native.getBounds();
  if ((["x", "y", "width", "height"] as const).every(key => before[key] === target[key])) return;
  native.setBounds(target);
  const actual = native.getBounds();
  if ((["x", "y", "width", "height"] as const).some(key => actual[key] !== target[key])) {
    native.setBounds({ x: 2 * target.x - actual.x, y: 2 * target.y - actual.y,
      width: Math.max(220, 2 * target.width - actual.width), height: Math.max(100, 2 * target.height - actual.height) });
  }
}
