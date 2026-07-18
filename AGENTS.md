# AGENTS.md

## 1. 默认沟通语言

默认使用中文沟通。除非用户明确要求其他语言，或某些技术名词、代码标识无法准确翻译。

回答应直接、具体、可验证。不要编造事实、依赖或实现状态。不确定时直接说明不确定，并给出需要验证的路径。

## 2. 项目定位

本项目是一个面向 Windows 和 macOS 的 Markdown 阅读器。

核心定位：

- 纯阅读优先，不做完整 Markdown 编辑器。
- 一个窗口阅读一个 Markdown 文件，支持多开窗口。
- 极简 UI：左侧大纲，右侧渲染视图。
- 支持明亮模式、暗色模式、跟随系统。
- 支持高 DPI / Retina。
- 支持自定义正文字体和代码字体。
- 支持注册为 `.md` / `.markdown` 默认打开程序。
- 批注功能最后实现，采用 CriticMarkup 直接写回 Markdown 源文件。

## 3. 项目基线文档

后续沟通和实现默认以以下文档为基线：

- `docs/technical-architecture.md`
- `docs/feature-roadmap.md`
- `docs/implementation-worklist.md`

开始重要实现前，先阅读这三个文件，避免重复讨论已定决策。

如果用户提出的新要求与基线文档冲突，应先指出冲突，再确认是否更新基线文档。

文档分工：

- `docs/technical-architecture.md`：技术路线、架构边界、关键实现方案。
- `docs/feature-roadmap.md`：产品级路线图，只写阶段、功能项、产品验收口径。
- `docs/implementation-worklist.md`：执行级工作列表，维护实现步骤、完成状态、完成时间、验收标准和验证记录。

## 4. 已定技术方案

默认技术栈：

```text
桌面框架：Tauri 2
前端框架：React
语言：TypeScript + Rust
构建：Vite
Markdown 管线：unified / remark / rehype
数学公式：KaTeX
代码高亮：Shiki
默认代码块主题：VS Code Eva Theme，亮色使用 Eva Light Bold，暗色使用 Eva Dark Bold
资源策略：运行时资源全部包内加载，禁止 CDN 和远程资源依赖
批注格式：CriticMarkup
```

不要在没有明确理由和用户确认的情况下切换到 Electron、Vue、Qt、MathJax 或其他主路线。

## 5. UI

UI 原型在 /docs/ui 目录下，其中：

- open-file.html 是打开文件窗口的 UI 原型
- reader.html 是阅读窗口的 UI 原型
- settings.html 是设置窗口的 UI 原型

/docs/ui/ui_colors.html 是 UI 配色板，实现了明亮和暗色这两套主题对应的所有配色，后面在写 UI 时，配色必须遵守该文件中的颜色。

## 6. 功能优先级

默认开发顺序：

1. 基础应用壳。
2. 核心 Markdown 阅读。
3. 富内容渲染。
4. 外观、主题与设置。
5. 系统集成与打包。
6. 性能、兼容与安全。
7. CriticMarkup 批注。

批注功能放在最后，不要过早引入源文件写回、选区改写、保存冲突等复杂度。

## 7. 实现原则

- 优先保持阅读器定位，不做半吊子的 Markdown 编辑器。
- UI 保持极简，不引入大型组件库，除非有明确收益。
- UI 全面参考 `davidhoo/MarkdownReader` 和 `easychen/markmark` 的阅读器布局取向。
- UI 设计与适配以 1920x1080 作为基础分辨率，再向更小窗口、高 DPI 和 Retina 扩展验证。
- 设置入口只使用齿轮按钮触发全局单例系统原生设置窗口：打开文件窗口放在中央卡片右下角，阅读窗口放在渲染视图右下角；同一时间只能存在一个设置窗口，重复点击时聚焦已有设置窗口。
- 窗口内主卡片统一使用 `22px` 圆角；圆形设置按钮统一为 `32px × 32px`，半径 `16px`，放在卡片右下角并保持 `6px` 视觉 inset，满足 `16px + 6px = 22px`。
- 渲染视图正文居中显示；右下角浮动按钮应位于正文最大宽度之外的留白区域，不能遮挡正文、代码块、公式或表格。
- 不通过左上角应用菜单、系统菜单或快捷键弹出设置窗口，避免破坏极简 UI；设置变更保存成功后必须广播给所有已打开窗口，包括打开文件窗口、所有阅读窗口和设置窗口自身。
- Markdown 渲染必须安全处理 HTML，不执行脚本。
- 应用自身运行资源必须全部随包分发，不允许依赖 CDN、远程字体、远程主题、远程脚本或远程样式。
- KaTeX、Shiki 等资源应本地打包，不依赖 CDN。
- 代码块必须支持可配置渲染主题；默认使用 VS Code Eva Theme，明亮主题对应 `Eva Light Bold`，暗色主题对应 `Eva Dark Bold`。这两个 VS Code TextMate theme JSON 应本地打包，并保留对应 license / attribution。
- 明亮和暗色主题颜色应维护为本地 JSON design tokens，再由前端注入为 CSS variables；组件不应直接散落硬编码颜色。
- 过渡页面必须跟随应用有效主题：明亮主题下使用明亮过渡页，暗色主题下使用暗色过渡页；该规则适用于打开文件窗口、阅读窗口、设置窗口等所有窗口。
- 默认正文和代码字体使用随包分发的 `Maple Mono NF CN`，不要依赖目标机器已经安装该字体。
- 用户设置由 Tauri / Rust 层本地持久化到应用数据目录，使用带 `schemaVersion` 的 JSON 文件；不要把设置主存储放在浏览器 `localStorage`。
- 阅读位置按 Markdown 文件持久化；同一文件窗口已存在时再次打开只聚焦窗口，不重置滚动位置。
- 高 DPI、暗色模式、宽表格、长代码块、长公式都要作为基础阅读体验处理。
- 批注阶段只能做受控的 CriticMarkup 写回，不开放任意正文编辑。

## 8. 验证要求

能验证就实际验证：

- 能运行就运行。
- 能构建就构建。
- 能打开示例文件就打开。
- 能用截图或浏览器检查 UI 就检查。
- 跨平台相关结论不能只靠猜测，至少要说明当前验证平台和未验证平台。

### 8.1 固定验证工具链

后续涉及前端、设置窗口、阅读窗口 UI、滚动条、字体选择、主题切换等可视行为的修改，默认必须走仓库内固定验证入口：

```powershell
pnpm qa:settings-ui
pnpm qa:reader-ui
pnpm qa:markdown-performance
pnpm qa:pdf-export
pnpm qa:screenshots
```

这些命令是当前稳定的仓库内 QA 链路：通过本地 Vite 页面或本地 HTML 原型挂载目标界面，使用本机 Chromium / CDP / Playwright 直接验证 DOM、交互、截图和性能，不依赖 Codex 内置 Browser 插件，不临时切换到 ad hoc 浏览器方案。

除非用户明确要求排查验证工具本身，后续代码修改时不要重新花时间在 Codex Browser / Browser Use / 临时 Playwright / 临时 CDP / 临时本地服务之间反复试错。若 `pnpm qa:settings-ui` 失败，先把失败当作项目验证链路问题定位；只有确认是该命令覆盖不了的新场景时，才补充新的仓库内 QA 入口，并把入口写入 `package.json` 和本文档。

默认验证分层：

- 纯 Rust / 后端持久化修改：跑对应 `cargo test --manifest-path src-tauri\Cargo.toml`，必要时补 `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings`。
- 纯前端逻辑 / Markdown 管线修改：跑 `pnpm test`，必要时补 `pnpm lint`、`pnpm format:check`、`pnpm build`。
- 设置窗口和相关 UI 交互修改：跑 `pnpm qa:settings-ui`，再按影响范围补 `pnpm test` / `pnpm lint` / `pnpm build`。
- 阅读窗口、图片失败状态、滚动、大纲或小窗口 / 高 DPI 可视行为修改：跑 `pnpm qa:reader-ui`，再按影响范围补 `pnpm test` / `pnpm lint` / `pnpm build`。
- Markdown 渲染性能和前端加载体积相关修改：跑 `pnpm qa:markdown-performance` 和 `pnpm build`。
- PDF 导出、打印媒体 CSS、分页或导出按钮修改：跑 `pnpm qa:pdf-export`、`pnpm qa:reader-ui` 和 `pnpm build`。
- UI 原型截图或视觉验收资料更新：跑 `pnpm qa:screenshots`，确认截图输出到 `output/playwright/`。
- 打包或 Tauri 原生窗口行为修改：跑相关 Rust/前端测试后，再按需要跑 `pnpm tauri build`。
- 后续每次修改代码后，默认构建新的测试 exe，且默认不产出安装包；使用 `pnpm tauri build --no-bundle --ci`，除非用户明确要求 MSI/NSIS 安装包。

汇报时必须区分：

- 已完成。
- 已验证。
- 未验证。
- 已知限制。

## 9. 文件与改动规则

- 不要改动无关文件。
- 不要删除用户文件，除非用户明确要求。
- 需要删除时优先使用可恢复方式。
- 不要将任何本地内容上传到外部服务，除非用户明确允许。
- 不要在未确认的情况下进行发布、推送、发帖、发邮件等外部动作。

## 10. 文档维护

当技术路线、功能分期或重要产品决策发生变化时，应同步更新：

- `docs/technical-architecture.md`
- `docs/feature-roadmap.md`
- 必要时更新本文件。

这三个文件是后续协作的主要上下文入口。
