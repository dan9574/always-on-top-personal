export const ACCELERATOR = "Control+D";
export interface GlobalShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  isRegistered(accelerator: string): boolean;
}

/** Never unregister a shortcut owned by another vault or plugin. */
export class GlobalToggleBinding {
  private owned = false;
  constructor(private readonly api: GlobalShortcutApi) {}
  register(toggle: () => void): void {
    if (this.owned) return;
    if (this.api.isRegistered(ACCELERATOR)) throw new Error("Ctrl+D 已被另一个插件或笔记库注册；未抢占该快捷键。");
    this.owned = this.api.register(ACCELERATOR, toggle);
    if (!this.owned) throw new Error("全局 Ctrl+D 注册失败，可能已被其他程序占用。左侧按钮仍然可用。");
  }
  dispose(): void {
    if (!this.owned) return;
    this.owned = false;
    this.api.unregister(ACCELERATOR);
  }
}
