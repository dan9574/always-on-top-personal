import { describe, expect, it } from "vitest";
import { draggedBounds, fittedHeight, setStableBounds, validBounds, visibleBounds } from "../src/geometry";

describe("window geometry", () => {
  it("prevents fractional-DPI border growth across repeated moves and reopen", () => {
    let actual = { x: 200, y: 100, width: 340, height: 270 };
    let writes = 0;
    const native = {
      getBounds: () => ({ ...actual }),
      setBounds: (b: typeof actual) => { writes++; actual = { ...b, width: b.width + 1, height: b.height + 1 }; },
    };
    const start = { ...actual };
    for (let i = 1; i <= 200; i++) {
      setStableBounds(native, draggedBounds(start, { x: 210, y: 110 }, { x: 210 + i, y: 110 - i }));
      expect(actual).toEqual({ x: 200 + i, y: 100 - i, width: 340, height: 270 });
    }
    const saved = { ...actual };
    actual = { x: 0, y: 0, width: 600, height: 740 };
    setStableBounds(native, saved);
    expect(actual).toEqual(saved);
    const count = writes;
    setStableBounds(native, saved);
    expect(writes).toBe(count);
  });
  it("keeps original dimensions through repeated drag updates without accumulation", () => {
    const start = { x: 200, y: 100, width: 340, height: 270 };
    for (let i = 0; i < 200; i++) {
      expect(draggedBounds(start, { x: 210, y: 110 }, { x: 210 + i, y: 110 - i }))
        .toEqual({ x: 200 + i, y: 100 - i, width: 340, height: 270 });
    }
  });
  it("does not move again when the cursor stops, regardless of window changes", () => {
    const start = { x: -900, y: 40, width: 340, height: 300 };
    const first = draggedBounds(start, { x: -850, y: 60 }, { x: -800, y: 100 });
    expect(draggedBounds(start, { x: -850, y: 60 }, { x: -800, y: 100 })).toEqual(first);
  });
  it("restores the exact saved rectangle when still visible", () => {
    const saved = { x: -700, y: 120, width: 380, height: 250 };
    expect(visibleBounds(saved, { x: -1920, y: 0, width: 1920, height: 1080 })).toEqual(saved);
  });
  it("recovers offscreen or excessive dimensions into the current work area", () => {
    expect(visibleBounds({ x: 9000, y: 9000, width: 9000, height: 9000 }, { x: 0, y: 0, width: 1280, height: 720 }))
      .toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });
  it("shrinks to content and caps long content without using the previous height", () => {
    expect(fittedHeight(220, 32, 2, 900)).toBe(266);
    expect(fittedHeight(5000, 32, 2, 900)).toBe(900);
    expect(fittedHeight(2, 32, 2, 900)).toBe(100);
  });
  it("rejects corrupt saved bounds", () => {
    expect(validBounds({ x: 0, y: NaN, width: 340, height: 300 })).toBeNull();
    expect(validBounds({ x: 0, y: 0, width: -1, height: 300 })).toBeNull();
  });
});
