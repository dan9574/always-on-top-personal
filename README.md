# Pinned Notes Personal · 置顶笔记

把 Obsidian 原生笔记变成紧凑的桌面浮窗：**全局 Ctrl+D 开关、置顶、默认只读、随时编辑，保留标题和缩进列表折叠**。

独立插件 ID：`personal-pinned-notes`。原插件更新不会覆盖它；没有计时器和专注会话。源自 MIT 项目 [obsidian-always-on-top-tasks](https://github.com/n23eos/obsidian-always-on-top-tasks)，由本仓库独立维护，与原作者无隶属关系。来源见 [NOTICE.md](NOTICE.md)，许可见 [LICENSE](LICENSE)。

## 支持范围

| 环境 / 功能 | 状态 |
| --- | --- |
| Windows 桌面 / Obsidian 1.14.4 | 已实测浮窗、全局快捷键、置顶、编辑保存、原生折叠、后台运行 |
| Windows 登录后后台启动 | 已实现，自动测试通过；尚未完成实际登录 / 冷启动验收 |
| macOS / Linux | 尚未适配和验证，不承诺可用；安装脚本仅支持 Windows |
| 手机 / 平板 | 不支持 |

需要本机桌面版 Obsidian 和一个已经打开过的笔记库。清单声明最低版本 1.5.1，但目前实测版本仅为 1.14.4。使用了宿主未公开的 Electron remote 桥接，Obsidian 升级后可能需要适配。

## 交给 AI 安装

将下面整段交给能操作本机文件和终端的 AI。首次允许社区插件时，可能需要你在 Obsidian 界面完成操作。

```text
请安装 https://github.com/dan9574/always-on-top-personal 的最新发布版。
先完整阅读仓库 README.md，按其中“AI 安装约定”执行。
我的 Obsidian 笔记库路径是：<填写完整路径>。
安装并启用 personal-pinned-notes，保留现有设置和笔记，完成后验证 Ctrl+D。
默认不设置登录自启动；只有我明确要求时才配置。
```

### AI 安装约定

1. 先确认 Windows 和目标笔记库。使用用户提供的路径；未指定时，可只读检查 `%APPDATA%\obsidian\obsidian.json` 的 `vaults` 映射。多个候选且无法确定目标时询问用户。默认配置目录是 `.obsidian`；自定义目录需传 `-ConfigDir`。
2. 从 [最新 Release](https://github.com/dan9574/always-on-top-personal/releases/latest) 下载 `personal-pinned-notes.zip` 和 `SHA256SUMS.txt`，校验 ZIP 的 SHA-256，再解压到独立临时目录。不要使用 GitHub 自动生成的 Source code ZIP 代替安装包；它不含编译后的 JavaScript。
3. 阅读安装脚本，用 `-DryRun` 检查目标。安装前正常完全退出 Obsidian：本插件托盘或浮窗标题右键 → **完全退出 Obsidian**。主窗口的 × 可能只是隐藏。不要直接强制结束进程；有未保存工作时让用户正常退出。
4. 从解压出的 `personal-pinned-notes` 目录执行下方安装命令。脚本只复制四个运行文件，备份旧插件，保留 `data.json` 和笔记；`-Enable` 在现有社区插件列表中追加本插件，不替换其他条目，也不自动关闭受限模式。
5. 重新启动目标库，必要时在设置 → 第三方插件中允许社区插件并启用 **Pinned Notes Personal**。打开 Markdown 笔记，再测试验收项目。只复制文件不等于运行验收成功；没有 UI 能力时告知用户尚需手动验证。
6. 不修改其他插件、不上传笔记或设置、不自动配置登录自启动。不接管已被其他程序或库占用的 Ctrl+D；冲突时报告原因，保留左侧按钮入口。

## 一条命令安装

下载并解压 [安装包](https://github.com/dan9574/always-on-top-personal/releases/latest/download/personal-pinned-notes.zip)，**完全退出 Obsidian**，在解压出的 `personal-pinned-notes` 目录打开 PowerShell。将示例路径换成实际笔记库：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -VaultPath "D:\Notes\MyVault" -Enable
```

不需要 Git、Node.js 或管理员权限。执行策略只作用于此次 PowerShell 进程。预览而不写入：末尾加 `-DryRun`。自定义配置目录追加例如 `-ConfigDir ".obsidian-work"`。省略 `-Enable` 则只安装文件，之后在 Obsidian 中手动启用。

安装目标：`<笔记库>/<配置目录>/plugins/personal-pinned-notes/`。

```text
personal-pinned-notes/
  main.js
  background.cjs     ← 必须安装，不能遗漏
  manifest.json
  styles.css
  data.json          ← 运行后保存个人设置，安装时保留
```

也可以手动复制前四个文件。每次升级都需完全退出再启动 Obsidian，重新加载插件不能清除主进程中的 `background.cjs` 缓存。

### 安装后验收

- 点击左侧“开关置顶笔记”，当前 Markdown 笔记出现在浮窗中，默认只读。
- 切到其他软件，按 **Ctrl+D** 隐藏 / 显示浮窗；不出现第二扇浮窗，也不拉起主窗口。
- 图钉切换置顶；铅笔切换编辑；完成按钮保存并回到阅读模式；眼睛隐藏 / 显示已完成任务，不删除正文。
- 开启 Obsidian 编辑器的“折叠标题”和“折叠缩进”后，验证标题及缩进列表折叠。
- 关闭主窗口后仍可 Ctrl+D 开关；托盘或标题右键“完全退出 Obsidian”后，程序退出，Ctrl+D 不再生效。

## 使用方式

只有一个全局快捷键：**Ctrl+D**。注册成功后会替代其他软件原有的 Ctrl+D；停用插件会释放。Obsidian 必须正在运行，快捷键本身不会启动 Obsidian。多库同时启用时只能有一个库成功占用它。

浮窗记住最后打开的笔记、位置和尺寸。拖动标题移动窗口；手动调整大小后保持你的尺寸，双击标题恢复按内容自动调整高度。每次重新打开回到只读模式；编辑使用 Obsidian 原生实时预览。Office Flow 是可选的独立插件，本项目不附带它。

浮窗隐藏原生窗口控制栏，默认宽 340px、95% 不透明度、13px 正文，左右留白 10px；滚动条悬停时显示。眼睛只改变显示，带未完成子任务的父项保留。浮窗 × 是保存后隐藏，不是退出应用。

关闭主窗口会隐藏到后台，Obsidian 继续占用内存。托盘“置顶笔记”或浮窗标题右键可显示主窗口、开关浮窗、完全退出。停用插件会撤销关闭拦截并恢复隐藏的主窗口。旧插件也在运行时可能出现另一套浮窗，可自行停用以减少重复入口。

## 可选：Windows 登录后后台启动

**此功能尚待实际登录 / 冷启动验收。** 先完成普通安装并启用插件。插件只能在加载后隐藏窗口，不能保证启动瞬间完全不闪现；其他插件打开的窗口不受本插件控制。

在 `%APPDATA%\obsidian\obsidian.json` 中找到与目标库路径对应的 16 位十六进制 ID，不要用库名称代替。在解压包或源码根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-startup.ps1 -VaultId "替换为16位仓库ID"
```

安装在非默认位置时追加 `-ObsidianExe "D:\Apps\Obsidian\Obsidian.exe"`。脚本只设置当前用户 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 中名为 `PinnedNotesPersonal` 的一项。

登录时通过 `--ppn-background` 和专用 URI 打开目标库，隐藏主窗口与本插件恢复的浮窗；正常手动启动不隐藏。完全退出后不会自行重启，下一次登录再启动。移除自启动：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-startup.ps1 -Remove
```

## 更新、回退和卸载

- **更新**：完全退出，下载新包，再运行安装命令。旧插件及启用列表备份到 `<配置目录>/plugin-backups/personal-pinned-notes-时间-随机值/`，脚本输出具体路径。个人 `data.json` 不被覆盖。
- **回退**：完全退出，将备份 `plugin/` 中四个运行文件复制回插件目录，再启动。通常保留当前 `data.json`；需要旧设置时才单独恢复。安装写入失败会尝试恢复运行文件和启用列表，备份保留。
- **卸载**：若设置过自启动，先执行 `-Remove`。在 Obsidian 中停用本插件；完全退出后可删除 `plugins/personal-pinned-notes`。这会删除插件设置，不会删除笔记。

## 从源码构建

需要 Git、Node.js 22 或更新版本和 npm。依赖以 `package-lock.json` 为准。

```powershell
git clone https://github.com/dan9574/always-on-top-personal.git
cd always-on-top-personal
npm.cmd ci
npm.cmd run check
npm.cmd run lint
npm.cmd test
npm.cmd run package
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-install.ps1
```

输出在 `dist/personal-pinned-notes/`，构建不会自动安装。源码根目录也可运行 `scripts/install.ps1`，它优先使用该构建输出。

- `src/main.ts`：原生浮窗、工具栏与编辑生命周期。
- `src/native.ts`、`src/geometry.ts`：窗口桥接、位置及缩放补偿。
- `src/background.ts`、`src/background-entry.ts`：后台运行、托盘和退出。
- `src/shortcut.ts`：全局快捷键注册和释放。
- `src/filter.ts`、`src/completed.ts`：任务显示过滤。
- `scripts/`：打包、Windows 安装和登录自启动。
- `tests/`：回归测试；开发细节见 [DEVELOPMENT.md](DEVELOPMENT.md)。

原项目历史保留用于来源追溯；`old/` 是本机忽略的旧源码存档，不上传或打包。本仓库没有自动更新器，也未提交到 Obsidian 社区插件目录；更新使用本仓库 Release。
