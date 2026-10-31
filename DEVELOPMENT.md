# 开发状态

当前插件：Pinned Notes Personal，ID `personal-pinned-notes`，版本 `0.1.1`。

开发分支仍为 `personal/main`，历史起点为原项目 0.7.0；新入口和功能实现位于根目录 src，旧源码及工作流已归档到 old 并忽略。保留 MIT 许可证和来源说明。

重点验收：其他应用前台时 Ctrl+D 开关；主窗口和浮窗内相同按键只执行一次；原生标题与缩进列表折叠；图钉切换；眼睛只影响浮窗显示；连续开关不重复开窗；保存失败时不关闭编辑器；插件停用后释放快捷键。

使用 npm.cmd run check、npm.cmd run lint、npm.cmd test、npm.cmd run package 验证。测试仅扫描 tests，不会运行 old/tests。

2026-10-20：在 Windows / Obsidian 1.14.4 中实测通过：其他应用前台 Ctrl+D 开关、浮窗内 Ctrl+D 关闭、反复开关仅一扇浮窗、置顶开关与窗口遮挡、原生标题和缩进折叠、眼睛过滤保留正文、编辑关闭后保存及再次打开、停用后释放快捷键。使用独立临时笔记测试，完成后已清理。类型检查、ESLint、12 项自动测试和生产打包通过。保存失败处理已实现，但未在实际笔记库人为制造磁盘故障。

请勿将 `.obsidian`、笔记内容或插件 data.json 提交到仓库。开发包不自动安装到用户笔记库。Git 远程 upstream 仅保留来源，不是当前分支的跟踪分支；不要直接合并原作者主分支。

外观修复：仅在包含 `.ppn-note` 的 popout 隐藏原生窗口栏；340px 初始宽度、95% 不透明度和 13px 紧凑排版已在当前宿主实测。停用插件恢复完全不透明。原生滚动行为保留，滚动条仅悬停时显示细条。

后续回归修复：Windows 当前缩放下，原生 setBounds 写回 getBounds 的宽高会增加约 1px；旧 setPosition 路径反复保留膨胀后的尺寸，造成拖动越拖越大。现用一次手势开始时的固定宽高，保留 pointer event 自带的位置，并进行一次有界的原生边界误差补偿。禁止重新用 OS 实时鼠标位置替代排队事件的位置，也不要递归纠偏。回归测试模拟该膨胀行为，连续 200 次移动及恢复尺寸不累积误差。

默认每次打开为原生阅读模式，笔形按钮切换实时预览编辑器，完成后保存再回到阅读模式。自动高度只测量阅读内容，编辑时保持现有高度；原生 will-resize 将自动高度关闭，双击自定义标题栏可恢复。浮窗关闭现在保存后调用 native.hide()，不再 detach；复用原生编辑器，避免销毁渲染上下文后使共享 IPC 失效。

实测：连续拖动保持 350×324；手动缩放为 320×295 后，Ctrl+D 关闭重开、插件停用再启用均恢复相同尺寸和坐标 (418, 240)；恢复自动高度后，原生 Course 标题折叠让高度由约 322 缩至 245。编辑模式中原生编辑器及 Office Flow 子任务、笔记按钮正常出现。19 项自动测试、类型检查、ESLint 和打包通过。日常笔记正文未作修改。

后台运行：新增 `background.cjs`，必须随 `main.js` 安装。通过 remote.require 在主进程同步拦截主窗口 close；renderer 的异步 remote 回调无法可靠取消关闭。保留宿主监听器，并在当前事件处理结束后清理宿主 closing 标记。before-quit / Windows session-end 放行正常退出；禁用、重载或 renderer 崩溃会清理托盘和本插件监听器，恢复隐藏的主窗口。

主窗口 ID 必须优先使用 `window.electronWindow.id`，不能依赖共享 remote 模块的 getCurrentWindow，它可能指向最后恢复的浮窗甚至已释放的上下文。隐藏主窗口期间保持 backgroundThrottling=false，停用时恢复旧值，避免 Markdown 渲染调度暂停导致新浮窗空白。主进程模块由 Node 缓存，更新后台模块后需要完全退出再启动宿主。

后台版本验收：主窗口 × 后从记事本 Ctrl+D 首次打开可正常渲染；连续开关复用同一原生窗口，主窗口保持隐藏；后台编辑可见 Office Flow 控件，编辑模式关闭重开回到只读；浮窗右键可恢复主窗口或完全退出。最终版本完全退出后实际检查 Obsidian 进程数为 0。类型检查、ESLint、27 项测试与打包通过。

登录自启版本：脚本仅设置当前用户 Run/PinnedNotesPersonal，使用独立启动参数和专用 Obsidian URI 定位仓库。后台模块在插件 onload 尽早安装，冷启动参数只对每个主窗口消费一次；主窗口 show 事件在首次主动恢复前被隐藏，手动启动不隐藏。恢复个人浮窗时跳过 show/focus。29 项测试、类型检查、ESLint 和打包通过；冷启动实测尚未完成，不能承诺插件加载之前完全无闪现。

2026-10-30（0.1.1）：浮窗标题栏新增主窗口开关按钮（`app-window` 图标，排在铅笔前）。主窗口可见且未最小化时按钮为粉色（`--color-pink`），再按一下直接 `main.hide()`，与主窗口 × 后的状态一致；隐藏或最小化时按下走 `showMainWindow()`：优先 `background.showMain()`，后台模块不可用时直接 restore / show / focus。只有后台模块（托盘）装上时才允许隐藏。通过 `window.electronWindow` 监听主窗口 show / hide / minimize / restore 同步按钮状态，停用时移除监听。命令"显示 Obsidian 主窗口"同样走 `showMainWindow()`。类型检查、ESLint、29 项测试和生产打包通过；按钮本身未加自动测试，需在 Windows 实测：点击前置主窗口、再点隐藏、× 关闭主窗口后按钮变灰。

公开发行准备：README 提供 AI 安装约定和无需 Node.js 的 Windows Release 安装步骤。scripts/install.ps1 支持预览、自定义配置目录、旧插件备份、保留个人设置、追加启用列表及写入失败回退。scripts/test-install.ps1 在独立临时目录模拟已退出 / 正在运行的宿主，验证安装行为，不操作真实笔记库。发行包必须包含 background.cjs 及安装、自启动脚本；只上传新发布标签，不推送上游旧版本标签。
