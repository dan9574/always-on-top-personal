import type { EventEmitter } from "node:events";

export interface BackgroundWindow extends EventEmitter {
  closing?: boolean;
  webContents: EventEmitter & {
    isDestroyed(): boolean;
    getBackgroundThrottling(): boolean;
    setBackgroundThrottling(allowed: boolean): void;
  };
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  hide(): void;
  focus(): void;
}
export interface BackgroundController {
  startHidden: boolean;
  showMain(this: void): void;
  quit(): void;
  dispose(): void;
}

/** Runs in Electron's MAIN process: remote event callbacks are asynchronous
 * and cannot reliably cancel a native close before Obsidian starts quitting. */
export function keepInBackground(
  main: BackgroundWindow,
  app: EventEmitter & { quit(): void },
  tray: { destroy(): void },
  startHidden = false,
): BackgroundController {
  const throttled = main.webContents.getBackgroundThrottling();
  // Native popouts share the main renderer's Markdown rendering scheduler.
  // Suspending it when the main window hides leaves newly opened notes blank.
  main.webContents.setBackgroundThrottling(false);
  let quitting = false, disposed = false;
  let startupGuard = startHidden;
  const hideStartup = (): void => { if (startupGuard && !disposed && !main.isDestroyed()) main.hide(); };
  const showMain = (): void => {
    if (main.isDestroyed()) return;
    startupGuard = false;
    main.removeListener("show", hideStartup);
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  };
  const beforeQuit = (): void => { quitting = true; };
  const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean): void => {
    if (mainFrame && !inPlace) dispose();
  };
  const close = (event: { preventDefault(): void }): void => {
    if (disposed || quitting) return;
    event.preventDefault();
    main.hide();
    // Obsidian sets this flag in its own close listener, even after cancellation.
    // Clear it after all listeners so later renderer reloads do not run quit hooks.
    queueMicrotask(() => { if (!disposed && !quitting && !main.isDestroyed()) main.closing = false; });
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    main.removeListener("close", close);
    main.removeListener("show", hideStartup);
    main.removeListener("query-session-end", beforeQuit);
    main.removeListener("session-end", beforeQuit);
    main.removeListener("closed", dispose);
    main.webContents.removeListener("render-process-gone", dispose);
    main.webContents.removeListener("destroyed", dispose);
    main.webContents.removeListener("did-start-navigation", navigation);
    app.removeListener("before-quit", beforeQuit);
    tray.destroy();
    if (!main.webContents.isDestroyed()) main.webContents.setBackgroundThrottling(throttled);
    // Disabling/reloading the plugin must never strand an invisible main window.
    if (!quitting && !main.isDestroyed() && !main.isVisible()) showMain();
  };
  main.prependListener("close", close);
  app.on("before-quit", beforeQuit);
  main.on("query-session-end", beforeQuit);
  main.on("session-end", beforeQuit);
  main.on("closed", dispose);
  main.webContents.on("render-process-gone", dispose);
  main.webContents.on("destroyed", dispose);
  main.webContents.on("did-start-navigation", navigation);
  if (startHidden) {
    main.on("show", hideStartup);
    hideStartup();
  }
  return { startHidden, showMain, quit: () => app.quit(), dispose };
}
