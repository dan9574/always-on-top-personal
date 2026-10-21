import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { keepInBackground } from "../src/background";

function fixture(startHidden = false) {
  let visible = true;
  const main = Object.assign(new EventEmitter(), {
    closing: false,
    webContents: Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      getBackgroundThrottling: vi.fn(() => true), setBackgroundThrottling: vi.fn(),
    }),
    isDestroyed: vi.fn(() => false), isVisible: () => visible,
    isMinimized: vi.fn(() => false), restore: vi.fn(), focus: vi.fn(),
    show: vi.fn(() => { visible = true; }), hide: vi.fn(() => { visible = false; }),
  });
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const tray = { destroy: vi.fn() };
  let pendingDestroy = false;
  // Model Obsidian's existing listener and its delayed force-destroy check.
  const hostClose = vi.fn((event: { defaultPrevented: boolean }) => {
    main.closing = true;
    pendingDestroy = !event.defaultPrevented;
  });
  main.on("close", hostClose);
  const controller = keepInBackground(main, app, tray, startHidden);
  const close = () => {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    main.emit("close", event);
    return event;
  };
  return { main, app, tray, controller, close, hostClose, wouldDestroy: () => pendingDestroy };
}

describe("background window lifecycle", () => {
  it("keeps login startup hidden through host show events until explicitly restored", () => {
    const f = fixture(true);
    expect(f.controller.startHidden).toBe(true);
    expect(f.main.isVisible()).toBe(false);
    f.main.show();
    f.main.emit("show");
    expect(f.main.isVisible()).toBe(false);
    f.controller.showMain();
    f.main.emit("show");
    expect(f.main.isVisible()).toBe(true);
    expect(f.main.listenerCount("show")).toBe(0);
  });
  it("does not hide normal launches and restores a hidden login window on disable", () => {
    const normal = fixture();
    expect(normal.controller.startHidden).toBe(false);
    expect(normal.main.isVisible()).toBe(true);
    const login = fixture(true);
    login.controller.dispose();
    expect(login.main.isVisible()).toBe(true);
    expect(login.main.listenerCount("show")).toBe(0);
  });
  it("cancels close before the host can schedule destruction and clears its closing flag", async () => {
    const f = fixture();
    expect(f.close().defaultPrevented).toBe(true);
    expect(f.wouldDestroy()).toBe(false);
    expect(f.main.isVisible()).toBe(false);
    expect(f.app.quit).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(f.main.closing).toBe(false);
    f.controller.showMain();
    expect(f.main.isVisible()).toBe(true);
    expect(f.main.focus).toHaveBeenCalledOnce();
    expect(f.main.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);
  });
  it("permits normal quit, including close retries while Obsidian finishes saving", () => {
    const f = fixture();
    f.controller.quit();
    expect(f.app.quit).toHaveBeenCalledOnce();
    f.app.emit("before-quit");
    expect(f.close().defaultPrevented).toBe(false);
    expect(f.close().defaultPrevented).toBe(false);
    expect(f.main.hide).not.toHaveBeenCalled();
  });
  it("does not intercept Windows shutdown", () => {
    const f = fixture();
    f.main.emit("query-session-end");
    expect(f.close().defaultPrevented).toBe(false);
  });
  it("restores hidden main on disable and removes only owned listeners", () => {
    const f = fixture();
    f.close();
    f.controller.dispose();
    f.controller.dispose();
    expect(f.main.isVisible()).toBe(true);
    expect(f.tray.destroy).toHaveBeenCalledOnce();
    expect(f.main.listeners("close")).toEqual([f.hostClose]);
    expect(f.app.listenerCount("before-quit")).toBe(0);
    expect(f.main.webContents.listenerCount("render-process-gone")).toBe(0);
    expect(f.main.webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    expect(f.close().defaultPrevented).toBe(false);
  });
  it("cleans up a crashed renderer so there is no invisible stranded window", () => {
    const f = fixture();
    f.close();
    f.main.webContents.emit("render-process-gone");
    expect(f.main.isVisible()).toBe(true);
    expect(f.tray.destroy).toHaveBeenCalledOnce();
    expect(f.close().defaultPrevented).toBe(false);
  });
  it("does not resurrect the main window during quit cleanup", () => {
    const f = fixture();
    f.close();
    f.app.emit("before-quit");
    f.controller.dispose();
    expect(f.main.show).not.toHaveBeenCalled();
  });
  it("ignores child/in-page navigation but cleans up on a main renderer reload", () => {
    const f = fixture();
    f.main.webContents.emit("did-start-navigation", {}, "about:blank", false, false);
    f.main.webContents.emit("did-start-navigation", {}, "app://obsidian.md/#", true, true);
    expect(f.tray.destroy).not.toHaveBeenCalled();
    f.close();
    f.main.webContents.emit("did-start-navigation", {}, "app://obsidian.md/index.html", false, true);
    expect(f.tray.destroy).toHaveBeenCalledOnce();
    expect(f.main.isVisible()).toBe(true);
  });
});
