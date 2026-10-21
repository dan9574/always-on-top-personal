import { afterEach, expect, it, vi } from "vitest";
import { nativeWindow } from "../src/native";

afterEach(() => vi.unstubAllGlobals());

it("uses the main DOM window's owner even if the shared remote cache points to a released popout", async () => {
  const getCurrentWindow = vi.fn(() => { throw new Error("IPC method called after context was released"); });
  vi.stubGlobal("window", { electronWindow: { id: 1 }, electron: { remote: { getCurrentWindow } } });
  const native = { id: 2, isDestroyed: () => false };
  const popout = { electronWindow: native } as unknown as Window;
  expect(await nativeWindow(popout, () => false)).toBe(native);
  expect(getCurrentWindow).not.toHaveBeenCalled();
});
