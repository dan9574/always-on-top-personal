import type { GlobalShortcutApi } from "./shortcut";
import type { Bounds, Point } from "./geometry";
export interface NativeWindow {
  id: number;
  getTitle(): string;
  setAlwaysOnTop(value: boolean, level?: string): void;
  isVisible(): boolean;
  isMinimized(): boolean;
  restore(): void;
  getOpacity(): number;
  setOpacity(opacity: number): void;
  setMinimumSize(width: number, height: number): void;
  setSize(width: number, height: number): void;
  getPosition(): [number, number];
  setPosition(x: number, y: number): void;
  getBounds(): Bounds;
  getContentBounds(): Bounds;
  setBounds(bounds: Bounds): void;
  on(event: string, callback: () => void): void;
  removeListener(event: string, callback: () => void): void;
  isAlwaysOnTop(): boolean;
  isDestroyed(): boolean;
  show(): void;
  hide(): void;
  focus(): void;
}
interface DesktopBridge {
  require?: (path: string) => unknown;
  screen?: { getCursorScreenPoint(): Point; getDisplayMatching(bounds: Bounds): { workArea: Bounds } };
  globalShortcut?: GlobalShortcutApi;
  getCurrentWindow?: () => NativeWindow;
  BrowserWindow?: { getAllWindows(): NativeWindow[] };
}
/** Electron remote is provided by desktop Obsidian, not its public plugin API. */
export function desktopBridge(win: Window): DesktopBridge | null {
  const host = win as Window & {
    require?: (name: string) => unknown;
    electron?: { remote?: DesktopBridge };
  };
  if (host.electron?.remote) return host.electron.remote;
  for (const name of ["@electron/remote", "electron"]) {
    try {
      const module = host.require?.(name) as (DesktopBridge & { remote?: DesktopBridge }) | undefined;
      const bridge = module?.remote ?? module;
      if (bridge?.getCurrentWindow || bridge?.globalShortcut) return bridge;
    } catch { /* Try the other desktop bridge. */ }
  }
  return null;
}
export async function nativeWindow(win: Window, cancelled: () => boolean): Promise<NativeWindow> {
  const mainBridge = desktopBridge(window);
  const mainId = (window as Window & { electronWindow?: NativeWindow }).electronWindow?.id
    ?? mainBridge?.getCurrentWindow?.().id;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (cancelled()) throw new Error("窗口操作已取消。");
    try {
      const direct = (win as Window & { electronWindow?: NativeWindow }).electronWindow;
      if (direct && direct.id !== mainId && !direct.isDestroyed()) return direct;
      // Popouts can share the main renderer's require cache. getCurrentWindow alone
      // may then return the MAIN window. Never pin/focus it on behalf of a popout.
      const bridge = desktopBridge(win) ?? mainBridge;
      const candidates = (bridge?.BrowserWindow ?? mainBridge?.BrowserWindow)?.getAllWindows()
        .filter(candidate => candidate.id !== mainId && !candidate.isDestroyed() && candidate.getTitle() === win.document.title) ?? [];
      if (candidates.length === 1) return candidates[0];
    } catch { /* A new popout may not yet have a BrowserWindow. */ }
    await new Promise<void>(resolve => window.setTimeout(resolve, 75));
  }
  throw new Error("无法连接浮窗的 Electron 窗口，置顶未启用。");
}
