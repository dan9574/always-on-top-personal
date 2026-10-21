import type { EventEmitter } from "node:events";
import { keepInBackground, type BackgroundController, type BackgroundWindow } from "./background";

// A module can be reloaded by the plugin; consume the login flag only once per window.
const startupWindows = new Set<number>();

interface Tray extends EventEmitter {
  destroy(): void;
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
}
interface ElectronMain {
  app: EventEmitter & { quit(): void };
  BrowserWindow: { fromId(id: number): BackgroundWindow | null };
  Tray: new (icon: unknown) => Tray;
  Menu: { buildFromTemplate(template: ({ label: string; click: () => void } | { type: "separator" })[]): unknown };
  nativeImage: { createFromDataURL(data: string): { isEmpty(): boolean } };
}

// Loaded by @electron/remote.require, so cancellation runs synchronously in main.
// No changes to Obsidian's files, original listeners, or other vault windows.
export function install(windowId: number, toggle: () => void, quit: () => void, vaultName: string): BackgroundController {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron is supplied only in the main-process runtime.
  const electron = require("electron") as ElectronMain;
  const main = electron.BrowserWindow.fromId(windowId);
  if (!main || main.isDestroyed()) throw new Error("无法连接 Obsidian 主窗口。");
  // A bundled 16px purple pin, independent of Obsidian's installer/update paths.
  const icon = electron.nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANElEQVR4nGNgoAaoCzz0nxxMGwO+fvqPF9PeAFwGkRwGQ9gAqgUismFkJ6RhYADReYESAADx+zZPN/lq/AAAAABJRU5ErkJggg==");
  if (icon.isEmpty()) throw new Error("无法创建托盘图标，未启用后台隐藏。");
  const tray = new electron.Tray(icon);
  let controller: BackgroundController | undefined;
  try {
    const startHidden = process.argv.includes("--ppn-background") && !startupWindows.has(windowId);
    controller = keepInBackground(main, electron.app, tray, startHidden);
    if (startHidden) startupWindows.add(windowId);
    tray.setToolTip(`置顶笔记 · ${vaultName}`);
    tray.setContextMenu(electron.Menu.buildFromTemplate([
      { label: "显示 Obsidian 主窗口", click: controller.showMain },
      { label: "开关置顶笔记 · Ctrl+D", click: toggle },
      { type: "separator" },
      { label: "完全退出 Obsidian", click: quit },
    ]));
    tray.on("double-click", controller.showMain);
    return controller;
  } catch (error) {
    if (controller) controller.dispose();
    else tray.destroy();
    throw error;
  }
}
