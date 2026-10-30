import { FileSystemAdapter, MarkdownView, Menu, Notice, Plugin, TFile, setIcon, type WorkspaceLeaf } from "obsidian";
import { join } from "node:path";
import type { BackgroundController } from "./background";
import type { install } from "./background-entry";
import type { EditorView } from "@codemirror/view";
import { completedFilter, setCompletedFilter } from "./filter";
import { desktopBridge, nativeWindow, type NativeWindow } from "./native";
import { GlobalToggleBinding } from "./shortcut";
import { draggedBounds, fittedHeight, setStableBounds, validBounds, visibleBounds, type Bounds, type Point } from "./geometry";

interface Settings {
  filePath: string;
  leafId: string;
  pinned: boolean;
  hideCompleted: boolean;
  bounds: Bounds | null;
  autoHeight: boolean;
}
const defaults: Settings = { filePath: "", leafId: "", pinned: true, hideCompleted: false, bounds: null, autoHeight: true };
/** Main-window events that change whether the toolbar's window toggle shows as open. */
const MAIN_WINDOW_EVENTS = ["show", "hide", "minimize", "restore"] as const;

export default class PinnedNotesPlugin extends Plugin {
  settings: Settings = { ...defaults };
  shortcutStatus = "尚未注册";
  private binding: GlobalToggleBinding | null = null;
  private background: BackgroundController | null = null;
  private quitting = false;
  private leaf: WorkspaceLeaf | null = null;
  private native: NativeWindow | null = null;
  private mainWindow: NativeWindow | null = null;
  private readonly onMainVisibility = (): void => this.refreshControls();
  private toolbar: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private mainToggle: HTMLButtonElement | null = null;
  private eye: HTMLButtonElement | null = null;
  private pin: HTMLButtonElement | null = null;
  private edit: HTMLButtonElement | null = null;
  private stopLayout: (() => void) | null = null;
  private fitTimer: number | null = null;
  private moving = false;
  private changingMode = false;
  private disposed = false;
  private busy = false;
  private operations = Promise.resolve();
  private writes = Promise.resolve();

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (saved && typeof saved === "object") {
      const data = saved as Partial<Settings>;
      this.settings = {
        filePath: typeof data.filePath === "string" ? data.filePath : "",
        leafId: typeof data.leafId === "string" ? data.leafId : "",
        pinned: typeof data.pinned === "boolean" ? data.pinned : true,
        hideCompleted: typeof data.hideCompleted === "boolean" ? data.hideCompleted : false,
        bounds: validBounds(data.bounds),
        autoHeight: data.autoHeight !== false,
      };
    }
    // Register our login URI before layout readiness; the URL selects this vault.
    // The main-process argv flag distinguishes a cold login launch from a normal open.
    this.registerObsidianProtocolHandler("personal-pinned-startup", () => undefined);
    this.installBackground();
    this.watchMainWindow();
    this.registerEditorExtension(completedFilter);
    this.addRibbonIcon("panels-top-left", "开关置顶笔记 · Ctrl+D", () => this.enqueueToggle());
    // No local hotkey: the OS binding is the only Ctrl+D handler, even inside Obsidian.
    this.addCommand({ id: "toggle-window", name: "开关置顶笔记", callback: () => this.enqueueToggle() });
    this.addCommand({ id: "show-main-window", name: "显示 Obsidian 主窗口", callback: () => this.showMainWindow() });
    this.addCommand({ id: "quit-obsidian", name: "完全退出 Obsidian", callback: () => this.enqueueQuit() });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncWindow()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.syncWindow()));
    this.registerEvent(this.app.vault.on("rename", file => {
      if (this.leaf?.view instanceof MarkdownView && file === this.leaf.view.file) this.syncWindow();
    }));
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      try {
        const api = desktopBridge(window)?.globalShortcut;
        if (!api) throw new Error("当前 Obsidian 未提供全局快捷键接口。左侧按钮仍可开关浮窗。");
        this.binding = new GlobalToggleBinding(api);
        this.binding.register(() => this.enqueueToggle());
        this.shortcutStatus = "全局 Ctrl+D 已注册";
      } catch (error) {
        this.shortcutStatus = error instanceof Error ? error.message : String(error);
        this.report(error);
      }
      // Adopt only our saved native leaf, never an unrelated popout.
      const restored = this.settings.leafId ? this.app.workspace.getLeafById(this.settings.leafId) : null;
      if (restored && restored.view instanceof MarkdownView && restored.view.containerEl.win !== window) {
        this.leaf = restored;
        this.operations = this.operations.then(() => this.attachWindow(restored, false, !this.background?.startHidden)).catch(error => this.report(error));
      }
    });
  }

  private installBackground(): void {
    try {
      const bridge = desktopBridge(window);
      const adapter = this.app.vault.adapter;
      const main = (window as Window & { electronWindow?: NativeWindow }).electronWindow
        ?? bridge?.getCurrentWindow?.();
      if (!bridge?.require || !main || !(adapter instanceof FileSystemAdapter) || !this.manifest.dir) {
        throw new Error("后台运行接口不可用，主窗口仍按原方式关闭。");
      }
      const helper = bridge.require(join(adapter.getBasePath(), this.manifest.dir, "background.cjs")) as { install: typeof install };
      this.background = helper.install(main.id, () => this.enqueueToggle(), () => this.enqueueQuit(), this.app.vault.getName());
    } catch (error) { this.report(error); }
  }

  private report(error: unknown): void {
    if (this.disposed) return;
    console.error("Pinned Notes Personal:", error);
    new Notice(error instanceof Error ? error.message : String(error), 8000);
    // Local diagnostics only; no note contents or external requests.
    const dir = this.manifest.dir;
    if (dir) void this.app.vault.adapter.write(`${dir}/last-error.log`, `${new Date().toISOString()}\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`).catch(() => undefined);
  }

  private persist(): Promise<void> {
    const snapshot = { ...this.settings };
    this.writes = this.writes.catch(() => undefined).then(() => this.saveData(snapshot));
    return this.writes;
  }

  private enqueueToggle(): void {
    if (this.disposed || this.quitting) return;
    // Serializing asynchronous opens prevents duplicate windows during rapid key presses.
    this.operations = this.operations.then(async () => {
      if (this.disposed) return;
      this.busy = true;
      try {
        if (this.leaf && this.leaf.view.containerEl.isConnected && this.native && !this.native.isDestroyed()) {
          if (this.native.isVisible() && !this.native.isMinimized()) await this.closeWindow();
          else await this.revealWindow();
        } else await this.openWindow();
      } finally { this.busy = false; }
    }).catch(error => this.report(error));
  }

  private async revealWindow(): Promise<void> {
    if (!this.native || !(this.leaf?.view instanceof MarkdownView)) return;
    if (this.leaf.view.getMode() !== "preview") {
      await this.leaf.view.save();
      const state = this.leaf.getViewState();
      await this.leaf.setViewState({ ...state, state: { ...state.state, mode: "preview" } });
    }
    if (this.native.isMinimized()) this.native.restore();
    this.native.show();
    this.native.focus();
    this.refreshControls();
    this.watchLayout();
  }

  private enqueueQuit(): void {
    if (this.disposed || this.quitting || !this.background) return;
    this.quitting = true;
    this.operations = this.operations.then(async () => {
      try {
        // Save every native Markdown editor before requesting the normal app quit.
        // Failure leaves all windows and the background controller available.
        const saves: Promise<void>[] = [];
        this.app.workspace.iterateAllLeaves(leaf => {
          if (leaf.view instanceof MarkdownView) saves.push(leaf.view.save());
        });
        await Promise.all(saves);
        this.rememberBounds();
        await this.persist();
        this.background?.quit();
      } finally { this.quitting = false; }
    }).catch(error => this.report(error));
  }

  /** The main window's own remote handle; its show/hide events keep the toolbar toggle in sync. */
  private watchMainWindow(): void {
    try {
      const main = (window as Window & { electronWindow?: NativeWindow }).electronWindow
        ?? desktopBridge(window)?.getCurrentWindow?.();
      if (!main || main.isDestroyed()) return;
      this.mainWindow = main;
      for (const event of MAIN_WINDOW_EVENTS) main.on(event, this.onMainVisibility);
    } catch (error) { this.report(error); }
  }

  private isMainWindowOpen(): boolean {
    const main = this.mainWindow;
    return main !== null && !main.isDestroyed() && main.isVisible() && !main.isMinimized();
  }

  private showMainWindow(): void {
    try {
      if (this.background) {
        this.background.showMain();
        return;
      }
      // Without the background helper, reach the main window from its own renderer.
      const main = this.mainWindow;
      if (!main || main.isDestroyed()) throw new Error("无法连接 Obsidian 主窗口。");
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    } catch (error) { this.report(error); }
  }

  /** Toolbar toggle: hide the main window while it is open, otherwise show it. */
  private toggleMainWindow(): void {
    try {
      const main = this.mainWindow;
      // Hiding is only offered while the tray exists, so the main window can always be brought back.
      if (this.background && main && !main.isDestroyed() && this.isMainWindowOpen()) main.hide();
      else this.showMainWindow();
      this.refreshControls();
    } catch (error) { this.report(error); }
  }

  private async openWindow(): Promise<void> {
    const remembered = this.app.vault.getAbstractFileByPath(this.settings.filePath);
    const active = this.app.workspace.getActiveFile();
    const file = remembered instanceof TFile && remembered.extension === "md" ? remembered : active;
    if (!(file instanceof TFile) || file.extension !== "md") throw new Error("请先在 Obsidian 打开一篇 Markdown 笔记，再打开置顶窗口。");
    this.clearControls();
    const leaf = this.app.workspace.openPopoutLeaf({ size: this.settings.bounds ?? { width: 340, height: 400 } });
    this.leaf = leaf;
    await leaf.openFile(file, { state: { mode: "preview" } });
    if (this.disposed) { leaf.detach(); return; }
    this.settings.filePath = file.path;
    // Obsidian exposes leaf IDs for workspace restoration, though the TS member is internal.
    this.settings.leafId = (leaf as WorkspaceLeaf & { id?: string }).id ?? "";
    await this.persist();
    await this.attachWindow(leaf, true);
  }

  private async attachWindow(leaf: WorkspaceLeaf, compactSize = false, visible = true): Promise<void> {
    if (this.disposed || this.leaf !== leaf) return;
    const host = leaf.view.containerEl.win;
    if (host === window) throw new Error("目标不是独立笔记窗口，未修改主窗口置顶状态。");
    this.mountControls();
    this.native = await nativeWindow(host, () => this.disposed || this.leaf !== leaf);
    // Windows reports topmost only once a newly created native window is visible.
    if (visible) {
      if (this.native.isMinimized()) this.native.restore();
      this.native.show();
    } else this.native.hide();
    // Obsidian's normal popout minimum width otherwise expands a 340px note to 600px.
    this.native.setMinimumSize(220, 100);
    if (compactSize) {
      const bounds = this.settings.bounds ?? { ...this.native.getBounds(), width: 340, height: 400 };
      const work = desktopBridge(window)?.screen?.getDisplayMatching(bounds).workArea;
      setStableBounds(this.native, work ? visibleBounds(bounds, work) : bounds);
    }
    this.native.setOpacity(0.95);
    this.native.setAlwaysOnTop(this.settings.pinned, "screen-saver");
    await new Promise<void>(resolve => window.setTimeout(resolve, 100));
    if (this.disposed || this.leaf !== leaf || this.native.isDestroyed()) return;
    if (visible && this.native.isAlwaysOnTop() !== this.settings.pinned) throw new Error("窗口置顶状态未生效，请关闭浮窗后重试。");
    if (visible) this.native.focus();
    else this.native.hide();
    this.refreshControls();
    this.watchLayout();
  }

  private syncWindow(): void {
    if (!this.leaf || this.busy || this.disposed) return;
    if (!this.leaf.view.containerEl.isConnected || this.native?.isDestroyed()) {
      this.stopLayout?.();
      this.clearControls();
      this.leaf = null;
      this.native = null;
      this.settings.leafId = "";
      void this.persist().catch(error => this.report(error));
      return;
    }
    // A user may navigate to another note in the native editor.
    if (this.leaf.view instanceof MarkdownView) {
      const file = this.leaf.view.file;
      if (file && this.settings.filePath !== file.path) {
        this.settings.filePath = file.path;
        void this.persist().catch(error => this.report(error));
      }
      if (!this.toolbar?.isConnected) this.mountControls();
      this.refreshControls();
    }
  }

  private mountControls(): void {
    if (!(this.leaf?.view instanceof MarkdownView)) return;
    this.clearControls();
    const view = this.leaf.view;
    view.containerEl.addClass("ppn-note");
    this.toolbar = view.containerEl.createDiv({ cls: "ppn-toolbar" });
    view.containerEl.prepend(this.toolbar);
    this.installDragging(this.toolbar);
    this.titleEl = this.toolbar.createSpan({ cls: "ppn-title" });
    this.toolbar.addEventListener("contextmenu", event => {
      if (!this.background || (event.target as Element).closest("button")) return;
      event.preventDefault();
      new Menu()
        .addItem(item => item.setTitle("显示 Obsidian 主窗口").setIcon("panels-top-left").onClick(() => this.background?.showMain()))
        .addSeparator()
        .addItem(item => item.setTitle("完全退出 Obsidian").setIcon("power").onClick(() => this.enqueueQuit()))
        .showAtMouseEvent(event);
    });
    this.toolbar.addEventListener("dblclick", event => {
      if ((event.target as Element).closest("button")) return;
      event.stopPropagation();
      this.settings.autoHeight = true;
      this.scheduleFit();
      void this.persist().catch(error => this.report(error));
    });
    this.mainToggle = this.button("app-window", "显示 Obsidian 主窗口", () => this.toggleMainWindow());
    this.mainToggle.addClass("ppn-main-toggle");
    this.edit = this.button("pencil", "切换编辑模式", () => { void this.toggleMode().catch(error => this.report(error)); });
    this.eye = this.button("eye", "隐藏已完成任务", () => {
      this.settings.hideCompleted = !this.settings.hideCompleted;
      this.refreshControls();
      void this.persist().catch(error => this.report(error));
    });
    this.pin = this.button("pin", "取消置顶", () => {
      try {
        if (!this.native || this.native.isDestroyed()) throw new Error("置顶接口尚未就绪。");
        const next = !this.native.isAlwaysOnTop();
        this.native.setAlwaysOnTop(next, "screen-saver");
        this.settings.pinned = this.native.isAlwaysOnTop();
        this.refreshControls();
        void this.persist().catch(error => this.report(error));
      } catch (error) { this.report(error); }
    });
    this.button("x", "关闭置顶笔记 · Ctrl+D", () => this.enqueueToggle());
    this.refreshControls();
  }

  private button(icon: string, label: string, action: () => void): HTMLButtonElement {
    if (!this.toolbar) throw new Error("Toolbar unavailable");
    const button = this.toolbar.createEl("button", { attr: { type: "button", "aria-label": label, title: label } });
    setIcon(button, icon);
    button.addEventListener("click", action);
    return button;
  }

  private installDragging(toolbar: HTMLElement): void {
    let drag: { pointerId: number; cursor: Point; bounds: Bounds } | null = null;
    // Chromium screen coordinates preserve each event's position. Querying the OS
    // later can return the final cursor position for every queued pointer event.
    // Keep the original size and compensate native fractional-DPI round trips.
    toolbar.addEventListener("pointerdown", event => {
      if (event.button !== 0 || (event.target as Element).closest("button") || !this.native || this.native.isDestroyed()) return;
      drag = { pointerId: event.pointerId, cursor: { x: event.screenX, y: event.screenY }, bounds: this.native.getBounds() };
      this.moving = true;
      toolbar.setPointerCapture(event.pointerId);
    });
    toolbar.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId || !this.native || this.native.isDestroyed()) return;
      setStableBounds(this.native, draggedBounds(drag.bounds, drag.cursor, { x: event.screenX, y: event.screenY }));
    });
    const finish = (): void => {
      const pointerId = drag?.pointerId;
      drag = null;
      if (pointerId !== undefined && toolbar.hasPointerCapture(pointerId)) toolbar.releasePointerCapture(pointerId);
      this.moving = false;
      this.rememberBounds();
    };
    toolbar.addEventListener("pointerup", finish);
    toolbar.addEventListener("pointercancel", finish);
    toolbar.addEventListener("lostpointercapture", finish);
  }

  private async toggleMode(): Promise<void> {
    if (this.changingMode || !(this.leaf?.view instanceof MarkdownView)) return;
    const leaf = this.leaf, view = leaf.view as MarkdownView;
    this.changingMode = true;
    try {
      const mode = view.getMode() === "preview" ? "source" : "preview";
      if (mode === "preview") await view.save();
      const state = leaf.getViewState();
      await leaf.setViewState({ ...state, state: { ...state.state, mode, source: false } });
      if (this.disposed || this.leaf !== leaf) return;
      this.refreshControls();
      this.scheduleFit();
    } finally { this.changingMode = false; }
  }

  private rememberBounds(): void {
    if (!this.native || this.native.isDestroyed() || this.native.isMinimized()) return;
    const bounds = this.native.getBounds(), previous = this.settings.bounds;
    if (previous && (["x", "y", "width", "height"] as const).every(key => previous[key] === bounds[key])) return;
    this.settings.bounds = bounds;
    void this.persist().catch(error => this.report(error));
  }

  private watchLayout(): void {
    this.stopLayout?.();
    const native = this.native, host = this.leaf?.view.containerEl.win;
    if (!native || !host || !this.leaf) return;
    let timer: number | null = null;
    const remember = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; this.rememberBounds(); }, 180);
    };
    // will-resize is emitted for a user's native resize, not setBounds.
    const manualResize = (): void => {
      if (!this.moving && this.settings.autoHeight) {
        this.settings.autoHeight = false;
        void this.persist().catch(error => this.report(error));
      }
    };
    native.on("move", remember);
    native.on("resize", remember);
    native.on("will-resize", manualResize);
    const observer = new MutationObserver(() => this.scheduleFit());
    observer.observe(this.leaf.view.containerEl, { childList: true, subtree: true, characterData: true });
    const resizeObserver = new ResizeObserver(() => this.scheduleFit());
    const sizer = this.leaf.view.containerEl.querySelector(".markdown-preview-sizer");
    if (sizer) resizeObserver.observe(sizer);
    this.stopLayout = () => {
      observer.disconnect();
      resizeObserver.disconnect();
      if (timer !== null) window.clearTimeout(timer);
      if (this.fitTimer !== null) window.clearTimeout(this.fitTimer);
      this.fitTimer = null;
      if (!native.isDestroyed()) {
        native.removeListener("move", remember);
        native.removeListener("resize", remember);
        native.removeListener("will-resize", manualResize);
      }
      this.stopLayout = null;
    };
    this.scheduleFit();
  }

  private scheduleFit(): void {
    if (!this.settings.autoHeight || this.disposed) return;
    if (this.fitTimer !== null) window.clearTimeout(this.fitTimer);
    this.fitTimer = window.setTimeout(() => { this.fitTimer = null; this.fitContent(); }, 160);
  }

  private fitContent(): void {
    if (!this.settings.autoHeight || this.moving || !this.native || this.native.isDestroyed() || !(this.leaf?.view instanceof MarkdownView)) return;
    const view = this.leaf.view;
    if (view.getMode() !== "preview") return;
    const cm = (view.editor as typeof view.editor & { cm?: EditorView }).cm;
    const preview = view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
    const content = view.getMode() === "preview" ? preview?.getBoundingClientRect().height : cm?.contentHeight;
    if (!content || content < 10) return;
    const bounds = this.native.getBounds();
    const work = desktopBridge(window)?.screen?.getDisplayMatching(bounds).workArea;
    const height = fittedHeight(content, this.toolbar?.offsetHeight ?? 33, bounds.height - this.native.getContentBounds().height, work ? Math.max(100, work.y + work.height - bounds.y) : 800);
    if (Math.abs(height - bounds.height) > 2) setStableBounds(this.native, { ...bounds, height });
    this.rememberBounds();
  }

  private refreshControls(): void {
    if (!(this.leaf?.view instanceof MarkdownView)) return;
    const view = this.leaf.view;
    if (this.edit) {
      const editing = view.getMode() !== "preview";
      const label = editing ? "完成编辑，切换只读模式" : "切换编辑模式";
      setIcon(this.edit, editing ? "check" : "pencil");
      this.edit.setAttribute("aria-label", label);
      this.edit.setAttribute("title", label);
      this.edit.setAttribute("aria-pressed", String(editing));
    }
    if (this.mainToggle) {
      const open = this.isMainWindowOpen();
      const label = open && this.background ? "隐藏 Obsidian 主窗口" : "显示 Obsidian 主窗口";
      this.mainToggle.setAttribute("aria-label", label);
      this.mainToggle.setAttribute("title", label);
      this.mainToggle.setAttribute("aria-pressed", String(open));
    }
    if (this.titleEl) {
      this.titleEl.textContent = view.file?.basename ?? "置顶笔记";
      this.titleEl.title = `${view.file?.path ?? ""} · ${this.shortcutStatus} · 双击标题恢复自动高度`;
    }
    if (this.eye) {
      const label = this.settings.hideCompleted ? "显示已完成任务" : "隐藏已完成任务";
      setIcon(this.eye, this.settings.hideCompleted ? "eye-off" : "eye");
      this.eye.setAttribute("aria-label", label);
      this.eye.setAttribute("title", label);
      this.eye.setAttribute("aria-pressed", String(this.settings.hideCompleted));
    }
    if (this.pin) {
      const label = this.settings.pinned ? "取消置顶" : "置顶";
      setIcon(this.pin, this.settings.pinned ? "pin" : "pin-off");
      this.pin.setAttribute("aria-label", label);
      this.pin.setAttribute("title", label);
      this.pin.setAttribute("aria-pressed", String(this.settings.pinned));
    }
    this.setFilter(view, this.settings.hideCompleted);
  }

  private setFilter(view: MarkdownView, enabled: boolean): void {
    view.previewMode.containerEl.toggleClass("ppn-hide-completed", enabled);
    // Obsidian's native editor owns CM6. Never create a replacement editor or edit note text.
    const cm = (view.editor as typeof view.editor & { cm?: EditorView }).cm;
    const field = cm?.state.field(completedFilter, false);
    if (cm && field && field.enabled !== enabled) cm.dispatch({ effects: setCompletedFilter.of(enabled) });
  }

  private clearControls(): void {
    if (this.leaf?.view instanceof MarkdownView) {
      this.setFilter(this.leaf.view, false);
      this.leaf.view.containerEl.removeClass("ppn-note");
    }
    this.toolbar?.remove();
    this.toolbar = null;
    this.titleEl = null;
    this.mainToggle = null;
    this.eye = null;
    this.pin = null;
    this.edit = null;
  }

  private async closeWindow(): Promise<void> {
    const leaf = this.leaf;
    if (!leaf || !this.native || this.native.isDestroyed()) return;
    // Keep the native editor alive while backgrounded. Destroying its renderer
    // can invalidate Obsidian's shared Electron IPC objects on the next open.
    if (leaf.view instanceof MarkdownView) await leaf.view.save();
    this.rememberBounds();
    this.stopLayout?.();
    await this.persist();
    this.native.hide();
  }

  onunload(): void {
    this.rememberBounds();
    this.stopLayout?.();
    this.disposed = true;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      for (const event of MAIN_WINDOW_EVENTS) this.mainWindow.removeListener(event, this.onMainVisibility);
    }
    this.mainWindow = null;
    this.background?.dispose();
    this.background = null;
    this.binding?.dispose();
    this.clearControls();
    if (this.native && !this.native.isDestroyed()) {
      this.native.setAlwaysOnTop(false);
      this.native.setOpacity(1);
      if (!this.native.isVisible() && !this.quitting) this.native.show();
    }
    // Leave the native editor intact on unload so pending edits use Obsidian's normal save lifecycle.
    this.native = null;
  }
}
