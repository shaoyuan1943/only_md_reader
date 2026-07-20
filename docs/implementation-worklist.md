# MD 极简阅读实现工作列表

> 用法：每完成一项，把对应行的 `[ ]` 改为 `[x]`，并填写 `完成时间：YYYY-MM-DD HH:mm`。
> 只在完成验收标准后打勾；如果只是部分完成，保持未勾选，并在该项下方追加 `进展：...`。
>
> 执行规则：每一项下面的 `验收标准：` 都是该项的验收标准。完成任何一项后，必须先按该项验收标准实际测试；测试通过后，在该项下方追加 `验证记录：...`，再打勾并填写完成时间。向用户汇报时必须包含：完成项编号、验收标准、实际测试结果、未验证项或已知限制。

## 0. 当前基线

- 产品定位：纯 Markdown 阅读器，不做完整 Markdown 编辑器。
- 桌面框架：Tauri 2。
- 前端框架：React + TypeScript + Vite。
- Rust 层：负责窗口、文件、设置、持久化、系统集成。
- Markdown 管线：unified / remark / rehype。
- 数学公式：KaTeX，本地打包资源。
- 代码高亮：Shiki，本地打包主题资源。
- 默认代码块主题：VS Code Eva Theme，亮色使用 Eva Light Bold，暗色使用 Eva Dark Bold。
- 默认字体：Maple Mono NF CN，随应用打包。
- 主题方案：本地 JSON design tokens -> CSS variables。
- 资源策略：运行时资源全部包内加载，禁止 CDN 和远程资源依赖。
- 设置持久化：Tauri 应用数据目录下的 JSON 文件。
- 阅读位置：按 Markdown 文件持久化。
- 批注：最后阶段实现，采用 CriticMarkup 写回源文件。

## 1. 前置环境与仓库状态

- [x] 1.1 确认项目 Git 状态可用。完成时间：2026-06-26 18:07
  - 目标：`git status --short --branch` 可以正常运行。
  - 验收标准：能看到当前分支和变更列表；如果 `.git` 状态异常，先修复或重新初始化仓库边界。
  - 验证记录：初始执行 `git status --short --branch` 返回 `fatal: not a git repository`；检查发现 `.git` 目录存在但缺少 `HEAD`，执行 `git init` 重建仓库边界后，`git status --short --branch` 正常输出 `## No commits yet on master` 并列出未跟踪文件。

- [x] 1.2 确认 Node.js 和 pnpm 可用。完成时间：2026-06-26 18:07
  - 目标：使用 `pnpm` 作为前端包管理器。
  - 验收标准：`node -v`、`pnpm -v` 正常输出版本。
  - 验证记录：执行 `node -v` 输出 `v22.17.1`；执行 `pnpm -v` 输出 `11.7.0`。

- [x] 1.3 安装并确认 Rust 工具链。完成时间：2026-06-26 18:07
  - 目标：Tauri 2 构建所需 Rust/Cargo 可用。
  - 验收标准：`rustc -V`、`cargo -V` 正常输出版本。
  - 验证记录：初始执行 `rustc -V`、`cargo -V` 时当前 Codex PowerShell 进程未识别命令；通过 `winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements` 安装 Rustup 后，当前会话补入 `%USERPROFILE%\.cargo\bin` 再执行 `rustc -V` 输出 `rustc 1.96.0 (ac68faa20 2026-05-25)`，`cargo -V` 输出 `cargo 1.96.0 (30a34c682 2026-05-25)`。用户级 PATH 已包含 `%USERPROFILE%\.cargo\bin`，新终端会话应可直接识别；当前 Codex 进程因启动早于安装，仍需临时补 PATH。

- [x] 1.4 确认 Windows Tauri 构建依赖。完成时间：2026-06-26 18:07
  - 目标：WebView2、MSVC Build Tools、Windows SDK 满足 Tauri 构建要求。
  - 验收标准：能运行 Tauri 官方环境检查或成功构建最小 Tauri 应用。
  - 验证记录：执行 `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; pnpm dlx @tauri-apps/cli@2 info` 成功退出；环境检查显示 WebView2 `149.0.4022.80`、MSVC `Visual Studio Community 2022`、rustc `1.96.0`、cargo `1.96.0`、Rust toolchain `stable-x86_64-pc-windows-msvc (default)`、node `22.17.1`、pnpm `11.7.0`。

- [x] 1.5 建立示例 Markdown 测试文件集。完成时间：2026-06-26 18:07
  - 建议目录：`fixtures/markdown/`。
  - 覆盖：基础语法、GFM 表格、任务列表、相对图片、长代码块、宽表格、公式、恶意 HTML、中文路径、大文件。
  - 验收标准：后续渲染、截图和回归测试都能复用这些样本。
  - 验证记录：新增并检查 `fixtures/markdown/basic-syntax.md`、`fixtures/markdown/gfm-table-task-list.md`、`fixtures/markdown/relative-image.md`、`fixtures/markdown/assets/relative-image.svg`、`fixtures/markdown/long-code-wide-table.md`、`fixtures/markdown/math.md`、`fixtures/markdown/malicious-html.md`、`fixtures/markdown/中文路径/说明.md`、`fixtures/markdown/large-document.md`。静态覆盖检查确认样本文件全部存在，分别覆盖基础语法、GFM 表格/任务列表、相对图片、长代码块/宽表格、公式、恶意 HTML、中文路径和大文件；`large-document.md` 大小为 `1383437` bytes，大于 1 MiB。

## 2. 项目脚手架

- [x] 2.1 初始化 Tauri 2 + React + TypeScript + Vite 项目。完成时间：2026-06-26 18:43
  - 目标文件/目录：`package.json`、`pnpm-lock.yaml`、`src/`、`src-tauri/`。
  - 验收标准：`pnpm install`、`pnpm tauri dev` 能启动空应用。
  - 验证记录：使用 Tauri 2 官方 React TypeScript 模板建立根目录脚手架，生成 `package.json`、`pnpm-lock.yaml`、`src/`、`src-tauri/`、`vite.config.ts`、`tsconfig.json` 等基础文件；执行 `pnpm install` 退出码为 0。执行 `pnpm tauri dev` 烟测时，日志出现 `Local: http://localhost:1420/`、`Finished \`dev\` profile`、`Running \`target\debug\only-md-reader.exe\``，并检测到 `only-md-reader` 进程后主动关闭，证明空应用可启动。

- [x] 2.2 建立前端目录结构。完成时间：2026-06-26 18:43
  - 建议目录：
    - `src/features/open-file/`
    - `src/features/reader/`
    - `src/features/settings/`
    - `src/features/markdown/`
    - `src/shared/theme/`
    - `src/shared/ui/`
    - `src/shared/fonts/`
  - 验收标准：目录职责清晰，后续功能不堆在单个大文件中。
  - 验证记录：已建立 `src/features/open-file/`、`src/features/reader/`、`src/features/settings/`、`src/features/markdown/`、`src/shared/theme/`、`src/shared/ui/`、`src/shared/fonts/`，每个目录包含 README 说明职责；执行路径检查确认全部存在。

- [x] 2.3 配置 TypeScript、Lint、Format。完成时间：2026-06-26 18:43
  - 目标：TypeScript strict、ESLint、Prettier 或等效格式化工具。
  - 验收标准：`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 可运行。
  - 验证记录：`tsconfig.json` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`；新增 `eslint.config.js`、`.prettierrc.json`、`.prettierignore`。执行 `pnpm typecheck` 通过，执行 `pnpm lint` 通过，执行 `pnpm format:check` 通过。

- [x] 2.4 配置 Rust 格式化和静态检查。完成时间：2026-06-26 18:43
  - 目标：`cargo fmt`、`cargo clippy` 可运行。
  - 验收标准：Rust 侧空项目检查通过。
  - 验证记录：执行 `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` 通过；执行 `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings` 通过，输出 `Finished \`dev\` profile`。

- [x] 2.5 建立基础命令脚本。完成时间：2026-06-26 18:43
  - 建议命令：`dev`、`build`、`tauri:dev`、`tauri:build`、`test`、`typecheck`、`lint`。
  - 验收标准：`pnpm run` 能列出并执行核心命令。
  - 验证记录：`package.json` 已配置 `dev`、`build`、`tauri:dev`、`tauri:build`、`test`、`typecheck`、`lint`、`format`、`format:check`、`preview`、`tauri`。执行 `pnpm run` 可列出上述命令；执行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。

## 3. 设计资源与主题系统

- [x] 3.1 从 `docs/ui/ui_colors.html` 提取 Warm Paper 主题 token。完成时间：2026-06-27 18:47
  - 目标文件：`src/shared/theme/themes/warm-paper.json`。
  - 验收标准：明亮和暗色主题字段完整，覆盖背景、文本、控件、表格、代码块、阴影、焦点、禁用态。
  - 验证记录：新增 `src/shared/theme/themes/warm-paper.json`，从 `docs/ui/ui_colors.html` 提取 Warm Paper light/dark 两套 token，覆盖背景、surface、文本、标题、链接、mark、引用、表格、代码块、按钮、输入控件、下拉菜单、开关、焦点、禁用态和阴影。执行 `pnpm test` 时 `Warm Paper bundle contains complete light and dark token sets` 通过，确认 light/dark 字段完整。

- [x] 3.2 定义主题 token TypeScript 类型和校验逻辑。完成时间：2026-06-27 18:47
  - 目标文件：`src/shared/theme/theme-schema.ts`。
  - 验收标准：缺字段、非法颜色、非法模式能被检测并给出明确错误。
  - 验证记录：新增 `src/shared/theme/theme-schema.ts` 和 `src/shared/theme/theme-schema.test.ts`，定义 `ThemeTokenBundle`、`ThemeTokens`、`ThemeModeSetting`、`THEME_TOKEN_KEYS`，并实现 `validateThemeTokenBundle()`、`assertThemeMode()`。执行 `pnpm test` 通过 8 个主题单元测试，其中覆盖缺失 `modes.light.codeBg`、非法 `modes.dark.buttonPrimaryBg`、非法 `sepia` 模式和非法 `themeMode` 的错误路径。

- [x] 3.3 实现 JSON token 到 CSS variables 的注入。完成时间：2026-06-27 18:47
  - 目标文件：`src/shared/theme/apply-theme.ts`。
  - 验收标准：切换 light/dark/system 时，根节点 CSS variables 正确更新。
  - 验证记录：新增 `src/shared/theme/apply-theme.ts` 和 `src/shared/theme/apply-theme.test.ts`，实现 `getThemeCssVariables()` 与 `applyTheme()`。执行 `pnpm test` 通过，确认 token 会映射为 `--app-bg`、`--button-primary-bg`、`--dropdown-option-selected-bg` 等 CSS variables，并确认 `systemPrefersDark: true` 时 system 解析为 dark。浏览器验证 `http://127.0.0.1:1420/` 时根节点 `data-theme-id="warm-paper"`、`data-theme-mode="system"`、`--app-bg=#151210`、`--button-primary-bg=#C28A63`；通过 CDP 模拟 `prefers-color-scheme: light` 后刷新，验证 `--app-bg=#EDE4D7`、`--button-primary-bg=#8A5A3C`、`--dropdown-option-selected-bg=#E7D3BD`。

- [x] 3.4 建立全局主题 CSS。完成时间：2026-06-27 18:47
  - 目标文件：`src/shared/theme/theme.css`。
  - 验收标准：组件只使用 `var(--token-name)`，不散落硬编码十六进制颜色。
  - 验证记录：新增 `src/shared/theme/theme.css`，并在 `src/main.tsx` 导入主题 CSS、字体 CSS、Warm Paper JSON 和 `applyTheme()`；`src/App.css` 已移除原有根级硬编码颜色，正文副标题颜色改为 `var(--text-secondary)`。执行 `pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。浏览器 DOM 快照确认页面非空，控制台 error/warn 数量为 0。

- [x] 3.5 打包 Maple Mono NF CN 字体。完成时间：2026-06-27 18:47
  - 建议目录：`src/assets/fonts/maple-mono-nf-cn/`。
  - 验收标准：通过 `@font-face` 注册；未安装该字体的机器仍能使用随包字体渲染正文和代码。
  - 验证记录：新增 `src/assets/fonts/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf`、`MapleMono-NF-CN-Italic.ttf`、`MapleMono-NF-CN-Bold.ttf`、`MapleMono-NF-CN-BoldItalic.ttf`，并新增 `src/shared/fonts/maple-mono-nf-cn.css` 注册 400/700 normal/italic 四个 `@font-face`。字体元数据确认 family 为 `Maple Mono NF CN`，版本 `7.900`，license 为 SIL Open Font License 1.1；新增 `src/assets/fonts/maple-mono-nf-cn/ATTRIBUTION.md` 记录 attribution。执行 `pnpm build` 后 `dist/assets/` 包含 4 个 MapleMono 字体产物，浏览器样式表检查确认存在 4 条 `@font-face` 规则。

- [x] 3.6 验证字体回退。完成时间：2026-06-27 18:47
  - 目标：字体资源加载失败时回退系统字体栈。
  - 验收标准：禁用或改名字体文件后，应用不白屏，文字仍可读。
  - 验证记录：构建产物 CSS 中 `font-family` 为 `"Maple Mono NF CN", system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`。复制 `dist/` 到临时目录后把 4 个 MapleMono `.ttf` 改名为 `.ttf.disabled`，通过本地静态服务器打开 `http://127.0.0.1:1422/`；浏览器验证页面仍显示 `Only MD Reader` 和 `Markdown reader shell is ready.`，根节点主题变量仍存在，控制台 error/warn 数量为 0。当前 Windows 机器本身已安装 Maple Mono NF CN，因此未在一台完全未安装 Maple Mono NF CN 的干净机器上做实机验证；本项已验证字体资源缺失时不会白屏且 CSS 回退栈存在。

## 4. 打开文件窗口

- [x] 4.1 实现打开文件窗口静态 UI。完成时间：2026-06-27 21:45
  - 参考：`docs/ui/open-file.html`。
  - 验收标准：打开按钮居中，最近文件列表在按钮下方，每项两行显示文件名和路径。
  - 验证记录：新增 `src/features/open-file/OpenFileWindow.tsx` 和对应 CSS，首屏参考 `docs/ui/open-file.html` 的 Warm Paper 打开窗口；入口 HTML 标题改为 `Only MD Reader`，并移除默认 Vite 图标引用。执行 `pnpm test` 通过 20 个 node:test 测试并通过 `tsc --noEmit`；执行 `pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。通过内置浏览器打开 `http://127.0.0.1:1420/` 验证 DOM 和截图：页面标题为 `Only MD Reader`，页面包含 `MD 极简阅读`、`打开 Markdown 文件`、`最近使用`；打开按钮计数为 1 且可用；最近使用区域位于按钮下方；控制台 `error/warn` 数量为 0；普通浏览器预览点击打开按钮后显示“文件选择器只能在桌面环境中使用。”，不会出现 `Cannot read properties of undefined (reading 'invoke')` 或白屏。2026-06-27 追加修正：`src-tauri/tauri.conf.json` 将主窗口固定为 `800x600`，并设置 `minWidth/maxWidth/minHeight/maxHeight` 同值、`resizable: false`、`maximizable: false`；`src/App.css` 对 `html/body/#root` 和打开文件 shell 设置固定视口高度与 `overflow: hidden`，压缩打开页垂直间距，避免 release exe 中出现滚动条。新增 `src/app-shell.test.ts` 断言固定窗口和无文档滚动条；复验 `pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`、`pnpm tauri build` 均通过；重新生成并启动 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，进程路径确认来自 release exe。2026-06-27 追加修正：移除按钮下方的“正在打开文件 / 已取消选择 / 已打开文件”等操作描述，只保留真实错误提示；新增 `src/features/open-file/open-file-status.ts` 和测试断言非错误状态不渲染辅助状态文本、错误状态仍显示失败原因；复验 `pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`、`pnpm tauri build` 均通过，并重新启动最新 release exe。2026-06-27 追加修正：固定 `800x600` 打开窗口只展示最近 3 条记录，新增 `VISIBLE_RECENT_FILE_LIMIT = 3` 和 `recent file view model exposes only the three latest files for the fixed open window` 测试；压缩打开窗口垂直间距、图标、按钮和最近文件项行高，使 3 条两行历史记录可完整容纳且不出现滚动条；修正 Tauri release WebView 运行时检测，避免 release exe 误走浏览器预览空列表 API；复验 `pnpm test` 通过 27 项、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`、带 Rust PATH 的 `pnpm tauri build` 均通过；向 `%APPDATA%\com.onlymd.reader\recent-files.json` 写入 3 条无 BOM UTF-8 测试记录后启动 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，Windows 窗口截图和可访问文本均确认显示 `basic-syntax.md`、`gfm-table-task-list.md`、`long-code-wide-table.md` 三条最近文件，窗口内无滚动条。
  - 追加验证记录：2026-06-28 明确打开文件窗口 UI 规则：外层打开文件卡片到窗口内容区上、下、左、右四边距离必须一致。`src/App.css` 新增统一变量 `--open-file-window-inset: 18px`，`.app-shell` 改为 `padding: var(--open-file-window-inset)`，并移除小窗口媒体查询中的非对称 `padding: 18px 14px`。新增 `open file card uses the same inset on every window edge` 单测，先确认旧 CSS `padding: 18px 24px` 会失败，再改为统一 inset 后通过。复验 `pnpm test` 28 项通过、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`、带 Rust PATH 的 `pnpm tauri build` 均通过；生产构建产物 `dist/assets/index-CrwxPDUg.css` 确认包含 `--open-file-window-inset: 18px` 和 `padding: var(--open-file-window-inset)`。已启动最新 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`；本轮 Windows 截图自动化被系统以 `GetCursorPos failed: 拒绝访问。 (0x80070005)` 拒绝，因此未把截图作为通过证据。
  - 追加验证记录：2026-06-28 明确后续配色规则：UI 配色以 `docs/ui/ui_colors.html` 为源头，运行时代码通过 `src/shared/theme/themes/warm-paper.json` 派生的 CSS variables 使用对应 token。暗色主题中，打开文件外层背景使用 `appBg = #151210`，中间打开文件卡片使用 `surfaceBg = #211C17`；明亮主题对应 `appBg = #EDE4D7`、`surfaceBg = #F8F2EA`。`src/App.css` 将 `.open-file-window` 从 `background: var(--app-bg)` 改为 `background: var(--surface-bg)`，`.app-shell` 继续使用 `var(--app-bg)`。新增 `open file shell and card use ui_colors background tokens` 回归测试，先确认旧实现失败，再修正后通过。复验 `pnpm test` 29 项通过、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri\Cargo.toml` 3 项通过、`cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings`、带 Rust PATH 的 `pnpm tauri build` 均通过；生产构建产物 `dist/assets/index-p2eapUyI.css` 确认 `.app-shell` 包含 `var(--app-bg)` 且 `.open-file-window` 包含 `background: var(--surface-bg)`。已重新生成并启动 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，进程路径确认来自 release exe；Windows 截图自动化仍被系统以 `GetCursorPos failed: 拒绝访问。 (0x80070005)` 拒绝，因此本轮未把截图作为通过证据。
  - 追加验证记录：2026-06-28 根据截图反馈修正打开按钮阴影：旧实现中 `.open-file-center` 使用 `overflow: hidden`，导致按钮下方投影在最近文件标题区域上边界被裁成一条齐边；`src/App.css` 改为让 `.open-file-center` 使用 `overflow: visible`，最近文件列表自身仍保持 `overflow: hidden`，并把 `.primary-open-button` 的单层 `0 18px 38px` 浓阴影改为 `0 22px 56px`、`0 8px 20px`、`0 1px 0` 的多层低浓度扩散阴影，颜色仍通过 `var(--button-primary-bg)` 派生。新增 `primary open button shadow can diffuse without being clipped by its group` 回归测试，先确认旧 CSS 失败，再修正后通过。复验 `pnpm test` 30 项通过、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri\Cargo.toml` 3 项通过、`cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings`、带 Rust PATH 的 `pnpm tauri build` 均通过；生产构建产物 `dist/assets/index-Cghvdt8X.css` 确认包含 `overflow:visible`、`0 22px 56px` 和 `0 8px 20px`。已启动最新 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，Windows 自动化截图和可访问文本确认 release 窗口显示打开按钮、最近使用标题以及 `basic-syntax.md`、`gfm-table-task-list.md`、`long-code-wide-table.md` 三条最近文件；截图中按钮阴影不再呈现两侧齐切硬边，窗口仍无滚动条。
  - 用户验收记录：2026-06-28 12:13 用户确认“这次好多了，测试通过”，打开文件窗口按钮阴影修正通过人工验收。

- [x] 4.2 接入 Tauri 文件选择器。完成时间：2026-06-27 21:45
  - 目标：只允许选择 `.md` / `.markdown` 文件。
  - 验收标准：选择合法文件后进入阅读窗口；取消选择不报错。
  - 验证记录：新增 `src/features/open-file/open-file-dialog.ts` 和 `src/features/open-file/open-file-api.ts`，接入 `@tauri-apps/plugin-dialog`，dialog options 固定为 `multiple: false`、`directory: false`、`extensions: ["md", "markdown"]`；取消选择通过 `normalizeDialogSelection(null)` 返回 `null`，不会进入错误状态。新增 Rust 命令 `open_markdown_file`，合法 `.md` / `.markdown` 会读取文件内容并写入最近文件；非法扩展名返回明确错误。打开成功后 `App` 会切换到 `ReaderPreviewWindow` 阅读占位窗口，显示文件名、路径和原始 Markdown 内容；完整 Markdown 渲染和正式阅读布局仍归第 6、7 项。`src-tauri/capabilities/default.json` 只新增 `dialog:allow-open` 权限。最终复验执行 `pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` 均通过；执行 `pnpm tauri build` 成功生成 `src-tauri/target/release/only-md-reader.exe` 以及 Windows MSI/NSIS 包，证明 Tauri 插件、命令注册和权限配置可构建。
  - 追加验证记录：2026-07-02 扩展打开文件入口：`OpenFileWindow` 在 Tauri runtime 中监听 `getCurrentWindow().onDragDropEvent()`，只处理 `drop` 事件，通过 `getFirstMarkdownDropPath()` 接受首个 `.md` / `.markdown` 文件，非 Markdown 拖入显示“请拖入 .md 或 .markdown 文件。”；按钮选择、最近文件点击和拖入文件共用 `openPath()`。`tauriOpenFileApi.openMarkdownFile()` 调用 `open_reader_window` 时传入 `sourceWindowLabel: getCurrentWindow().label`，由 Rust 在 reader 创建/聚焦成功后关闭来源打开文件窗口。新增/复验 `drop path extraction accepts the first markdown file and ignores other items`、`drop path extraction rejects drops without markdown files`、`open file window passes its source label and supports markdown drag drop`。执行 `pnpm test:unit` 141 项通过。

- [x] 4.3 实现最近打开文件列表。完成时间：2026-06-27 21:45
  - 存储：由 Rust 层本地持久化，可放入 `recent-files.json` 或窗口状态文件。
  - 验收标准：重启应用后最近列表仍存在；不存在的文件有明确状态或自动清理。
  - 验证记录：新增 `src-tauri/src/recent_files.rs`，最近文件存储到 Tauri `app_data_dir()/recent-files.json`，使用 `schemaVersion: 1` 和原子临时文件写入后 rename；按路径去重，按 `openedAt` 倒序，最多保留 12 项。Rust 单测覆盖 `.md` / `.markdown` 大小写识别、重复路径更新到列表顶部、从持久化 JSON 重新读取、缺失文件标记 `exists: false` 且不丢弃。前端 `createRecentFileViewModels()` 把每项渲染为文件名和路径两行，缺失文件显示 `文件不存在`。执行 `pnpm test` 通过前端最近文件排序/两行显示/缺失状态测试；执行 `cargo test --manifest-path src-tauri/Cargo.toml` 通过 3 个 Rust 最近文件测试。

- [x] 4.4 支持从最近文件打开。完成时间：2026-06-27 21:45
  - 验收标准：点击最近文件能打开对应阅读窗口；路径失效时显示错误，不白屏。
  - 验证记录：`OpenFileWindow` 中最近文件项点击会调用 `openMarkdownFile(path)`，成功后刷新最近列表并通过 `onFileOpened` 切换到 `ReaderPreviewWindow` 阅读占位窗口；该窗口显示文件名、路径和原始 Markdown 内容，并提供返回打开窗口按钮。路径失效、非法扩展名或读取失败时显示 Rust 返回的明确错误，并刷新最近列表，不会白屏。前端单测覆盖缺失文件 view model 的 `文件不存在` 状态，以及阅读占位窗口 view model 的文件名、路径和原始内容输出；Rust 单测覆盖缺失路径从 `recent-files.json` 读取后标记 `exists: false`；浏览器预览验证空最近列表状态无控制台错误且页面非空。完整 Markdown 渲染、正式大纲和多窗口阅读模型仍在第 5、6、7 项继续实现。
  - 追加验证记录：2026-07-02 调查历史文件点击时 UI 闪一下：旧路径在 `OpenFileWindow.openPath()` 成功后会先进入 loading/ready 状态、刷新最近列表并保留打开文件窗口，历史列表重排/React 重绘会被用户看到；现在成功打开 reader 后由后端关闭 source window，且成功路径不再调用 `setRecentFiles(await api.listRecentFiles())`，错误路径仍刷新最近列表以展示缺失文件状态。真实 release exe 验证：正常启动打开文件窗口后，通过 WebView2 CDP 在 `main` 窗口调用 `open_reader_window` 并传入 `sourceWindowLabel: "main"`，返回 `created: true`、reader label `reader-e48726524391b117`；8 秒后 Win32 枚举只有一个真实 `Tauri Window`，标题为 `gfm-table-task-list.md - MD 极简阅读` 且 `IsZoomed = true`，另一个 16x16 `Tao Thread Event Target` 是事件辅助窗口，不是打开文件窗口。

## 5. 单文件单窗口模型

- [x] 5.1 实现文件路径规范化。完成时间：2026-06-29 15:56
  - 目标：Rust 层把传入路径统一为规范化绝对路径。
  - 验收标准：同一文件不同路径写法不会创建多份窗口状态。
  - 验证记录：新增 `src-tauri/src/reader_windows.rs`，`normalize_markdown_path()` 在 Rust 层校验 `.md` / `.markdown` 扩展名、执行 `canonicalize()` 并确认目标是文件；Windows 下窗口注册 key 使用大小写折叠，窗口 label 由规范化路径稳定 hash 生成。Rust 单测覆盖相对路径形态归一为同一个绝对规范路径、非法扩展名和缺失文件会在窗口创建前返回错误。

- [x] 5.2 实现窗口注册表。完成时间：2026-06-29 15:56
  - 目标：Rust 层维护 `filePath -> windowLabel`。
  - 验收标准：能判断文件窗口是否已经存在。
  - 验证记录：新增 `ReaderWindowRegistry`，由 Tauri `manage()` 注入应用状态，维护规范化文件路径到 `reader-*` 窗口 label 的映射；窗口销毁时通过 `on_window_event(reader_windows::handle_window_event)` 移除注册项。`src/app-shell.test.ts` 静态回归确认注册表、窗口事件处理、`open_reader_window` 命令和 `reader-*` capability 已接入。

- [x] 5.3 实现重复打开聚焦已有窗口。完成时间：2026-06-29 15:56
  - 验收标准：同一文件窗口仍存在时，再次打开只聚焦，不重新加载，不重置滚动位置。
  - 验证记录：`open_reader_window` 已改为 async Tauri command，避免同步命令在 WebView2/Windows 上创建窗口时卡在 `about:blank`；重复打开时先查注册表和现存 `WebviewWindow`，存在则 `set_focus()` 并返回 `created: false`，不重新读取文件内容或重建窗口。真实 Tauri dev 烟测通过 CDP 调用 `open_reader_window("fixtures/markdown/basic-syntax.md")` 两次，第一次返回 `created: true`、label `reader-1e4aad26d25a5d15`，第二次 300ms 内返回同一 label 且 `created: false`。

- [x] 5.4 实现不同文件多窗口。完成时间：2026-06-29 15:56
  - 验收标准：打开不同 Markdown 文件会创建独立 Tauri 窗口。
  - 验证记录：reader 窗口使用 `WebviewWindowBuilder::new(app, &window_label, WebviewUrl::App("index.html".into()))` 创建，Rust 注入 `window.__ONLY_MD_READER_BOOTSTRAP__` 后由 React 入口渲染 `ReaderPreviewWindow`。真实 Tauri dev 烟测中打开 `basic-syntax.md` 后再打开 `gfm-table-task-list.md`，第二个文件返回不同 label `reader-e48726524391b117` 且 `created: true`；WebView2 CDP target 列表包含主窗口加两个 reader 页面，共 3 个 page target。

- [x] 5.5 实现命令行传入文件路径打开。完成时间：2026-06-29 15:56
  - 验收标准：从命令行传入 `.md` 路径能启动应用并打开文件。
  - 验证记录：`setup()` 阶段调用 `open_startup_markdown_arg()`，从 `std::env::args_os()` 中选择第一个受支持的 Markdown 路径并打开 reader 窗口。单独启动 `src-tauri/target/debug/only-md-reader.exe E:\only_md_reader\fixtures\markdown\long-code-wide-table.md`，通过 WebView2 CDP 验证其中一个页面的 `window.__ONLY_MD_READER_BOOTSTRAP__.windowKind === "reader"`、`fileName === "long-code-wide-table.md"`，页面正文显示该文件路径和原始 Markdown 内容；主打开文件窗口仍保留。最终复验执行 `pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`pnpm tauri build` 均通过。
  - 追加验证记录：2026-07-02 修正启动参数路径：`src-tauri/src/lib.rs` 在 setup 中先调用 `open_startup_markdown_arg(app.handle())?`，只有未命中启动 Markdown 时才 `create_main_window(app)?`，避免通过默认程序/命令行打开 Markdown 时先显示打开文件窗口。`src/app-shell.test.ts` 静态断言 `open_startup_markdown_arg(app.handle())?` 出现在 `create_main_window(app)?` 之前。真实 release exe 验证：启动 `src-tauri\target\release\only-md-reader.exe E:\only_md_reader\fixtures\markdown\basic-syntax.md`，WebView2 CDP 只有 1 个 page target；页面 `window.__ONLY_MD_READER_BOOTSTRAP__.windowKind === "reader"`、`fileName === "basic-syntax.md"`、正文包含该文件内容，`hasOpenFileTitle = false`，确认不再先打开打开文件窗口。

## 6. 阅读窗口基础

- [x] 6.1 实现阅读窗口静态 UI。完成时间：2026-06-29 17:31
  - 参考：`docs/ui/reader.html`。
  - 验收标准：左侧大纲区、右侧阅读区、右下角设置齿轮布局正确；阅读窗口采用已确认的左右卡片式排布，左侧大纲卡片和右侧阅读卡片通过阴影区分层级，不使用硬分割线；明亮和暗色主题都符合 `docs/ui/ui_colors.html` 配色；1920x1080 下比例符合原型。
  - 验证记录：新增 `ReaderPreviewWindow` 基础阅读窗口结构，包含顶部文件名、左侧大纲卡片、右侧阅读卡片、原始 Markdown 占位正文和右下角设置齿轮；样式使用 Warm Paper token CSS variables，左右卡片显式使用 `var(--surface-bg)` 和 `var(--panel-shadow)`，并移除旧预览页的 `border-right` 硬分割线。执行 `pnpm test` 通过 49 项前端单元/类型检查，其中 `reader window uses floating outline and reading cards without hard dividers` 覆盖左右卡片和无硬分割线；执行 `pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。执行 `pnpm tauri build` 成功生成 release exe 和安装包。端内验证：从 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe` 启动并打开 `E:\only_md_reader\fixtures\markdown\basic-syntax.md`，Computer Use 捕获到 Tauri 窗口标题 `basic-syntax.md - MD 极简阅读`，截图显示左侧大纲卡片、右侧阅读卡片和右下角齿轮；可访问文本包含 `Markdown 阅读窗口`、`大纲区域`、`暂无大纲`、`设置`。
  - 追加验证记录：2026-06-29 将阅读窗口替换为 `docs/ui/reader.html` 对应的正式 UI：`ReaderPreviewWindow` 改为顶部窗口标题、左侧大纲卡片、右侧阅读卡片、正文文档区、源文件预览区和右下角设置齿轮；`reader-preview.ts` 先从 ATX heading 生成临时大纲与文档标题，跳过 fenced code block 并处理重复 slug；`App.css` 使用独立的 `--reader-outline-card-shadow` / `--reader-card-shadow`、隐藏原生滚动条，并增加只在滚动条热区 hover/focus 时显示的自定义 scroll chrome，避免卡片整体 hover 时滚动条常驻。新增/更新单测覆盖正式文档区、源文件预览区、分层阴影、自定义滚动条热区和大纲 slug。复验 `pnpm test:unit` 52 项通过、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri\Cargo.toml` 12 项通过、`cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings`、`cargo fmt --manifest-path src-tauri\Cargo.toml -- --check`、带 Rust PATH 的 `pnpm tauri build` 均通过，并重新生成 release exe、MSI 和 NSIS 安装包。Browser 插件可打开 `http://127.0.0.1:1420/` 且标题为 `Only MD Reader`、控制台无应用错误，但其 CDP 不支持 `Page.addScriptToEvaluateOnNewDocument`，无法在脚本启动前注入 reader bootstrap；因此用本机 Playwright/Chromium 验证 reader 分支。Playwright 截图对照 `docs/ui/reader.html`，桌面 1320x820 下大纲卡片 282px、阅读卡片 940px、正文 720px、设置齿轮未覆盖正文、滚动条热区默认 `opacity: 0`、无横向溢出；移动 390x760 下单列折叠、无横向溢出、正文右侧为齿轮预留安全留白。真实 release exe 打开 `E:\only_md_reader\docs\technical-architecture.md` 后，Computer Use 捕获窗口标题 `technical-architecture.md - MD 极简阅读`，可访问文本包含 `Markdown 阅读窗口`、`大纲区域`、文档大纲链接、`PURE READER · TAURI 2 + REACT`、`源文件预览`、原始 Markdown 内容和 `按钮 设置`；当前 Windows 截图捕获返回锁屏画面，因此真实 Tauri 视觉截图未作为通过证据。
  - 追加验证记录：2026-06-29 根据用户截图反馈修正阅读窗口正式 UI 细节：移除背景上方 `.reader-preview-window-title` 文件名；大纲和阅读卡片的顶部渐隐只在 `data-scrolled-from-top="true"` 时显示，未滚动时 `::before opacity = 0`，不遮挡第一项；大纲行密度对齐 `docs/ui/reader.html`，大纲项 `min-height: 31px`、树节点 `gap: 4px`；新增 `src/features/reader/scroll-chrome.ts` 按真实 `clientHeight / scrollHeight / trackHeight` 计算 thumb 高度和位置，并在 `ScrollablePanel` 中用 `ResizeObserver`、滚动事件、轨道点击和 thumb pointer drag 同步真实滚动。为避免短大纲因底部 padding 产生假滚动，`.reader-preview-outline-list` 使用 `box-sizing: border-box` 承接滚动内边距，`.reader-preview-outline-tree` 不再设置 `min-height: 100%`。复验 `pnpm test:unit` 56 项通过、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。内置 Browser 可连接并打开 localhost，但 CDP 仍不支持 `Page.addScriptToEvaluateOnNewDocument`，因此 reader 分支用本机 Playwright/Chromium 在 `http://127.0.0.1:1420/` 预注入 bootstrap 验证：长文档首屏 `.reader-preview-window-title` 数量为 0、顶部文件名不可见，大纲和阅读卡片未滚动时 `data-scrolled-from-top=false` 且 `beforeOpacity=0`；大纲 thumb 实测 `312px` 等于公式期望 `312px`，阅读区 thumb 实测 `42px` 等于公式期望 `42px`；真实鼠标轨道点击和拖拽验证大纲 `scrollTop 0 -> 870 -> 1097`、阅读区 `scrollTop 0 -> 9590 -> 11748`。短文档复验大纲和阅读区均为 `data-can-scroll=false`、热区 `pointer-events=none`，确认无滚动时不显示伪滚动条且渐隐不遮挡内容。
  - 追加验证记录：2026-06-29 根据用户对超长标题 hover 圆角的反馈，将阅读窗口桌面大纲列从 `minmax(220px, 282px)` 加宽到 `minmax(300px, 336px)`；大纲列表禁用横向溢出，单个大纲项限制 `max-width: 100%` 并使用 `overflow: hidden`、`text-overflow: ellipsis`、`white-space: nowrap`，同时为链接补充 `title={item.label}` 以便省略后查看完整标题。新增 `reader outline keeps long headings inside a wider fixed visual lane` 回归测试，先确认旧宽度和溢出约束失败，再修正后通过。复验 `pnpm test:unit` 57 项通过、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。Playwright 以 1920x1080 预注入超长标题 reader bootstrap 验证：大纲卡片实际宽度 `336px`，grid 为 `336px 1486px`；长标题项 `itemScrollWidth 761 > itemClientWidth 260`，确认发生省略号截断；大纲列表 `listScrollWidth === listClientWidth` 且 `overflow-x: hidden`，确认没有横向滚动；hover 项右侧距离列表边界 `26px`、`border-radius: 10px`、背景已显示，截图确认右侧不再呈现被裁切的直角。
  - 历史验证记录：2026-07-02 曾将阅读窗口打开策略改为默认最大化且不可拖拽缩放：`reader_windows.rs` 定义默认尺寸 `1280x840`、最小内容尺寸 `900x620`，创建 reader window 时设置 `.inner_size(...)`、`.min_inner_size(...)`、`.resizable(false)`、`.maximized(true)`，历史窗口状态尺寸恢复时也会夹到最小尺寸以上。真实 release exe 验证：启动 `only-md-reader.exe fixtures\markdown\basic-syntax.md` 后通过 WebView2 IPC 查询 reader 窗口，返回 `label = reader-1e4aad26d25a5d15`、`bootstrapKind = reader`、`resizable = false`、`maximized = true`、`innerSize = 1920x1129`、`outerSize = 1936x1168`。`pnpm qa:reader-ui` 在 1920x1080 和 980x700@2x 两个视口通过，确认小窗口/高 DPI 下大纲、阅读卡片和设置按钮不越界。
  - 历史修正记录（已废弃）：2026-07-02 曾尝试将 Windows 阅读窗口改为 `.resizable(true)` + `.maximized(true)` + `.min_inner_size(...)`，以保留默认最大化和标题栏拖拽还原；该策略允许窗口边缘拖拽改变到任意尺寸，不满足当前要求。
  - 历史修正记录（已废弃）：2026-07-02 曾尝试将阅读窗口最小内容尺寸下调为 `760x560`，该宽度会落入 `<=980px` 单列断点，不能满足“大纲卡片和阅读卡片仍左右并排”的当前要求。
  - 历史修正记录（已废弃）：2026-07-02 曾尝试将阅读窗口最小内容尺寸调整为 `1024x560` 并保持 `.maximized(true)`；用户实测该宽度不足以保证左右卡片分布，且双击原生标题栏仍会把窗口调整到显示器级尺寸。
  - 历史修正记录（已废弃）：2026-07-02 17:25 曾尝试禁用最大化并把阅读窗口固定为 `1320x820`，真实 release exe 验证 `hasMaximizeBox = false`、标题栏双击后尺寸不变；用户确认这误解了需求，阅读窗口应默认最大化，并允许标题栏双击/最大化按钮在最大化和最小阅读尺寸之间切换。
  - 追加修正记录：2026-07-02 当前策略改为默认最大化打开，原生还原态内容尺寸和最小内容尺寸均为 `1320x560`。创建 reader window 时使用 `.inner_size(READER_WINDOW_RESTORED_WIDTH, READER_WINDOW_RESTORED_HEIGHT)`、`.min_inner_size(READER_WINDOW_MIN_WIDTH, READER_WINDOW_MIN_HEIGHT)`、`.resizable(false)`、`.maximizable(true)`、`.maximized(true)`，不再使用 `.max_inner_size(...)`。用户可通过最大化按钮或双击标题栏在最大化与 `1320x560` 之间切换，但不能通过窗口边缘拖拽改成任意尺寸。同时保留从最近文件打开时的可见闪动修复：最近文件点击不再进入前端 loading/disabled 状态，Rust `open_reader_window` 会先隐藏 `main` 打开文件窗口，再进入 reader 创建/聚焦路径；打开失败时恢复 `main` 显示并聚焦。新增/更新 `reader windows open maximized, restore to the minimum two-column size, and disable drag resizing`、`reader command hides the source open-file window before the slow open path and restores it on failure` 以及最近文件点击无 visible loading 的回归断言。
  - 追加验证记录：2026-07-02 18:04 执行 `pnpm tauri build --no-bundle --ci` 成功生成新的测试 exe：`E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，大小 `45253120` bytes，LastWriteTime `2026-07-02 18:04:48`。随后启动该 release exe 打开 `fixtures\markdown\basic-syntax.md` 并用 Win32 API 验证原生窗口行为：初始 `IsZoomed = true`、`HasMaximizeBox = true`、`ClientWidth = 1920`、`ClientHeight = 1129`；向标题栏发送 `WM_NCLBUTTONDBLCLK` 后还原为 `IsZoomed = false`、`ClientWidth = 1320`、`ClientHeight = 560`、`HasThickFrame = false`、边缘命中测试没有 resize hit；再次发送 `WM_NCLBUTTONDBLCLK` 后恢复 `IsZoomed = true`。该验证覆盖“打开文件默认最大化”“最大化按钮/标题栏双击只在最大化和最小阅读尺寸间切换”“用户不能通过窗口边缘拖拽改成任意尺寸”。
  - 追加修正记录：2026-07-02 用户确认 `1320x560` 已满足 UI 左右排布需求，并决定阅读窗口采用桌面应用常规缩放策略：默认最大化打开、保留 `1320x560` 还原态和最小内容尺寸、允许用户拖拽窗口边缘调整大小，但不允许拖小于 `1320x560`。实现改为 `.resizable(true)` + `.min_inner_size(READER_WINDOW_MIN_WIDTH, READER_WINDOW_MIN_HEIGHT)` + `.maximizable(true)` + `.maximized(true)`，仍不设置 `.max_inner_size(...)`，历史窗口状态仍不恢复原生宽高和坐标。
  - 追加修正记录：2026-07-18 根据用户截图为大纲卡片和阅读卡片补齐底部渐隐。`ScrollablePanel` 复用现有滚动度量维护 `data-has-scroll-below`：下方仍有内容时显示与顶部对称的 `::after` 渐变，到达末尾或内容无需滚动时自动隐藏；PDF 导出与设置按钮提升到渐隐层上方，打印态同时隐藏顶部和底部渐隐。回归测试先确认旧实现缺少底部伪元素和状态标记，再修复后通过；`pnpm qa:reader-ui` 在 `1920×1080 @ 1x` 和 `1320×560 @ 2x` 中实际验证两张卡片在起点、中段、末尾的渐隐状态，并人工核对桌面与高 DPI 截图。`pnpm test`（189/189）、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm qa:pdf-export` 和 `pnpm tauri build --no-bundle --ci` 均通过；新测试 EXE 为 `src-tauri/target-pdf-setting-ui-test/release/only-md-reader.exe`，SHA-256 为 `CD662CBA4186DF7CFEDA7CD7633C949391DF044C2A80B0625AAF60534CB1730D`。
  - 用户验收：2026-07-18 使用上述 Windows 测试 EXE 复验大纲卡片和阅读卡片的底部渐隐，确认测试通过。

- [x] 6.2 Rust 层实现读取 Markdown 文件。完成时间：2026-06-29 17:31
  - 目标：返回文件名、路径、原始 Markdown 文本、基础元数据。
  - 验收标准：合法 UTF-8 Markdown 可读取；读取失败有明确错误。
  - 验证记录：`src-tauri/src/reader_windows.rs` 抽出 `read_markdown_file()`，通过 `normalize_markdown_path()` 规范化 Markdown 路径，读取 UTF-8 原始文本并返回路径、文件名、内容和基础打开元数据；非法扩展、缺失路径、非文件路径仍在规范化阶段返回明确错误，非法 UTF-8 会返回 `读取 Markdown 文件失败`。执行 `cargo test --manifest-path src-tauri\Cargo.toml` 通过 12 项 Rust 测试，其中 `reads_utf8_markdown_file_with_basic_metadata` 验证合法 UTF-8 文件内容和元数据，`reports_clear_error_when_markdown_file_cannot_be_read_as_utf8` 验证读取失败错误；执行 `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings` 和 `cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` 均通过。

- [x] 6.3 前端接收文件内容并渲染占位正文。完成时间：2026-06-29 17:31
  - 验收标准：阅读窗口能显示当前文件名和原始文本或占位渲染结果。
  - 验证记录：`App.tsx` 继续根据 `window.__ONLY_MD_READER_BOOTSTRAP__.windowKind === "reader"` 渲染阅读窗口；`ReaderPreviewWindow` 接收 Rust 注入的 `OpenedMarkdownFile`，显示文件名、规范化路径和原始 Markdown 占位正文。执行 `pnpm test` 通过，其中 `reader preview exposes file name path and raw markdown content` 验证 view model 暴露文件名、路径和原文，`React entry selects reader windows from injected bootstrap data` 验证 reader bootstrap 路径。端内验证：release exe 传入 `basic-syntax.md` 后，Computer Use 捕获的可访问文本包含 `basic-syntax.md`、规范化文件路径 `\\?\E:\only_md_reader\fixtures\markdown\basic-syntax.md` 和原始 Markdown 文本 `# Basic Syntax Fixture`。

- [x] 6.4 实现阅读区最大宽度和居中排版。完成时间：2026-06-29 17:31
  - 验收标准：窗口变宽时正文不无限拉伸，左右留白自然增加。
  - 验证记录：`App.css` 为阅读窗口定义 `--reader-content-max-width: 720px`，`.reader-preview-document` 使用 `max-width: min(100%, var(--reader-content-max-width))` 和 `margin: 0 auto`，`.reader-preview-scroll` 提供阅读区内边距以形成自然留白。执行 `pnpm test` 通过，其中 `reader raw document is centered and leaves room for the settings gear` 验证最大宽度、居中和阅读区底部留白；执行 `pnpm build` 通过。
  - 追加验证记录：2026-06-29 正式 UI 复验中，Playwright 桌面 1320x820 读取 `.reader-preview-document` 为 720px 宽，位于阅读卡片内居中；移动 390x760 下正文收缩到 258px 并保持无横向溢出。`reader raw document is centered and leaves room for the settings gear` 单测同步覆盖桌面最大宽度和移动端右侧安全留白。

- [x] 6.5 确保设置齿轮不遮挡正文。完成时间：2026-06-29 17:31
  - 验收标准：正文、代码块、公式、表格区域不被右下角齿轮覆盖。
  - 验证记录：设置齿轮固定在 `.reader-preview-reading-card` 右下角，`.reader-preview-scroll` 使用底部 `112px` 内边距，为正文和占位代码块预留空间；齿轮本身为 46px 圆形图标按钮，不进入正文流。执行 `pnpm test` 通过，其中 `reader raw document is centered and leaves room for the settings gear` 验证齿轮绝对定位和阅读区底部留白。端内截图验证右下角齿轮位于阅读卡片留白处，未覆盖 `basic-syntax.md` 原始正文块；可访问文本显示 `按钮 设置`。
  - 追加验证记录：2026-06-29 正式 UI 复验先在移动 390x760 截图中发现齿轮与正文区域存在几何重叠风险，随后把小屏 `.reader-preview-scroll` 从 `padding: 34px 18px 90px` 改为 `padding: 34px 82px 90px 18px`，为 46px 齿轮加右侧安全距离；新增单测锁定该媒体查询。复测 Playwright 移动截图中 `settingsOverlapsSourceCopy: false`、`hasHorizontalOverflow: false`，桌面仍保持齿轮位于正文最大宽度外侧留白处。

- [x] 6.6 实现沉浸式阅读和复制交互。完成时间：2026-07-02 21:33
  - 验收标准：`F11` 和大纲外侧箭头按钮都能隐藏 / 显示大纲；隐藏后阅读卡片向左扩展并吃掉原大纲空间，显示后恢复原左右卡片布局；大纲箭头为 16px，选区复制泡泡为 32px，代码块复制按钮为 24px；正文、大纲和代码块内选区都能按选区复制处理，代码块右上角复制按钮能复制完整代码块；点击泡泡或点击其他位置后泡泡关闭。
  - 验证记录：`ReaderPreviewWindow` 新增 `isOutlineHidden` 状态和全局 `F11` 监听，布局通过 `.reader-preview-layout[data-outline-hidden="true"]` 把大纲列折叠为 `0`，阅读卡片扩展到左侧空间；大纲外侧 `.reader-preview-outline-rail-button` 使用用户给定左右箭头 SVG mask，随状态在 `hide/show` 间切换。大纲项由原生按钮改为可选中的 `span role="button"`，保留点击和 Enter / Space 跳转，同时允许 `user-select: text`。普通选区通过 16px `.reader-preview-selection-copy-button` 写入剪贴板；代码块由 Markdown 渲染器注入 16px `.markdown-code-copy-button` 和 URI 编码的 `data-copy-code`，点击后解码复制完整代码块。2026-07-02 执行 `pnpm test` 通过 146 项，`pnpm lint` 通过，`pnpm format:check` 通过。`pnpm qa:reader-ui` 在 `1920x1080@1x` 和 `1320x560@2x` 通过：验证大纲箭头 16x16、代码复制按钮 16x16、`F11` 后大纲宽度 `<= 1px` 且阅读卡片变宽、箭头点击恢复大纲、大纲项 `user-select: text`、选区复制泡泡 16x16 且能写入剪贴板 mock、代码块复制能写入完整函数文本。`pnpm qa:settings-ui`、`pnpm qa:markdown-performance`、`pnpm qa:screenshots` 均通过；`pnpm build` 通过；`cargo test --manifest-path src-tauri\Cargo.toml` 26 项通过；`pnpm tauri build --no-bundle --ci` 生成 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`。本轮构建仍出现已记录的 Vite 大 chunk warning，但构建退出码为 0，不阻塞该功能验收。
  - 追加验证记录：2026-07-02 根据用户实测反馈修正 5 点：正文拖选从 pointer 事件改为 mouse 事件并增加 `caretPositionFromPoint` / `caretRangeFromPoint` 兜底，保存文本流偏移 snapshot 后在 React 渲染复制泡泡后恢复真实 `window.getSelection()`，确保文本可选中且 `Ctrl+C` 仍复制真实选区；代码块右上角复制按钮去掉圆形背景并改为 `24x24`；选中文本复制泡泡改为 `32x32`；隐藏大纲左箭头去掉背景并移动到大纲卡片与阅读卡片间距中心；展示大纲右箭头去掉背景并向右移动到 `centerX = 34`，阅读卡片左边为 `18`。`pnpm qa:reader-ui` 已验证大纲箭头背景为透明、展开状态箭头中心与卡片间距中心一致、隐藏状态右箭头位置已右移、代码块复制按钮背景透明且尺寸 `24x24`、选区复制泡泡尺寸 `32x32`、正文拖选复制会把 `Long Section` 写入剪贴板 mock、代码块复制会写入完整代码文本。复验 `pnpm test` 146 项通过，`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm qa:settings-ui`、`pnpm qa:reader-ui`、`pnpm qa:markdown-performance`、`pnpm qa:screenshots` 均通过；执行 `pnpm tauri build --no-bundle --ci` 生成 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，未产出 MSI/NSIS 安装包。`pnpm build` 和 Tauri 构建仍出现已记录的 Vite 大 chunk warning，但退出码为 0，按第 13.8 项记录为非阻塞已知警告。
  - 追加验证记录：2026-07-03 根据用户录屏继续修正选区复制：录屏显示 WebView2 真窗口中拖选正文时复制泡泡会出现，但释放鼠标后可见选区可能消失。`ReaderPreviewWindow` 现在不再在复制泡泡渲染时无条件重写原生 selection，而是优先保留浏览器 / WebView 自己创建的选区；仅在选区文本已经丢失时通过 snapshot 恢复，并在下一帧和 80ms 后再做轻量兜底恢复。复制泡泡 `mousedown` 阻止默认聚焦，避免点击泡泡前先清掉选区；新增 `copy` 事件兜底，若 WebView 清掉可见 range 但复制泡泡仍持有刚才的文本，`Ctrl+C` 仍写入该文本。`tools/reader-ui-qa.mjs` 新增跨块拖选回归：从 `.markdown-rendered-document h1` 拖到正文段落，等待 1.2s 后确认 `window.getSelection()` 仍包含 `Reader QA Document` 和 `Intro paragraph`；同时模拟 selection 被清空后的 `copy` 事件，确认会复制存储的选中文本。复验 `pnpm format:check`、`pnpm test` 146 项、`pnpm lint`、`pnpm qa:reader-ui`、`pnpm qa:settings-ui`、`pnpm qa:markdown-performance`、`pnpm qa:screenshots`、`pnpm build` 均通过；执行 `pnpm tauri build --no-bundle --ci` 生成新的 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，大小 `45257216` bytes，LastWriteTime `2026-07-03 11:04:07`，未产出安装包。`pnpm build` 和 Tauri 构建仍出现已记录的大 chunk warning，但退出码为 0。

## 7. Markdown 核心渲染

- [x] 7.1 接入 unified 基础管线。完成时间：2026-06-29 23:25
  - 插件：`remark-parse`、`remark-gfm`、`remark-rehype`、`rehype-sanitize`。
  - 验收标准：CommonMark、GFM 表格、任务列表、删除线、自动链接可渲染。
  - 验证记录：新增 `src/features/markdown/markdown-renderer.ts`，使用 `remark-parse`、`remark-gfm`、`remark-rehype`、`rehype-raw`、`rehype-sanitize`、`rehype-stringify` 建立 Markdown 渲染管线。`fixtures/markdown/worklist-7-9-visual.md` 的 Playwright 可视验收确认正文、粗体、斜体、链接、`mark`、行内代码、GFM 任务列表、删除线和自动链接均可渲染；`src/features/markdown/markdown-renderer.test.ts` 中 `renders CommonMark and GFM features through the markdown pipeline`、`keeps safe inline mark elements for token-colored highlights` 通过。

- [x] 7.2 实现相对路径图片解析。完成时间：2026-06-29 23:25
  - 目标：相对 Markdown 文件所在目录解析图片路径。
  - 验收标准：`./images/foo.png` 可按 Markdown 文件所在目录解析为本地图片资源；图片缺失或无权限时的正式失败状态归第 13.2 项验收。
  - 验证记录：`enhanceImageProperties()` 会把相对图片按 Markdown 文件所在目录解析为绝对路径，保留 `data-local-src` / `data-source-src`，并在 Tauri 运行时经 `convertFileSrc()` 转为 asset URL。单元测试 `resolves relative image paths against the markdown file directory`、`can route resolved image paths through the desktop asset protocol` 通过。Playwright 使用本地 HTTP asset mock 验证 `./assets/relative-image.svg` 可加载，`naturalWidth = 480`。
  - 追加说明：2026-06-29 曾在本项中提前加入缺失图片 fallback 逻辑和验证记录；该内容与未完成的第 13.2 项重叠。2026-06-30 排期记录已纠正：第 7.2 项只确认相对路径解析，第 13.2 项继续作为正式图片加载失败状态验收入口。

- [x] 7.3 实现表格横向滚动。完成时间：2026-06-29 23:25
  - 验收标准：宽表格不撑破整体布局。
  - 验证记录：`rehypeReaderEnhancements()` 会把 `table` 包进 `.markdown-table-wrapper`，CSS 对 `.markdown-table-wrapper` 设置 `max-width: 100%`、`overflow-x: auto`，表格本身使用 `min-width: max-content`。Playwright 验证宽表格 wrapper `clientWidth = 720`、`scrollWidth = 1103`、`overflowX = auto`，页面整体 `pageOverflow = false`，宽表格没有撑破阅读布局。

- [x] 7.4 实现 Markdown 渲染错误状态。完成时间：2026-06-29 23:25
  - 验收标准：解析或渲染异常不会导致整个窗口白屏。
  - 验证记录：`renderMarkdownDocument()` 捕获渲染异常并返回 `createMarkdownRenderError()` 的可读 fallback HTML，阅读窗口通过 `.reader-preview-render-error` 显示错误信息，不让整个窗口白屏。单元测试 `render errors produce a readable fallback document` 通过，确认异常时返回 `.markdown-render-error` 和原始 Markdown 内容。

- [x] 7.5 建立 Markdown 渲染测试。完成时间：2026-06-29 23:25
  - 验收标准：基础样本文档渲染快照或组件测试通过。
  - 验证记录：新增 `src/features/markdown/markdown-renderer.test.ts`，覆盖 CommonMark/GFM、HTML sanitize、`mark` 高亮、相对图片、Tauri asset URL、heading/slug、KaTeX、Shiki、未知语言 fallback、渲染错误 fallback 和 Markdown 语法颜色 token 映射。执行 `pnpm test` 通过前端 83 项测试，其中 Markdown 渲染专项 14 项全部通过。2026-06-29 复验追加图片失败状态回归测试后，`pnpm test` 通过前端 86 项测试。

## 8. 大纲系统

- [x] 8.1 从 Markdown AST 提取 heading。完成时间：2026-06-29 23:25
  - 验收标准：大纲不从最终 DOM 反推。
  - 验证记录：`renderMarkdownDocument()` 在 Markdown 源上通过 `unified().use(remarkParse).parse(content)` 得到 Markdown AST，再由 `extractOutlineFromAst()` 访问 `heading` 节点生成 `outlineItems`，没有从最终 DOM 反推大纲。单元测试 `extracts headings from the markdown AST with stable duplicate slugs` 通过。

- [x] 8.2 实现稳定 slug。完成时间：2026-06-29 23:25
  - 规则：heading text -> slug；重复标题追加序号。
  - 验收标准：正文标题 id 和大纲 id 一致。
  - 验证记录：`createSlugger()` 实现 heading text -> slug，重复标题追加 `-2`、`-3`。同一个 slugger 逻辑分别用于 AST 大纲和 rehype 标题 id 注入。单元测试确认 `Intro` 重复生成 `intro` / `intro-2`，正文 `<h2 id="intro-2">Intro</h2>` 与大纲 id 一致；Playwright 可视验收中重复标题 id 为 `8-2-duplicate-heading` 和 `8-2-duplicate-heading-2`。

- [x] 8.3 渲染左侧树形大纲。完成时间：2026-06-29 23:25
  - 验收标准：层级缩进正确，长大纲区域可独立滚动。
  - 验证记录：`ReaderPreviewWindow` 左侧 `.reader-preview-outline-tree` 使用 `data-depth` 渲染层级缩进，`.reader-preview-outline-list` 独立滚动并隐藏原生滚动条，滚动条状态由 `ScrollablePanel` 维护。Playwright 初始截图显示 8 个大纲项按层级缩进渲染；既有长大纲回归测试 `reader outline keeps long headings inside a wider fixed visual lane` 和 scroll chrome 单元测试通过。

- [x] 8.4 实现大纲节点折叠。完成时间：2026-06-29 23:25
  - 验收标准：折叠父节点后隐藏子节点，不影响正文渲染。
  - 验证记录：`toggleCollapsedOutlineId()` 与 `getVisibleOutlineItems()` 控制折叠状态，只过滤大纲可见项，不修改正文 HTML。单元测试 `collapsing a parent outline item hides only descendant headings`、`collapsing a top-level outline item hides descendants until the next peer` 通过。Playwright 点击折叠 `8 Outline System` 后，大纲项从 8 个变为 5 个，正文仍显示 8.1、8.2、9 Rich Content 等内容。

- [x] 8.5 实现大纲点击跳转。完成时间：2026-06-29 23:25
  - 验收标准：点击大纲项滚动到对应标题。
  - 验证记录：`handleOutlineJump()` 按大纲 id 查询正文标题，使用 `getScrollTopForOutlineTarget()` 计算滚动位置并设置阅读区 `scrollTop`。单元测试 `outline jump places the target heading at the active viewport anchor`、`outline jump never requests negative scroll top` 通过。Playwright 点击 `9 Rich Content` 后，当前高亮变为 `9 Rich Content`，阅读区 `scrollTop = 1284`，截图定位到富内容段落。

- [x] 8.6 实现滚动同步高亮。完成时间：2026-06-29 23:25
  - 方案：IntersectionObserver 或等价机制。
  - 验收标准：滚动时当前大纲项高亮，无明显抖动。
  - 验证记录：当前实现采用等价滚动锚点机制：`handleReadingScroll()` 读取正文标题 `offsetTop`，`getActiveOutlineId()` 根据 `scrollTop`、viewport offset 和文档末尾状态计算当前标题，并通过 `data-current="true"` 高亮。单元测试覆盖普通滚动、顶部 fallback 和文档末尾无法顶齐时的当前标题推进。Playwright 滚动/点击后当前大纲项稳定高亮为 `8 Outline System` 和 `9 Rich Content`，未观察到抖动。

## 9. 富内容渲染

- [x] 9.1 接入 KaTeX 数学公式。完成时间：2026-06-29 23:25
  - 插件：`remark-math`、`rehype-katex`。
  - 验收标准：行内公式 `$...$` 和块级公式 `$$...$$` 可渲染。
  - 验证记录：Markdown 管线接入 `remark-math` 和 `rehype-katex`，并在 sanitize 白名单中显式保留 KaTeX 需要的 `katex-mathml`、`katex-html`、`mord`、`mrel` 等布局 class。单元测试 `renders KaTeX math without turning a bad formula into a blank document`、`keeps KaTeX layout classes after sanitizing rendered math` 通过。Playwright 验证行内公式和块级公式均渲染，DOM 存在 `.katex-mathml` 与 `.katex-html`。

- [x] 9.2 本地打包 KaTeX CSS 和字体。完成时间：2026-06-29 23:25
  - 验收标准：断网状态下公式仍可正常显示。
  - 验证记录：`src/main.tsx` 本地导入 `katex/dist/katex.css`，Vite 构建会把 KaTeX 字体输出到 `dist/assets/`。执行 `pnpm build` 成功；资源审计脚本确认构建产物包含 59 个 `KaTeX_*.woff/woff2/ttf` 字体文件，且 `src/href/import/url/fetch` 形式的远程资源依赖数量为 0。

- [x] 9.3 实现公式错误隔离。完成时间：2026-06-29 23:25
  - 验收标准：单个公式失败时显示原文本和错误状态，不导致整篇文档崩溃。
  - 验证记录：`rehypeKatex` 使用 `throwOnError: false`，`rehypeReaderEnhancements()` 将 `katex-error` 转为 `.markdown-math-error`，并移除 KaTeX 内联 `color:#cc0000`，使错误颜色走 `var(--button-danger-bg)`。单元测试确认坏公式显示 `\notacommand{`、后续正文 `After math` 仍存在且没有内联错误色。Playwright 验证坏公式显示错误文本，不白屏；亮色错误色为 `#9B5A4A`，暗色错误色为 `#B16A5B`，均来自 Warm Paper token。

- [x] 9.4 接入 Shiki 代码高亮。完成时间：2026-06-29 23:25
  - 验收标准：常见语言按语法高亮，未知语言按纯文本渲染。
  - 验证记录：`highlightFencedCode()` 使用 Shiki `codeToHtml()` 处理 fenced code，并在输出 `<pre>` 上写入 `data-language` 与 `data-code-theme`；失败或未知语言时返回纯文本 `<pre><code>` fallback。单元测试 `renders highlighted code with bundled Eva theme names per theme mode` 和 `unknown code languages render as plain text instead of failing` 通过。Playwright 验证 TypeScript 代码块 `data-language="ts"`，包含 4 行 `.line`。

- [x] 9.5 打包 VS Code Eva Theme 代码主题。完成时间：2026-06-29 23:25
  - 目标文件：`src/assets/shiki-themes/eva-light-bold.json`、`src/assets/shiki-themes/eva-dark-bold.json`。
  - 要求：亮色代码主题使用 `Eva Light Bold`，暗色代码主题使用 `Eva Dark Bold`；主题 JSON 和 license / attribution 文件随应用打包。
  - 验收标准：断网状态下 Shiki 能加载本地 `Eva Light Bold` 和 `Eva Dark Bold`；明亮模式使用 `Eva Light Bold`，暗色模式使用 `Eva Dark Bold`。
  - 验证记录：新增本地主题文件 `src/assets/shiki-themes/eva-light-bold.json`、`src/assets/shiki-themes/eva-dark-bold.json`，并保留 `LICENSE.txt`、`ATTRIBUTION.md`。`markdown-renderer.ts` 直接从本地 JSON import 两个主题传给 Shiki，不依赖 CDN 或运行时网络。资源审计确认构建 JS 中包含 `Eva Light Bold` 与 `Eva Dark Bold` 主题名，远程资源加载入口数量为 0。

- [x] 9.6 实现代码主题随明暗模式切换。完成时间：2026-06-29 23:25
  - 验收标准：应用主题切换后代码块主题同步切换；明亮模式为 `Eva Light Bold`，暗色模式为 `Eva Dark Bold`。
  - 验证记录：`ReaderPreviewWindow` 监听根节点 `data-theme-effective-mode` 变化，变化后重新调用 `renderMarkdownDocument()` 并按 `themeMode` 选择本地 Eva 主题。单元测试确认 light 输出 `data-code-theme="Eva Light Bold"`、dark 输出 `data-code-theme="Eva Dark Bold"`。Playwright 将根主题切到 dark 后，`.markdown-rendered-document[data-code-theme]` 变为 `Eva Dark Bold`，暗色截图中代码块同步使用暗色高亮。

- [x] 9.7 实现长代码、宽公式横向滚动。完成时间：2026-06-29 23:25
  - 验收标准：长代码行和宽公式不撑破阅读布局。
  - 验证记录：CSS 对 `.markdown-code-scroller`、`.katex-display` 设置 `max-width: 100%`、`overflow-x: auto`，代码 `<pre>` 使用 `min-width: max-content`。Playwright 验证宽公式 wrapper `clientWidth = 720`、`scrollWidth = 1369`、`overflowX = auto`；代码 wrapper `overflowX = auto`；阅读页面整体没有横向溢出，长内容未撑破阅读布局。

## 10. 设置窗口与本地持久化

- [x] 10.1 实现设置窗口静态 UI。完成时间：2026-06-30 20:38
  - 参考：`docs/ui/settings.html`。
  - 验收标准：左侧设置项、右侧设置内容布局正确。
  - 验证记录：新增设置窗口入口分支 `windowKind: "settings"`、`SettingsWindow`、`createSettingsWindowViewModel()` 与 `.settings-window-*` 样式。执行 `pnpm test` 通过 112 项，其中 `settings window exposes left navigation and right-side settings fields`、`settings UI has left navigation, right content, and save failure rollback`、`settings window keeps the two-column layout at its native width` 覆盖静态结构和原生 900px 设置窗口双栏断点。Playwright 使用本机 Edge 打开 `http://127.0.0.1:1420/` 并在页面启动前模拟 Tauri settings bootstrap，900x560 视口下 `.settings-window-frame` 实测 `grid-template-columns = 210px 642px`，左侧导航为 `外观 / 排版 / 代码`，右侧内容区域宽 642px，确认左侧设置项、右侧设置内容为双栏布局；截图保存到系统临时目录 `only-md-reader-worklist-10-11/settings-window-900x560.png`。
  - 追加修正记录：2026-07-02 根据用户反馈，设置窗口字体下拉不再只使用少量前端硬编码候选；新增 `list_available_font_families` Tauri 命令，Windows 下从系统字体注册表枚举字体族，前端通过 `SettingsApi.listAvailableFontFamilies()` 加载字体候选，`Maple Mono NF CN` 保持首位并作为 `null` 默认字体。浏览器 QA 使用内置常见字体 fallback。

- [x] 10.2 定义 `ReaderSettings` 前后端类型。完成时间：2026-06-30 20:38
  - 字段：`schemaVersion`、`colorThemeId`、`themeMode`、字体、字号、行高、正文宽度、代码主题。
  - 验收标准：TypeScript 和 Rust 字段命名通过 camelCase 序列化保持一致。
  - 验证记录：前端在 `src/features/settings/reader-settings.ts` 定义 `ReaderSettings` / `ReaderSettingsPatch`，Rust 在 `src-tauri/src/settings.rs` 定义同名结构并对 `ReaderSettings`、`ReaderSettingsPatch` 使用 `#[serde(rename_all = "camelCase")]`。执行 `pnpm test` 中 `default reader settings match the persisted camelCase contract` 验证 TS 默认字段顺序和值包含 `schemaVersion`、`colorThemeId`、`themeMode`、字体、字号、行高、正文宽度和 Eva 代码主题；执行 `cargo test --manifest-path src-tauri/Cargo.toml` 中 `missing_settings_file_creates_default_camel_case_settings` 验证 Rust 写出的 JSON 包含 `schemaVersion`、`themeMode`、`contentMaxWidth` 等 camelCase 字段。

- [x] 10.3 实现 `settings.json` 本地持久化。完成时间：2026-06-30 20:38
  - 路径：Tauri `{appDataDir}/settings.json`。
  - 验收标准：重启应用后设置仍生效；不使用 `localStorage` 作为主存储。
  - 验证记录：Rust `settings_store_path()` 使用 `app.path().app_data_dir().join("settings.json")`，`get_reader_settings` / `update_reader_settings` / `reset_reader_settings` 都经 Rust 层读写该文件；前端 `createSettingsApi()` 在 Tauri runtime 下只调用 `invoke()`，未使用 `localStorage` 作为主存储。执行 `pnpm test` 中 `settings UI has left navigation, right content, and save failure rollback` 明确断言 `SettingsWindow.tsx` 与 `main.tsx` 不包含 `localStorage`；执行 `cargo test --manifest-path src-tauri/Cargo.toml` 中 `missing_settings_file_creates_default_camel_case_settings`、`old_settings_without_schema_version_are_migrated_to_version_one`、`settings_write_uses_a_temp_file_then_leaves_only_valid_json` 覆盖从磁盘创建、重新读取和写入后的持久化路径，等价覆盖应用重启后从 `settings.json` 重新加载。

- [x] 10.4 实现设置文件 schemaVersion 和迁移入口。完成时间：2026-06-30 20:38
  - 验收标准：缺失或旧版本设置能迁移或回退默认值。
  - 验证记录：`ReaderSettings::default()` 固定 `schema_version = 1`，`load_reader_settings_from_path()` 会在 JSON 缺失、旧结构或无法直接反序列化为当前结构时进入 `migrate_reader_settings_value()`，保留可迁移字段并回写 version 1 设置。执行 `cargo test --manifest-path src-tauri/Cargo.toml` 中 `missing_settings_file_creates_default_camel_case_settings` 验证缺失文件创建默认值，`old_settings_without_schema_version_are_migrated_to_version_one` 验证旧 JSON `{"themeMode":"dark","bodyFontSize":18,"contentMaxWidth":920}` 迁移后 `schema_version = 1` 且字段被保留。

- [x] 10.5 实现设置原子写入。完成时间：2026-06-30 20:38
  - 验收标准：写入时先写临时文件，再替换正式文件，避免半截 JSON。
  - 验证记录：`write_reader_settings_to_path()` 先写 `path.with_extension("json.tmp")`，再通过 `replace_file()` 删除旧正式文件并 rename 临时文件。执行 `pnpm test` 中 `desktop backend registers settings and window-state commands` 静态确认使用 `with_extension("json.tmp")`；执行 `cargo test --manifest-path src-tauri/Cargo.toml` 中 `settings_write_uses_a_temp_file_then_leaves_only_valid_json` 验证写入结束后 `.json.tmp` 不残留，正式 `settings.json` 可被反序列化为完整 `ReaderSettings`。

- [x] 10.6 实现设置损坏回退。完成时间：2026-06-30 20:38
  - 验收标准：`settings.json` 损坏时应用不白屏，回退默认设置，并保留 `settings.corrupt.json`。
  - 验证记录：`load_reader_settings_from_path()` 在 `serde_json::from_str` 失败时调用 `backup_corrupt_settings_file()`，复制为 `settings.corrupt.json`，再写入默认设置。执行 `pnpm test` 中 `desktop backend registers settings and window-state commands` 静态确认 `settings.corrupt.json` 路径存在；执行 `cargo test --manifest-path src-tauri/Cargo.toml` 中 `corrupt_settings_file_is_backed_up_and_replaced_with_defaults` 验证损坏内容 `{not-json` 被原样保存到 `settings.corrupt.json`，返回值为默认设置，新的 `settings.json` 包含 `schemaVersion`。

- [x] 10.7 实现设置变更多窗口同步。完成时间：2026-06-30 20:38
  - 验收标准：一个窗口修改主题、字体、字号后，所有已打开窗口即时更新，包括打开文件窗口、所有阅读窗口和设置窗口自身。
  - 验证记录：Rust `update_reader_settings()` 和 `reset_reader_settings()` 写入成功后调用 `emit_reader_settings_changed()` 广播 `reader-settings-changed`；前端 `main.tsx` 启动时调用 `getReaderSettings()`，并通过 `listenForReaderSettingsChanges()` 在所有窗口收到事件后执行 `applyReaderSettingsToRoot()`，更新 `--reader-content-max-width`、`--reader-body-font-size`、`--reader-code-font-size`、`--reader-line-height` 等根 CSS variables。执行 `pnpm test` 中 `reader settings are loaded from Rust and synchronized across windows` 验证加载和监听链路。Playwright 在 reader bootstrap 页面中模拟 `reader-settings-changed` 事件，把设置改为 `contentMaxWidth=920`、`bodyFontSize=19`、`codeFontSize=18`、`lineHeight=2.02`，实测根 CSS variables 变为 `920px`、`19px`、`18px`、`2.02`，阅读窗口无需刷新即可更新。
  - 追加验证记录：2026-07-01 根据设置窗口单例方案补充广播口径：`settings.rs` 使用 App 级 `.emit(READER_SETTINGS_CHANGED_EVENT, ...)`，不使用 `emit_to` 限定 reader 窗口；`main.tsx` 是所有窗口共享入口，因此打开文件窗口、阅读窗口和设置窗口都会加载设置并监听 `reader-settings-changed`。`pnpm test:unit` 中 `reader settings are loaded from Rust and synchronized across every app window` 通过，静态确认广播没有被限制到单个窗口类型。

- [x] 10.8 实现设置保存失败回滚。完成时间：2026-06-30 20:38
  - 验收标准：Rust 写入失败时前端回滚到上一次已保存状态，并显示错误。
  - 验证记录：`SettingsWindow` 保存前先乐观更新，保存成功后更新 `lastSavedSettings`；`api.updateReaderSettings()` 抛错时执行 `setSettings(lastSavedSettings)` 并渲染 `role="alert"` 错误。执行 `pnpm test` 中 `settings UI has left navigation, right content, and save failure rollback` 静态确认 `lastSavedSettings`、`setSettings(lastSavedSettings)` 和 `role="alert"`。Playwright 模拟下一次 `update_reader_settings` 抛出 `disk write failed for verification`，点击“暗色”后页面显示错误提示，当前选中项回到“跟随系统”，内存中的已保存设置仍为 `themeMode: "system"`，验证失败回滚有效。

- [x] 10.9 实现设置入口。完成时间：2026-06-30 20:38
  - 入口：打开文件窗口中央卡片右下角齿轮；阅读窗口右下角齿轮。
  - 验收标准：设置只能通过齿轮按钮打开全局单例系统原生设置窗口；打开文件窗口和任意阅读窗口重复点击齿轮时，如果设置窗口已经存在，则恢复并聚焦已有设置窗口，不创建第二个；不通过左上角应用菜单、系统菜单、Windows `Ctrl+,` 或 macOS `Cmd+,` 弹出设置窗口。
  - 验证记录：初版曾实现阅读窗口齿轮、系统菜单和 `CmdOrCtrl+,` 打开独立设置窗口，2026-06-30 曾临时修正为同窗模态入口。2026-07-01 根据用户确认的方案改为 Tauri 原生单例设置窗口：新增 `src-tauri/src/settings_window.rs`，固定 label 为 `settings`，`open_settings_window` 已存在时执行 `unminimize()`、`show()`、`set_focus()`，不存在时创建 900x560 不可缩放设置窗口并注入 `windowKind: "settings"`；`src/App.tsx` 识别 settings bootstrap 后渲染独立 `SettingsWindow`；打开文件窗口和阅读窗口齿轮都调用 `settingsApi.openSettingsWindow()`，不再渲染 `SettingsWindow presentation="modal"`。`pnpm test:unit` 中 `desktop backend registers settings, settings-window, and window-state commands`、`open file and reader gears open the native singleton settings window`、`native settings window keeps the settings.html window shape at its native width` 通过。
  - 历史追加验证记录（已被 2026-07-04 视觉统一替代）：2026-07-03 修正打开文件窗口右上角设置齿轮的真实渲染几何。根因是 `button` 默认 padding 和打开文件卡片 `1px` border 让原先 CSS 数字满足等式但浏览器实际外框不满足。`src/App.css` 将打开文件齿轮显式设为 `box-sizing: border-box; padding: 0`，并把圆按钮缩为 `34px`、图标缩为 `17px`；由于卡片 `border-radius: 24px` 且有 `1px` border，真实可见 inset 为 `7px`，渲染测量结果为 `17 + 7 = 24`。`src/app-shell.test.ts` 增加回归断言，要求打开文件齿轮和阅读齿轮都使用 border-box 且半径 + 可见 inset 等于各自卡片圆角；临时 Chromium 几何验证 `http://127.0.0.1:1420/` 得到 `gearWidth=34`、`gearHeight=34`、`topInset=7`、`rightInset=7`、`radiusPlusTopInset=24`、`radiusPlusRightInset=24`，并确认主打开按钮 `svg` 数量为 0。
  - 追加验证记录：2026-07-04 统一打开文件窗口、阅读窗口、设置窗口的卡片和设置齿轮几何：窗口内主卡片圆角统一为 `22px`；打开文件窗口和阅读窗口的圆形设置按钮统一为 `32px × 32px`、半径 `16px`、右下角视觉 inset `6px`，满足 `16px + 6px = 22px`；打开文件窗口因中央卡片有 `1px` border，CSS 使用 `right: 5px; bottom: 5px`，浏览器实测可见 inset 为 `6px`。`src/app-shell.test.ts` 增加 `window cards share a 22px radius` 和半径平衡回归断言；`tools/reader-ui-qa.mjs` 增加阅读窗口 `settingsRadiusBalance` 实测断言；主打开按钮继续保持无前置图标。真实 Chromium 几何复验确认打开文件窗口 `cardRadius=22`、`gearWidth=32`、`gearHeight=32`、`gearRadius=16`、`rightInset=6`、`bottomInset=6`，阅读窗口 `outlineCardRadius=22`、`readingCardRadius=22`、`gearRadius=16`、`rightInset=6`、`bottomInset=6`，设置窗口 `frameRadius=22`，失败项为空。复验 `node --test --experimental-strip-types src/app-shell.test.ts`、`pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm qa:settings-ui`、`pnpm qa:reader-ui`、`pnpm qa:markdown-performance`、`pnpm qa:screenshots`、`pnpm build`、`pnpm tauri build --no-bundle --ci` 均通过；生成新的 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，未产出 MSI/NSIS 安装包。

## 11. 窗口状态与阅读位置恢复

- [x] 11.1 定义 `WindowStateStore`。完成时间：2026-06-30 20:38
  - 路径：Tauri `{appDataDir}/window-state.json`。
  - 字段：`filePath`、`scrollTop`、`scrollRatio`、`activeHeadingId`、`activeHeadingOffset`、文件元数据。
  - 验收标准：状态按规范化绝对路径保存。
  - 验证记录：Rust `src-tauri/src/window_state.rs` 定义 `WindowStateStore { schema_version, files }` 与 `WindowState`，字段通过 `#[serde(rename_all = "camelCase")]` 序列化，存储路径为 `app.path().app_data_dir().join("window-state.json")`；保存前调用 `normalize_markdown_path()`，Windows 下 `window_state_store_key()` 对路径大小写折叠。前端 `src/features/reader/window-state.ts` 定义对应 TS 类型和 key 规则。执行 `pnpm test` 中 `window state store keys normalize Windows paths for one file identity`、`reader windows receive and persist window state separately from settings` 通过；执行 `cargo test --manifest-path src-tauri/Cargo.toml` 中 `window_state_is_saved_under_a_normalized_path_key` 验证状态写入规范化 key。

- [x] 11.2 废弃窗口尺寸和位置保存，仅保留阅读位置。完成时间：2026-07-02 17:20
  - 验收标准：关闭并重新打开文件后恢复阅读位置，但不恢复原生窗口宽高或坐标；旧版 `window-state.json` 中残留的 `width`、`height`、`x`、`y` 不再影响阅读窗口创建。
  - 验证记录：`src-tauri/src/window_state.rs` 的 `WindowState` / `SaveWindowStateRequest` 只保留阅读位置和文件元数据字段；`src/features/reader/window-state.ts` / `window-state-api.ts` 同步移除 `width`、`height`、`x`、`y`；`reader_windows::create_reader_window()` 不再读取历史状态中的尺寸或位置，固定使用 reader 原型尺寸创建窗口。`src/app-shell.test.ts` 中 `reader windows receive and persist window state separately from settings` 静态确认 `is_window_state_visible_on_any_monitor` 和 `builder.inner_size(state.width...)` 不会回归。

- [x] 11.3 移除窗口位置可见性检查。完成时间：2026-07-02 17:20
  - 验收标准：阅读窗口不再恢复历史坐标，因此不再需要 monitor 可见性判断；多显示器变化不能把阅读窗口带到旧坐标。
  - 验证记录：窗口状态存储不再包含坐标，`reader_windows::create_reader_window()` 不再调用 `.position(x, y)` 或 `is_window_state_visible_on_any_monitor()`；`src/app-shell.test.ts` 静态断言这些历史恢复路径不会回归。

- [x] 11.4 实现阅读位置节流保存。完成时间：2026-06-30 20:38
  - 规则：滚动停止约 800ms 后保存，窗口关闭前强制保存。
  - 验收标准：滚动时不会高频写磁盘，关闭窗口不会丢失最后位置。
  - 验证记录：`ReaderPreviewWindow` 定义 `READING_POSITION_SAVE_DELAY_MS = 800`，滚动时通过 `scheduleReadingPositionSave()` 重置 timer，停止后调用 `saveReadingPosition()`；组件 cleanup 会清理 timer 并对当前 scroller 强制调用 `saveReadingPosition()`，覆盖窗口关闭/卸载前最后位置。执行 `pnpm test` 中 `reader windows receive and persist window state separately from settings` 静态确认 800ms 节流常量和 `saveWindowState` 链路。Playwright 在长文档 reader 页面滚动后等待 950ms，模拟 IPC 捕获 `save_window_state` 写入，最后一次状态包含 `scrollTop = 7842`、`scrollRatio = 0.3257726819541376`、`fileModifiedAt = 2026-06-30T11:00:00.000Z`、`fileSize = 19047`，验证滚动停止后才保存阅读位置。

- [x] 11.5 实现标题锚点优先恢复。完成时间：2026-06-30 20:38
  - 优先级：`activeHeadingId` + offset -> `scrollRatio` -> `scrollTop` -> 顶部。
  - 验收标准：重新打开文件后尽量回到上次阅读位置。
  - 验证记录：`getRestoreTarget()` 实现恢复优先级：存在且仍可找到的 `activeHeadingId` 优先，其次 `scrollRatio`、`scrollTop`、顶部；`ReaderPreviewWindow` 在 Markdown 渲染完成后读取 heading id 集合并执行恢复。执行 `pnpm test` 中 `restore target prefers active heading then ratio then scrollTop then top` 覆盖三层 fallback。Playwright 长文档验收注入 `activeHeadingId = "target-heading"`、`activeHeadingOffset = -12`，页面加载后实测 `.reader-preview-scroll.scrollTop = 7142`，目标 heading `offsetTop = 7154`，期望 `7154 - 12 = 7142`，当前大纲项为 `Target Heading`，验证标题锚点优先恢复准确。

- [x] 11.6 实现文件变化后的安全恢复。完成时间：2026-06-30 20:38
  - 验收标准：文件大小或修改时间变化明显时，不跳到明显错误位置；必要时回到顶部。
  - 验证记录：`getRestoreTarget()` 在当前文件大小与历史 `fileSize` 差异超过 20%，或修改时间变化且大小差异超过 5% 时返回 `{ kind: "top" }`。执行 `pnpm test` 中 `restore target falls back to the top when file size changed significantly` 通过。Playwright 长文档验收把历史状态保持在 `target-heading`，但注入明显增长后的文件内容和新的 `modifiedAt`，页面加载后实测 `scrollTop = 0`，当前大纲项为 `Long Restore Fixture`，验证明显变化时回到顶部而不是跳到错误位置。

- [x] 11.7 验证重复打开同一文件行为。完成时间：2026-06-30 20:38
  - 验收标准：窗口已存在时只聚焦，不重新加载，不重置当前滚动位置。
  - 验证记录：当前 `reader_windows.rs` 保持第 5.3 项已经实机验证过的重复打开分支：先查 `ReaderWindowRegistry.window_label_for_path()` 和现存 `WebviewWindow`，存在则调用 `focus_existing_reader_window()` 并返回 `created: false`，不会执行后续 `read_markdown_file()`、`WebviewWindowBuilder::new()` 或重新注入 bootstrap。第 5.3 项的真实 Tauri dev 烟测记录显示同一文件第一次 `open_reader_window("fixtures/markdown/basic-syntax.md")` 返回 `created: true`，第二次返回同一 label 且 `created: false`。本次复验执行 `pnpm test`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`、`pnpm tauri build` 均通过；Playwright 在同一 reader 页面把阅读区滚到 `scrollTop = 1234` 后仅执行聚焦等价操作，复查 `scrollTop` 仍为 `1234`、渲染 HTML 长度不变，确认已存在窗口被聚焦时不会触发前端重载或滚动重置。

## 13. 性能、兼容与安全

- [x] 13.1 实现 HTML sanitize 策略。完成时间：2026-07-02 10:04
  - 验收标准：Markdown 内嵌 `script`、事件属性、危险 URL scheme 不执行。
  - 验证记录：`src/features/markdown/markdown-renderer.ts` 继续使用 `rehype-raw` 后接 `rehype-sanitize` 的管线，并保留 KaTeX / 代码块所需 class 白名单。新增/复验 `src/features/markdown/markdown-renderer.test.ts` 中 `sanitizes unsafe markdown html while keeping the document readable`、`sanitizes mixed unsafe html without dropping surrounding trusted markdown`，确认 `<script>`、`onerror` / `onclick`、`javascript:` / `vbscript:` 被移除，周边可信 Markdown 和可读文本仍保留。2026-07-02 执行 `pnpm test`，133 项通过。

- [x] 13.2 实现图片加载失败状态。完成时间：2026-07-02 10:04
  - 验收标准：图片缺失或无权限时显示明确状态，不白屏。
  - 预备修复记录：2026-06-30 根据 `docs/test_md.md` 滚动到缺失图片时页面闪烁的问题，定位到重复 `img error` 事件会反复 `setFailedImageKeys(new Set(...))`，触发 React 重新提交 `.markdown-rendered-document` 的整段 `innerHTML`，导致同一坏图再次加载失败并形成循环。新增 `addMarkdownImageFailureKey()` 去重：失败 key 已存在时返回原 Set，让 React 跳过无意义重渲染。回归测试 `duplicate markdown image failure keys reuse the current set`、`new markdown image failure keys create an updated set` 通过；Playwright 预注入 reader bootstrap 打开 `docs/test_md.md` 后，缺失 `docs/assets/example-image.png` 的 1.5 秒图片错误事件从修复前 362 次降到 3 次，DOM mutation 从 2581 次降到 64 次。此记录不代表 13.2 已完成，仍需后续正式补齐无权限、本地 asset 协议和视觉状态验收后再勾选。
  - 验证记录：正式补齐 `reader-image-state` 回归测试，覆盖稳定失败 key、React 重绘后重套失败态、重复套用幂等、`asset://` / `currentSrc` fallback、空 alt 默认显示 `图片（加载失败）`、只给匹配失败 key 的图片加 `markdown-image-fallback`。`pnpm qa:reader-ui` 通过，桌面 1920x1080 和 small HiDPI 两个视口均验证缺失图片 `data-load-state="failed"`、alt 包含 `加载失败`、正文不白屏、代码块/公式错误/宽表格仍存在；截图输出 `output/playwright/reader-ui-desktop-1920.png` 和 `output/playwright/reader-ui-small-hidpi.png`。2026-07-02 执行 `pnpm test`，相关图片失败状态测试通过；执行 `pnpm qa:reader-ui`，状态为 `passed`。

- [x] 13.3 实现文件读取错误提示。完成时间：2026-07-02 10:04
  - 覆盖：不存在、权限不足、路径不是文件、编码异常。
  - 验收标准：错误可读，不吞掉异常。
  - 验证记录：Rust 侧 `normalize_markdown_path()` 和 `read_markdown_file()` 返回中文可读错误，不吞异常原文；测试覆盖非 Markdown / 缺失路径、目录伪装成 `.md`、UTF-8 解码失败，以及 `PermissionDenied` 读取错误格式化。2026-07-02 执行 `cargo test --manifest-path src-tauri/Cargo.toml`，24 项通过；执行 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` 通过。

- [x] 13.4 读取只读文件。完成时间：2026-07-02 10:04
  - 验收标准：只读 Markdown 仍可正常阅读。
  - 验证记录：新增/复验 `reads_readonly_markdown_files_without_requiring_write_access`，将临时 Markdown 设为只读后仍通过 `read_markdown_file()` 读取文件名和内容；测试清理阶段按 Windows / Unix 分支恢复权限，避免 `permissions_set_readonly_false` 风险误入 Unix 语义。2026-07-02 执行 `cargo test --manifest-path src-tauri/Cargo.toml`，24 项通过；严格 clippy 通过。

- [x] 13.5 大文件性能测试。完成时间：2026-07-02 10:04
  - 覆盖：1MB、5MB、10MB Markdown。
  - 验收标准：不会明显卡死应用；如果性能不足，记录瓶颈并决定是否引入 Web Worker。
  - 验证记录：新增 `tools/markdown-performance-check.mjs` 和 `pnpm qa:markdown-performance`，生成包含标题、段落、表格、代码、公式、缺失图片的大 Markdown 内容并直接验证渲染管线。2026-07-02 执行 `pnpm qa:markdown-performance` 通过：1MB 744ms / 阈值 12000ms，5MB 3318ms / 阈值 24000ms，10MB 9912ms / 阈值 45000ms；当前不需要引入 Web Worker，但后续如果默认开启更重的代码高亮语言集合，应重新测这一项。

- [x] 13.6 渲染错误隔离。完成时间：2026-07-02 10:04
  - 验收标准：单个代码块、公式、图片异常不会导致整体白屏。
  - 验证记录：`markdown-renderer.test.ts` 中 `renders KaTeX math without turning a bad formula into a blank document`、`unknown code languages render as plain text instead of failing`、`isolates bad code, math, and image blocks so later content still renders` 通过，确认坏公式、未知代码语言、缺失图片不会阻断后续正文。`pnpm qa:reader-ui` 同时验证页面存在 `.markdown-math-error`、代码块、宽表格和缺失图片失败态，且 `markdownError=false`。2026-07-02 执行 `pnpm test` 133 项通过，`pnpm qa:reader-ui` 通过。

- [x] 13.7 高 DPI / 小窗口布局验证。完成时间：2026-07-02 10:04
  - 验收标准：Windows 缩放和小窗口下没有明显模糊、遮挡、错位。
  - 验证记录：`pnpm qa:reader-ui` 使用 1920x1080 / deviceScaleFactor 1 和 980x700 / deviceScaleFactor 2 两个视口，验证大纲卡片、阅读卡片、设置按钮均在 viewport 内，正文无横向溢出，宽表格使用滚动容器，设置按钮不挤出窗口；输出 `reader-ui-desktop-1920.png`、`reader-ui-small-hidpi.png`。`pnpm qa:screenshots` 额外生成 open-file、reader、settings 在 1920x1080 和 980x700 下的 6 张截图到 `output/playwright/`。2026-07-02 两条 QA 均通过。真实 Windows 多档系统缩放安装后人工验收仍归第 12 / 15 项发布前流程。
  - 历史验证记录（已废弃）：2026-07-02 曾将 `pnpm qa:reader-ui` 小窗口 HiDPI 视口改为 `760x560@2x`；该宽度会触发现有 `<=980px` 单列布局，不再作为阅读窗口左右卡片最小验收口径。
  - 历史验证记录（已废弃）：2026-07-02 曾将 `pnpm qa:reader-ui` 小窗口 HiDPI 视口改为 `1024x560@2x`；用户实测该尺寸不足以保证大纲卡片和阅读卡片仍按批准方向左右分布，不再作为当前验收口径。
  - 追加验证记录：2026-07-02 当前阅读窗口最小内容尺寸为 `1320x560`，`pnpm qa:reader-ui` 的小窗口 HiDPI 视口同步改为 `1320x560@2x`。本轮执行通过：最小视口下 `usesTwoColumnCards = true`，大纲卡片宽 `336px`，阅读卡片宽 `918px`，两卡片间距 `30px`，右侧阅读卡片超过 `880px` 下限；设置按钮在 viewport 内，正文无横向溢出，宽表格使用滚动容器，输出 `reader-ui-desktop-1920.png` 和 `reader-ui-min-reader-hidpi.png`。
  - 追加验证记录：2026-07-02 18:00 复验 `pnpm qa:reader-ui` 通过；`1320x560@2x` 最小阅读视口仍为左右两列，大纲卡片宽 `336px`、阅读卡片宽 `918px`、卡片间距 `30px`，`usesTwoColumnCards = true`，正文无横向溢出，设置按钮在 viewport 内。
  - 追加验证记录：2026-07-02 19:46 根据用户确认的最终策略，阅读窗口改为打开时默认最大化、保留原生最大化按钮和标题栏双击最大化/还原、允许拖拽改变窗口大小，但通过 `min_inner_size(1320.0, 560.0)` 阻止内容区小于 `1320x560`。复验 `pnpm qa:reader-ui`、`pnpm qa:settings-ui`、`pnpm qa:markdown-performance`、`pnpm qa:screenshots` 均通过；执行 `pnpm tauri build --no-bundle --ci` 生成 `E:\only_md_reader\src-tauri\target\release\only-md-reader.exe`，未产出 MSI/NSIS 安装包。Win32 原生探针启动该 release exe 打开 `fixtures\markdown\basic-syntax.md`：初始 `IsZoomed = true`，内容区 `1920x1129`；双击原生标题栏还原后内容区为 `1320x560`，外框 `1336x599`；窗口样式包含 `WS_THICKFRAME` 和 `WS_MAXIMIZEBOX`；`WM_GETMINMAXINFO` 返回最小拖拽外框 `1336x599`；从右下角向内拖拽缩小时内容区仍被限制为 `1320x560`；再次双击标题栏可回到最大化，内容区 `1920x1129`。

- [x] 13.8 优化 Vite 大 chunk 警告和前端加载体积。完成时间：2026-07-02 10:04
  - 背景记录：2026-07-01 执行 `pnpm tauri build` 时构建成功，但 Vite 提示部分压缩后 chunk 超过默认 500 kB 阈值；这不是构建失败，也不阻塞当前 release exe 测试。
  - 重点排查：Shiki 语言包与主题加载范围、Markdown 渲染链初始化、是否需要动态加载 Shiki/KaTeX/渲染管线、是否需要配置 `manualChunks` 或减少默认打包语言集合。
  - 验收标准：性能优化阶段重新评估 chunk 组成和本地启动体验；如仍接受当前体积，应记录理由；如需要优化，应给出拆包或按需加载方案，并复验 `pnpm build` / `pnpm tauri build`。
  - 验证记录：将 Shiki runtime 改为 `import("shiki")` 动态加载，避免首屏 app shell 直接吞下完整高亮运行时；`src/app-shell.test.ts` 增加 `markdown renderer loads the Shiki runtime on demand instead of the app shell` 守门。2026-07-02 执行 `pnpm build` 成功，主入口 `assets/index-3nUP2oVQ.js` 约 183.09 kB / gzip 56.49 kB；执行 `pnpm tauri build` 成功，生成 `src-tauri/target/release/only-md-reader.exe`、MSI 和 NSIS。仍有 `wasm`、`cpp`、`emacs-lisp`、Shiki 运行时动态 chunk 超过 500 kB 的 Vite warning；当前接受为“代码高亮按需资源”而非首屏阻塞，不阻塞本阶段。后续若要继续压体积，应收敛默认 Shiki 语言 / theme 集合或更精细配置 dynamic import。

## 14. 自动化测试与视觉验证

- [x] 14.1 建立单元测试。完成时间：2026-07-02 10:04
  - 覆盖：slug 生成、heading 提取、主题 token 校验、设置迁移、路径规范化。
  - 验收标准：`pnpm test` 或对应测试命令通过。
  - 验证记录：当前 `pnpm test` 包含 `pnpm test:unit` 和 `pnpm typecheck`，覆盖 app shell、QA 入口、主题 token / CSS variables、打开文件 API、Markdown 渲染、图片失败状态、阅读大纲、滚动条、窗口状态、设置 API 和设置窗口等。2026-07-02 执行 `pnpm test`，133 项通过，TypeScript `tsc --noEmit` 通过。

- [x] 14.2 建立组件测试。完成时间：2026-07-02 10:04
  - 覆盖：打开文件窗口、阅读窗口、大纲、设置窗口。
  - 验收标准：核心 UI 状态可自动验证。
  - 验证记录：组件/视图状态通过仓库内 node test 与 QA 页面双层覆盖：`src/app-shell.test.ts` 验证打开文件窗口、阅读窗口布局、大纲、设置入口、资源边界；`src/features/settings/settings-window.test.ts` 验证设置 UI 状态；`tools/reader-ui-qa.html` / `tools/reader-ui-qa.tsx` 用真实 React 页面验证阅读窗口交互。2026-07-02 执行 `pnpm test` 133 项通过，`pnpm qa:settings-ui` 通过，`pnpm qa:reader-ui` 通过。

- [x] 14.3 建立 Playwright 截图验证。完成时间：2026-07-02 10:04
  - 覆盖：open-file、reader、settings；明亮/暗色；1920x1080、小窗口。
  - 验收标准：截图能稳定生成到 `output/playwright/`。
  - 验证记录：新增 `tools/playwright-screenshots.mjs` 和 `pnpm qa:screenshots`，通过本机 Chromium/CDP 生成原型截图。2026-07-02 执行 `pnpm qa:screenshots` 通过，生成 6 张截图：`open-file-desktop-1920x1080.png`、`open-file-small-980x700.png`、`reader-desktop-1920x1080.png`、`reader-small-980x700.png`、`settings-desktop-1920x1080.png`、`settings-small-980x700.png`，全部位于 `output/playwright/`。

- [x] 14.4 建立 Tauri 手工验收脚本。完成时间：2026-07-02 10:04
  - 覆盖：打开文件、多窗口、重复打开聚焦、设置保存、阅读位置恢复。
  - 验收标准：人工按脚本可重复验证第一版主流程。
  - 验证记录：新增 `docs/qa/tauri-manual-acceptance.md`，包含前置条件、打开文件、多窗口、重复打开聚焦、设置保存、阅读位置恢复、错误路径、图片失败和记录格式。`src/qa-workflows.test.ts` 增加清单存在性守门，2026-07-02 执行 `pnpm test` 133 项通过。该项完成的是“可重复手工验收脚本”本身，不代表第 15 项第一版人工验收已经完成。

- [x] 14.5 建立打包验收清单。完成时间：2026-07-02 10:04
  - 覆盖：Windows 安装、macOS 安装、文件关联、离线资源、高 DPI。
  - 验收标准：发布前能逐项确认。
  - 验证记录：新增 `docs/qa/package-release-checklist.md`，覆盖 Windows 安装、macOS 安装、文件关联、离线资源、高 DPI 和发布记录格式；`src/qa-workflows.test.ts` 验证该清单存在。2026-07-02 执行 `pnpm test` 133 项通过；执行 `pnpm tauri build` 成功生成 Windows exe / MSI / NSIS，作为清单可用性的当前构建证据。macOS 安装、系统文件关联、离线资源和真实安装后高 DPI 检查仍属于第 12 项发布前收口，不在当前项提前打勾。

## 12. 发布前收口：系统集成与打包

- 定位：发布前收口项，优先完成 13 / 14，再回到这一组。

- [ ] 12.1 配置 Windows 打包。完成时间：
  - 需求记录：第一版 Windows 发布只产出 MSI，不产出 NSIS；`bundle.targets` 不再使用 `all`，发布构建入口应限定为 MSI，例如 `pnpm tauri build --bundles msi`。
  - 安装目录策略：MSI 默认按 per-machine 安装到 `%ProgramFiles%\only-md-reader`；如果后续改成 per-user MSI，必须重新记录默认目录和升级/卸载行为。
  - 用户数据策略：安装目录只放程序文件；本地持久化数据继续使用 Tauri `app_data_dir()`，Windows 当前目标路径为 `%APPDATA%\com.onlymd.reader\`，包含 `settings.json`、`settings.corrupt.json`、`window-state.json`、`recent-files.json`，不写入安装目录或 Markdown 文件所在目录。
  - 验收标准：`pnpm tauri build --bundles msi` 只生成 MSI 发布包；安装后应用可从开始菜单/安装目录启动；安装目录、卸载项、开始菜单快捷方式和应用数据目录符合上述策略；发布产物中不包含 NSIS 安装包。

- [ ] 12.2 配置 macOS 打包。完成时间：
  - 需求记录：macOS 第一版对外发布 DMG，内部测试可保留 `.app`；macOS 不做 Windows 式安装器勾选项，不在阅读器首次启动时弹默认程序引导。
  - 打包环境：macOS 发布包必须在 Mac 上构建；正式外部分发需要 Apple Developer 账号、Developer ID Application 证书、签名、公证和 staple。没有 Mac 或没有签名/公证条件时，必须明确记录为未验证/不可正式分发。
  - 构建入口：普通构建使用 `pnpm tauri build --bundles app,dmg`；如需同时支持 Intel 和 Apple Silicon，优先评估 `pnpm tauri build --target universal-apple-darwin --bundles app,dmg`。
  - 文件关联策略：通过 app bundle document types / Tauri `fileAssociations` 让 `.md` / `.markdown` 可由本应用打开；用户以后可在 Finder `Get Info -> Open with -> Change All` 手动设为默认。
  - 验收标准：在 macOS 实机上生成 `.app` 和 `.dmg`；安装/拖入 Applications 后可启动；Finder 中 Markdown 文件可选择本应用打开；签名、公证、Gatekeeper 状态有明确记录。

- [x] 12.3 注册 `.md` / `.markdown` 文件关联。完成时间：2026-07-06
  - 验收标准：系统打开方式中能选择本应用。
  - 进展：2026-07-02 已在 `src-tauri/tauri.conf.json` 的 `bundle.fileAssociations` 注册 `ext: ["md", "markdown"]`、`mimeType: "text/markdown"`、`role: "Viewer"`；`src/app-shell.test.ts` 增加 `desktop bundle declares markdown file associations for default app opening` 静态守门；`pnpm tauri build --no-bundle --ci` 可成功构建 release exe。当时尚未安装 MSI/NSIS 并在 Windows “打开方式”系统界面实机确认，后续由 2026-07-06 的 Windows MSI 注册补充项完成确认。
  - 追加需求：Windows MSI 安装时无论用户是否选择“设为默认程序”，都必须注册本应用的 Markdown 打开能力，使用户之后仍可在右键“打开方式”或 Windows 默认应用设置中手动选择 `MD 极简阅读` 打开 `.md` / `.markdown`。
  - Windows 注册范围：应注册本应用自己的 ProgID、图标、open command、`RegisteredApplications` / `Capabilities\FileAssociations` 等必要项，让 Windows 默认应用页面能识别本应用；不要依赖阅读器首次启动来补注册。
  - 验收补充：安装 MSI 后，在 Windows “打开方式”和“按文件类型选择默认值”中能看到本应用；卸载清理按 12.8 单独验收。
  - 追加进展：2026-07-06 新增 `src-tauri/wix/markdown-default-app.wxs` 并通过 `src-tauri/tauri.conf.json` 的 WiX `fragmentPaths` / `componentRefs` 纳入 MSI，注册 `HKLM\Software\RegisteredApplications`、`Capabilities\FileAssociations`、`Capabilities\MIMEAssociations`、`Software\Classes\OnlyMdReader.Markdown`、`Software\Classes\Applications\only-md-reader.exe\SupportedTypes` 和 open command。MSI 数据库检查确认 `.md`、`.markdown`、`text/markdown`、`OnlyMdReader.Markdown`、`Applications\only-md-reader.exe` 均存在，且未写入 `UserChoice`。用户 2026-07-06 确认安装器实测通过；同日重新构建 `src-tauri\target\release\bundle\msi\MD极简阅读_0.1.1_x64_zh-CN.msi` 并复验 MSI 数据库。

- [ ] 12.4 支持双击 Markdown 文件打开。完成时间：
  - 验收标准：双击 `.md` 文件能启动应用并打开对应文件。
  - 进展：2026-07-02 已验证默认程序/双击最终会走到的启动参数路径：release exe 传入 `.md` 路径时直接进入 reader window，`hasOpenFileTitle = false`，不再创建打开文件窗口；文件关联安装后的真实双击仍未验收，因此本项不打勾。

- [x] 12.5 提供默认打开程序引导。完成时间：2026-07-06
  - 需求记录：默认程序相关体验必须发生在安装阶段，不在阅读器第一次打开时做引导或弹窗，保持阅读器主流程干净。
  - Windows 安装器体验：MSI 安装完成阶段提供默认勾选项，例如“安装完成后设置 Markdown 默认打开程序”。用户可以取消勾选；取消后仍保留 12.3 的打开方式候选注册，方便以后手动设置。
  - 实现边界：Windows 10/11 不承诺由安装器静默替换已有 `.md` / `.markdown` 默认程序；勾选后应打开 Windows 默认应用设置页或文件类型关联设置页，让用户在系统 UI 中确认。不要通过删除/伪造 `UserChoice`、反推 hash、调用非公开工具等方式强行接管。
  - 验收标准：安装器默认勾选项可见且可取消；勾选时安装完成后进入 Windows 默认应用确认路径；未勾选时不弹阅读器内引导；任一情况下用户之后都能手动把 `.md` / `.markdown` 设为本应用。
  - 追加进展：2026-07-06 新增自定义 WiX 模板 `src-tauri/wix/main.wxs`，将 Tauri 默认结束页“启动应用”勾选项改为默认勾选的“安装完成后打开 Windows 默认应用设置，设置 MD 极简阅读为 Markdown 默认打开程序”；勾选时 `ExitDialog` 的 Finish 事件执行 `LaunchDefaultAppsSettings`，通过 `explorer.exe "ms-settings:defaultapps?registeredAppMachine=MD%20%E6%9E%81%E7%AE%80%E9%98%85%E8%AF%BB"` 打开 Windows 默认应用设置。MSI 数据库检查确认 `WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1`、上述 checkbox 文案、`LaunchDefaultAppsSettings` 自定义动作和 `ExitDialog -> Finish -> DoAction` 事件均存在。用户 2026-07-06 确认安装器实测通过；同日重新构建 v0.1.1 MSI 并复验安装完成页相关 MSI 数据库记录。

- [ ] 12.6 验证离线资源可用。完成时间：
  - 覆盖：Maple Mono NF CN、KaTeX、Shiki、`Eva Light Bold` / `Eva Dark Bold` 代码主题 JSON。
  - 验收标准：断网状态下核心阅读能力正常。

- [ ] 12.7 审计运行时资源无外部依赖。完成时间：
  - 覆盖：源码、构建产物、HTML、CSS、JS、主题 JSON、字体声明、KaTeX/Shiki 初始化路径。
  - 禁止：CDN 脚本、CDN 样式、远程字体、远程主题、运行时从第三方 URL 拉取应用资源。
  - 验收标准：构建产物中没有应用运行依赖的 `http://`、`https://`、`cdn.`、`unpkg`、`jsdelivr` 等远程资源引用；断网启动应用不缺字体、样式、公式和代码主题。

- [ ] 12.8 明确 Windows 卸载处理。完成时间：
  - 需求记录：卸载时清理程序文件、开始菜单/桌面快捷方式、卸载项和本应用创建的文件关联注册；不要删除其他应用的 ProgID，不猜测、不恢复用户曾经使用过的旧 Markdown 默认程序。
  - 默认程序边界：如果卸载时本应用曾是 `.md` / `.markdown` 默认打开程序，卸载器只删除本应用注册能力并通知 Shell 关联变化；让 Windows 在用户下次打开 Markdown 或进入默认应用设置时重新选择，不主动改成 VS Code、Typora、Obsidian、记事本或任何其他应用。
  - 用户数据策略：默认保留 `%APPDATA%\com.onlymd.reader\` 下的 `settings.json`、`settings.corrupt.json`、`window-state.json`、`recent-files.json`；可在卸载器中提供“同时删除用户设置、最近文件和阅读位置”选项，但默认不勾选。
  - 验收标准：卸载后安装目录、快捷方式、卸载项和本应用文件关联候选项被清理；默认保留用户数据；只有用户明确勾选删除数据时才删除应用数据目录；卸载过程不破坏其他 Markdown 应用的注册信息。

## 15. 第一版可用验收

- [ ] 15.1 Windows 下应用可启动。完成时间：
  - 验收标准：开发模式和打包后都能启动。

- [ ] 15.2 可以稳定打开 `.md` / `.markdown` 文件。完成时间：
  - 验收标准：普通文件、中文路径文件、只读文件都可阅读。

- [ ] 15.3 单文件单窗口模型正确。完成时间：
  - 验收标准：不同文件多窗口，同一文件重复打开聚焦已有窗口。

- [ ] 15.4 Markdown / GFM / 大纲正确。完成时间：
  - 验收标准：样本文档渲染稳定，大纲层级、跳转、同步正确。

- [ ] 15.5 公式和代码高亮正确。完成时间：
  - 验收标准：KaTeX、Shiki、本地资源和主题切换都正常；明亮模式代码块使用 `Eva Light Bold`，暗色模式代码块使用 `Eva Dark Bold`。

- [ ] 15.6 明亮、暗色、跟随系统模式正确。完成时间：
  - 验收标准：主题切换即时生效，颜色来自 JSON token。

- [ ] 15.7 设置持久化正确。完成时间：
  - 验收标准：主题、字体、字号、行高、正文宽度、代码主题重启后仍生效。

- [ ] 15.8 阅读位置恢复正确。完成时间：
  - 验收标准：文件关闭后再次打开回到上次阅读位置；窗口未关闭时重复打开不重置滚动。

- [ ] 15.9 高 DPI 和小窗口体验可接受。完成时间：
  - 验收标准：无明显模糊、遮挡、布局错位。

- [ ] 15.10 第一版不包含批注功能。完成时间：
  - 验收标准：不引入源文件写回、选区改写、批注保存冲突等复杂度。

## 16. PDF 导出 V1：原生无界面直出

> 16.1–16.10 是已废弃的系统打印路线记录，仅保留问题背景与历史验证；当前产品边界以 16.11 起、`docs/technical-architecture.md` 第 9.1 节及 `docs/superpowers/plans/2026-07-16-pdf-export-native-direct-implementation.md` 为准。

- [x] 16.1 冻结 PDF 导出 V1 的产品与技术边界。完成时间：2026-07-16
  - 已确认：仅通过阅读窗口的按钮触发；默认 A4；固定浅色打印主题；不显示文件名；不做自定义页眉页脚；不提供导出快捷键。
  - 已确认：导出打开系统打印流程，用户自行选择“另存为 PDF”；不直接保存到指定路径。
  - 验收标准：技术架构、产品路线图、实施工作列表与设计说明不再将 PDF 导出列为“当前明确不做”，且四份文档的 V1 边界一致。
  - 验证记录：2026-07-16 已根据用户确认将 V1 规格写入 `docs/superpowers/specs/2026-07-16-pdf-export-system-print-design.md` 及项目基线文档。

- [x] 16.2 建立 PDF 导出前端模块与状态机。完成时间：2026-07-16 16:25
  - 建议新增：`src/features/export-pdf/export-pdf.ts`、`src/features/export-pdf/export-readiness.ts`、对应测试和 README。
  - 状态至少覆盖 `idle`、`preparing`、`resource-timeout`；导出期间拒绝重复触发，结束、取消或异常后恢复 `idle`。
  - 验收标准：没有 Markdown 渲染完成结果时不允许打印；连续点击不会打开多个系统打印流程；用户取消打印后可再次导出。

- [x] 16.3 在阅读窗口增加导出按钮并阻止导出快捷键。完成时间：2026-07-16 16:25
  - 修改 `src/features/reader/ReaderPreviewWindow.tsx`、`src/features/reader/reader-preview.ts` 和相关样式。
  - 按钮位于现有设置按钮正上方，尺寸同为 `32px × 32px` 圆形；悬停提示和无障碍名称均为“导出为PDF文档”。
  - 导出仅允许点击按钮触发；拦截 `Ctrl+P` / `Cmd+P`，不让其绕过资源准备流程或直接打开系统打印。
  - 验收标准：按钮不遮挡正文、代码块、公式或表格；大纲隐藏、小窗口和高 DPI 下仍与设置按钮保持正确布局。

- [x] 16.4 实现导出前资源稳定性检查。完成时间：2026-07-16 16:25
  - 在调用 `window.print()` 前依次等待 Markdown 渲染完成、`document.fonts.ready`、正文图片完成加载或进入既有失败占位状态，以及最终布局帧。
  - 图片继续加载超过约定超时后中止本次导出并提示重试；已失败图片保留失败占位但允许导出。
  - 验收标准：本地图片、无图片、加载失败图片、慢加载图片和主题切换后的重渲染均不会产生缺图或半布局 PDF。

- [x] 16.5 编写专用打印 CSS 与分页规则。完成时间：2026-07-16 16:25
  - 建议新增 `src/features/export-pdf/pdf-export.css`，使用 `@page` 和 `@media print`；默认 A4、浅色高对比、合理页边距。
  - 打印时隐藏大纲、导出/设置按钮、复制控件、选择浮层、自定义滚动条、返回按钮、卡片阴影、文件名和文件路径。
  - 打印时解除阅读滚动容器的固定高度和 overflow 限制，让完整正文进入文档流。
  - 为标题、图片、引用、代码块、表格和块级公式定义分页与宽度规则；极长单块可以自然跨页，但不得裁切右侧内容。
  - 验收标准：暗色阅读模式导出的 PDF 仍为浅色打印版；长文不会只导出当前可见区域。

- [x] 16.6 调用系统打印并处理错误状态。完成时间：2026-07-16 16:25
  - 资源稳定后只调用前端 `window.print()`；不新增 Rust PDF 写文件 command、不创建隐藏导出窗口。
  - 用户取消系统打印不显示错误；资源超时、渲染未完成或无法打开系统打印时显示明确、非阻塞错误。
  - 验收标准：不修改 Markdown、阅读位置、设置或窗口状态；取消后仍可继续阅读和再次导出。

- [x] 16.7 补充单元测试和阅读窗口 UI 回归。完成时间：2026-07-16 16:25
  - 资源准备逻辑至少覆盖：无图片、成功图片、失败图片、超时图片、渲染中、并发触发和状态复位。
  - 扩展 `pnpm qa:reader-ui`：验证按钮位置、禁用状态、点击触发、快捷键拦截及对设置/大纲/滚动等既有交互的无回归。
  - 验收标准：`pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm qa:reader-ui` 全部通过。

- [x] 16.8 新增 PDF 专项 QA 与样本矩阵。完成时间：2026-07-16 16:25
  - 新增 `pnpm qa:pdf-export`，验证打印媒体 CSS，并生成或检查至少一个真实多页 PDF。
  - 样本覆盖：中文长文、宽表格、长代码、行内/块级公式、本地图片、失败图片、明暗阅读模式和隐藏大纲。
  - 验收标准：PDF 非空、至少多页、正文文本可提取，且不包含阅读器 UI；输出截图或渲染页保存到约定 QA 输出目录。

- [x] 16.9 平台实机验证和无安装包构建。完成时间：2026-07-16 16:25
  - Windows：实际调用系统打印、选择 PDF 输出、检查中文字体、长文分页、本地图片、公式、表格和取消流程。
  - macOS：若无实机环境，明确记录“未验证”，不得以 Windows 结果替代。
  - 验收标准：运行 `pnpm tauri build --no-bundle --ci` 成功；汇报中区分已完成、已验证、未验证和已知限制。
  - 验证记录：2026-07-16 已运行 `pnpm test`（167/167）、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm qa:reader-ui`、`pnpm qa:markdown-performance`、`pnpm qa:pdf-export`、`pnpm qa:screenshots`、`cargo test --manifest-path src-tauri\Cargo.toml`（26/26）和 `pnpm tauri build --no-bundle --ci`，全部通过。`qa:pdf-export` 实际生成 4 页、195596 bytes 的 A4 PDF。Windows release exe 的 UI Automation 已定位并调用“导出为PDF文档”按钮；系统打印预览在同一阅读窗口内暴露“打印”“打印机”“取消”“PDF Document”“包含 2 页的 PDF 文档”等可访问元素，确认真实系统打印流程已打开。

- [x] 16.10 修正 Windows 打印对话框和浏览器自动页眉页脚。完成时间：2026-07-16
  - 原因：前端 `window.print()` 打开 WebView2 浏览器打印预览，自动输出日期、应用标题、`tauri.localhost` 和页码，并占用整个阅读窗口。
  - 实现：Windows 调用 WebView2 `ICoreWebView2_16::ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM)` 打开紧凑系统对话框；非 Windows 保留 `window.print()` 回退。导出流程等待原生请求完成后才恢复按钮状态。
  - 验收标准：Windows 不再进入浏览器预览，用户仍可在系统对话框选择 PDF 打印机，PDF 不含上述浏览器自动页眉页脚。
  - 验证记录：2026-07-16 已新增前端桥接和异步打印请求单元测试，并完成 `cargo check --manifest-path src-tauri\Cargo.toml` 与 release 构建；最终 Windows 系统对话框及实际 PDF 内容待在可点击到导出控件的 release 窗口中复验。

- [x] 16.11 以 Windows WebView2 原生无界面导出取代系统打印。完成时间：2026-07-16
  - Rust command `export_pdf` 复用当前阅读 WebView 的 `ICoreWebView2_7::PrintToPdf`，使用 A4 纵向、关闭 CSS 背景打印与关闭页眉页脚的 print settings；删除 `open_pdf_print_dialog`、`ShowPrintUI` 与浏览器 `window.print()` 回退。
  - 输出至 Markdown 同目录，先输出唯一临时 PDF，再移动为同名 `.pdf`；已存在时按 ` (1)`、` (2)` 递增，避免覆盖。
  - 前端导出状态改为等待原生写入完成后再恢复按钮；浏览器预览环境明确报错，不再伪造打印流程。
  - 验收标准：Rust 单测覆盖同名递增输出路径；前端单测覆盖原生 command、等待写入和无浏览器 fallback；`cargo test --manifest-path src-tauri\Cargo.toml` 通过。
  - 验证记录：2026-07-16 `cargo test --manifest-path src-tauri\Cargo.toml` 27/27 通过；Windows 实机导出见 16.13。

- [x] 16.12 实现阅读窗口左下角通知栈。完成时间：2026-07-16
  - 通知背景使用应用背景、圆角和强阴影；错误字体继承阅读字体。通知从左至右出现、从右至左关闭。
  - 通知数组按旧到新顺序渲染，使最新通知固定在最下方、旧通知向上堆叠；成功通知 3 秒后自动关闭。
  - 活跃错误最多三条；第四条错误出现时最旧错误先进入关闭动画。错误通知不提供重试或操作按钮，只显示失败原因。
  - 验收标准：通知 reducer 单测覆盖最新位置、错误上限和最旧关闭；PDF QA 覆盖左下角位置、圆角、应用背景、阅读字体、打印态隐藏与导出按钮不调用浏览器 `window.print()`。
  - 验证记录：2026-07-16 `pnpm test` 173/173 通过，`pnpm qa:pdf-export` 通过并生成 4 页、195596 bytes 的打印 CSS QA PDF。
  - 追加修正记录：2026-07-20 PDF 导出通知改为标题与详情两行结构。成功时第一行显示“PDF文件已导出！”，第二行从原生 `outputPath` 提取 PDF 文件名且不显示路径；失败时第一行显示“PDF导出失败！”，第二行保留资源等待、原生写入或准备阶段产生的具体原因。根据用户实机截图复验，通知框左右两侧与大纲卡片边缘的距离调整为和底部留白相同的 `6px`，最终宽度为 `324px`，相对窗口的左偏移和底偏移均为 `24px`，通知项占满栈宽。回归测试先确认文件名函数、结构化通知类型和两行 DOM/几何断言在旧实现上失败；修复后 `pnpm test`（191/191）、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm qa:pdf-export`、`pnpm qa:reader-ui` 和 `pnpm tauri build --no-bundle --ci` 全部通过。PDF QA 在 `1440×900 @ 1x` 下实际点击并检查成功通知，保存 `output/playwright/pdf-export-notification.png` 后人工核对无路径、裁切或溢出；同一 QA 也验证失败通知与打印态隐藏。新测试 EXE 为 `E:\only_md_reader\.worktrees\pdf-export-notification\src-tauri\target\release\only-md-reader.exe`，大小 `45,326,848` bytes，SHA-256 为 `9C21401A41F05A2C12C2CC9104E7F25854871F5DA58631CED832951C8AED172F`。

- [x] 16.13 Windows 实机无界面导出与 release 构建。完成时间：2026-07-16
  - 使用 `pnpm tauri build --no-bundle --ci` 构建新的 release exe；打开包含中文、长文、表格、长代码、公式和本地图片的 fixture，点击导出按钮。
  - 验收标准：无浏览器预览、系统打印或保存路径窗口；源文件同目录出现非空 PDF；重复导出不覆盖而生成递增文件名；检查多页、可读取、无日期/URL/页码等浏览器页眉页脚。
  - macOS：当前未实现原生无界面输出；必须验证通知显示明确错误，不能以 Windows 结果替代。
  - 验证记录：2026-07-16 使用 `pnpm tauri build --no-bundle --ci` 成功构建 release exe；通过 Windows UI Automation 点击导出按钮，未出现标题含“打印”或“Print”的窗口。源文件同目录生成 `only-md-reader-native-export-qa.pdf` 与重复导出的 `only-md-reader-native-export-qa (1).pdf`，各 21,296 bytes。用 Poppler 与 pypdf 检查均为 2 页、可读取，正文包含 fixture 内容，不含 `tauri.localhost` 或应用标题；渲染两页图片人工核对，无浏览器日期、URL、页码、文件名页眉页脚。

- [x] 16.14 修正 PDF 导出继承阅读器彩色样式的问题。完成时间：2026-07-16
  - 打印 CSS 统一使用白色背景、黑色文字和灰黑边框；原生 `PrintToPdf` 同时关闭 CSS 背景打印，删除阅读卡片顶部渐变、代码块底色与 Shiki 语法色、表头填充、链接颜色及其他正文背景色。
  - 验收标准：打印态下阅读容器、代码块和表头均为白色；代码 token、链接和正文均为黑色；阅读卡片顶部伪元素不再绘制渐变。
  - 验证记录：先扩展 `pnpm qa:pdf-export` 断言并确认旧样式失败，再修复后通过；生成 4 页、193,961 bytes PDF，Poppler 渲染第一页人工核对为纯白黑字样式。

- [x] 16.15 固定 PDF 正文字号并阻止超宽内容缩小整份 PDF。完成时间：2026-07-17
  - 原因：打印正文的 `11pt` 被后加载的阅读界面字号覆盖；不可换行的行内代码等内容还会扩张打印布局，触发 WebView2 将整份 PDF 等比缩小，导致不同 Markdown 文件导出的正文大小不一致。
  - 实现：打印正文强制使用 `11pt`；普通文本、链接、行内代码和代码块允许在 A4 可打印宽度内换行；图片限制到页面宽度；表格固定在自身容器内以 `9pt` 排版并允许单元格换行；只有超过 A4 可打印宽度的块级 KaTeX 公式在导出期间按超宽比例局部缩小，原生 PDF 写入结束后立即恢复页面状态。
  - 验收标准：使用同一测试版分别导出 `AGENTS.md`、`docs/implementation-worklist.md`、`docs/test_md.md` 等宽度差异明显的文档，普通正文视觉字号一致；长内容不裁切右侧；纵向内容自然分页；超宽表格或公式不能带动整份 PDF 缩小。
  - 自动验证：2026-07-17 先扩展 `pnpm qa:pdf-export` 并确认旧实现失败：打印正文为 `16px`，注入的不可断行行内代码使正文 `scrollWidth` 从 `749px` 扩张到 `3178px`。修复后打印正文为 `14.6667px`（`11pt`），`scrollWidth` 与 `clientWidth` 相等；专项 QA 生成 4 页、196,580 bytes 的 PDF，文本分析得到正文主字号约 `10.995pt`。`pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm qa:pdf-export`、`pnpm qa:reader-ui` 和 `pnpm tauri build --no-bundle --ci` 均通过。
  - 用户复验：2026-07-17 确认不同文档的正文视觉字号已经一致，同时发现 `src-tauri`、`export-pdf` 等行内代码会在连字符后拆行。实际 PDF 文本提取确认字符未丢失，根因是打印 CSS 对所有行内代码启用了任意断行。已改为：可在 A4 单行内放下的行内代码保持完整并整体换行；只有单个代码串自身超过可打印宽度时才允许内部强制换行。对应红绿测试、PDF 专项 QA 和阅读界面回归均通过。
  - 第二次用户复验：2026-07-17 确认单词链拆行显著减少，但 `implementation-worklist (1).pdf` 再次被整页缩小。实测其正文为约 `7.327pt`、22 页，而同批 `AGENTS (1).pdf` 正文为约 `10.99pt`、6 页；A4 页面和内嵌字体一致。运行时打印诊断确认多个可单独放下的行内代码由中文顿号连续连接时，浏览器将整串视为不可断行区域，使正文从 `749px` 扩张到 `1687px`。普通行内代码改为原子级 `inline-block` 后，可在代码片段边界换行，真实实施清单打印宽度恢复为 `749px`；专项回归样本修复前从 `420px` 容器扩张到 `1632px`，修复后整个文档宽度保持 `749px`。
  - 最终用户复验：2026-07-17 使用第三版 Windows 测试 EXE 再次导出真实文档，确认字号一致、行内代码链换行和页面完整性符合条件，本项验收完成。

- [x] 16.16 增加 PDF 全局自动缩小设置并将初始正文字号调整为 `12pt`。完成时间：2026-07-18
  - 产品定义：设置名称为“允许自动缩小 PDF 内容”，默认关闭；两种模式都从 `12pt` 开始且不跟随阅读器字号。关闭时保留换行、图片限宽和表格/公式局部适配，禁止整份 PDF 缩小；开启时允许超宽内容触发 WebView2 整体缩小，接受不同文档最终字号不一致。
  - 第一阶段 UI：2026-07-17 已完成 `docs/ui/settings.html` 明暗主题原型，并将开关移植到真实 `SettingsWindow`。前端和 Rust 设置契约新增 `pdfAllowGlobalScaling` / `pdf_allow_global_scaling`，默认 `false`，旧设置缺字段时保持关闭；点击开关沿用现有持久化、广播和保存失败回滚链路。用户指定的开/关 SVG path 已原样嵌入并跟随主题颜色。
  - 第一阶段验证：设置契约和 SVG 结构先红后绿；`pnpm qa:settings-ui` 实测默认 `aria-pressed=false`，点击后为 `true`，可见图标切换为 `toggle-icon-on`，保存 patch 为 `{ pdfAllowGlobalScaling: true }`，设置行完整位于面板内。PDF 导出逻辑尚未读取该设置。
  - UI 复验调整：2026-07-17 根据真实 EXE 截图移除 SVG 开关外层按钮底色、圆角和描边；关闭、悬停、开启状态分别严格使用 `controlBorder`、`controlFocusBorder`、`switchTrackOn`。设置窗口由 `900×680` 逐步收紧为 `900×500`，只回收 PDF 设置项下方的空白，不改变两个字体下拉框的宽度、高度、字号与行布局；表单上移并把单列响应式断点从 `760px` 收紧到 `560px`，避免高 DPI 下误切单列造成底部溢出。
  - UI 二次复验调整：2026-07-17 字体下拉菜单的最小可视高度固定为四个完整选项（`4 × 42px = 168px`），最大高度仍为 `196px`，超出部分继续滚动；PDF 开关关闭且未悬停时的图标色改为色板中的 `textSecondary`，悬停和开启状态颜色保持不变。
  - 下拉层级修复：2026-07-17 四项代码字体菜单向上展开时会进入窗口标题区域，原先标题层级 `4` 高于设置面板层级 `3`，导致“设置”文字绘制在菜单内容上。展开期间将设置面板临时提升到层级 `5` 并隐藏窗口内标题，收起后自动恢复；菜单高度、窗口尺寸和其他设置样式保持不变。
  - 下拉阴影调整：2026-07-17 为展开菜单新增明暗主题独立的 `dropdownShadow` 色板变量并保留 `controlBorder` 内描边；暗色主题采用两层高强度黑色阴影，避免菜单与深色底层融为一体。触发框、四项高度、颜色和展开方向保持不变。
  - 下拉滚动条光标调整：2026-07-17 滚动条热区、轨道、滑块及拖动状态统一使用普通箭头光标；轨道点击、滑块拖动和自动显隐行为保持不变。
  - PDF 设置说明调整：2026-07-17 更新为“超宽内容可能触发整页缩小，导致不同文件字号显示不同”，更直接说明开启自动缩小时的跨文件字号差异风险；布局与样式保持不变。
  - 高 DPI 验证：`pnpm qa:settings-ui` 增加 `600×427 @ 1.5x` 等效视口，实测 PDF 设置行底部为 `329.42px`、版本号顶部为 `367.61px`，无重叠；随后重新构建 Windows 测试 EXE，并在当前系统缩放下确认浅色真实 Tauri 设置窗口为 `902×532`（含原生标题栏），四行布局和开关状态均完整。阅读字体、代码字体下拉框的收起尺寸未改变，真实窗口中分别展开后会按可用空间向下或向上显示，选项列表可正常滚动且没有被窗口边界裁断。
  - 功能实现：2026-07-17 18:22 阅读窗口在每次导出开始时读取并锁定当前 `pdfAllowGlobalScaling`。关闭时执行公式与超长行内代码的局部适配，并通过打印 CSS 将代码块、表格、图片和公式限制在 A4 可打印宽度；开启时跳过局部适配并仅对这些极端宽内容解除宽度保护，让 WebView2 决定是否整体缩小。两种模式结束或失败后都会恢复临时 DOM 属性和局部样式，阅读窗口字号不受影响。
  - 自动验证：先补充失败测试，确认旧实现无条件局部适配且仍为 `11pt`；修复后 `pnpm test`（189/189）、`pnpm lint`、`pnpm format:check`、`pnpm build`、`cargo test --manifest-path src-tauri\Cargo.toml`（30/30）、`pnpm qa:settings-ui`、`pnpm qa:reader-ui` 和 `pnpm qa:pdf-export` 全部通过。PDF QA 中固定模式文档宽度保持 `749px`，自动缩小模式允许同一超宽样本扩张到 `1569px`。
  - PDF 结果：同一 A4 样本在固定模式下正文主字号为 `12pt`、共 4 页；自动缩小模式由打印引擎缩为 `8pt`、共 2 页。设备像素比模拟为 `1.5x` 后，固定模式仍是相同 A4 页面尺寸、`12pt` 和 4 页。两份 PDF 已渲染并人工核对，固定模式超宽表格正常换行，自动模式正文整体缩小。
  - 测试构建：`pnpm tauri build --no-bundle --ci` 已成功，测试 EXE 为 `src-tauri/target-pdf-setting-ui-test/release/only-md-reader.exe`，SHA-256 为 `F33669064DB8751C4758593AEF36954B7E7EF56BA62F8817DFB03261493BC114`。该版本随后通过用户真实文档复验。
  - 用户验收：2026-07-18 用户使用真实文档复验固定 `12pt` 与允许整页自动缩小两种模式，确认结果无问题，本项验收完成。

## 17. 批注阶段，第一版完成后再启动

- [ ] 16.1 解析已有 CriticMarkup。完成时间：
  - 验收标准：`{==text==}`、`{>>comment<<}`、`{++text++}`、`{--text--}`、`{~~old~>new~~}` 可识别。

- [ ] 16.2 渲染 CriticMarkup。完成时间：
  - 验收标准：高亮、评论、新增、删除、替换建议都有明确样式。

- [ ] 16.3 创建高亮评论批注。完成时间：
  - 验收标准：用户可选中文本并生成 `{==text==}{>>comment<<}`。

- [ ] 16.4 写回 Markdown 源文件。完成时间：
  - 验收标准：批注直接写入源文件，Git diff 可读。

- [ ] 16.5 阻止危险选区写回。完成时间：
  - 验收标准：跨块选区、代码块内部字符级批注、公式内部字符级批注被拒绝，不破坏 Markdown。

## 18. 当前明确不做

- Markdown 正文编辑器。
- 标签页。
- 文件管理器。
- 文件树。
- 全文搜索。
- 直接保存到指定路径的 PDF 导出、静默导出和自定义 PDF 模板。
- 云同步。
- 账号系统。
- 实时多人协作。
- 插件系统。
- 第一版内实现 CriticMarkup 批注。
