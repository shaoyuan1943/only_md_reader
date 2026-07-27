# Markdown 阅读器技术方案

## 1. 产品定位

本项目是一个面向 Windows 和 macOS 的 Markdown 阅读器。

核心定位：

- 纯阅读优先，不做完整 Markdown 编辑器。
- 一个窗口阅读一个 Markdown 文件，支持多开窗口。
- 极简 UI：左侧大纲，右侧渲染视图。
- 支持明亮模式、暗色模式、跟随系统。
- 支持高分辨率显示，包括 Windows 缩放和 macOS Retina。
- 支持用户自定义正文字体、代码字体、字号、行高。
- 支持注册为 `.md` / `.markdown` 文件打开程序。
- 批注功能放在最后阶段实现，采用 CriticMarkup 直接写回源文件。

## 2. 技术栈

最终技术路线：

```text
桌面框架：Tauri 2
前端框架：React
语言：TypeScript + Rust
构建：Vite
Markdown 管线：unified / remark / rehype
数学公式：KaTeX
代码高亮：Shiki
默认代码块主题：VS Code Eva Theme，亮色使用 Eva Light Bold，暗色使用 Eva Dark Bold
主题配置：本地 JSON design tokens -> CSS variables
默认字体：Maple Mono NF CN（随应用打包）
资源策略：运行时资源全部包内加载，禁止 CDN 和远程资源依赖
批注格式：CriticMarkup
```

选择 Tauri 2 的原因：

- 体积和资源占用比 Electron 更适合纯阅读器。
- 支持 Windows 和 macOS。
- 可以使用系统 WebView 承载 React 阅读界面。
- 支持多窗口、文件打开、打包、文件关联等桌面能力。

选择 React 的原因：

- `react-markdown`、`rehype-react`、remark/rehype 插件生态更直接。
- Markdown 节点可以映射为自定义 React 组件，便于标题、大纲、代码块、图片、公式、后续批注的交互扩展。
- 项目 UI 本身不复杂，真正复杂的是文档 AST 和富内容渲染，React 生态更适合这个重心。

## 3. 总体架构

应用分为两层。

### 3.1 Tauri / Rust 层

职责：

- 接收命令行参数和系统文件打开事件。
- 管理窗口生命周期。
- 实现一个 Markdown 文件对应一个窗口。
- 处理重复打开同一文件时聚焦已有窗口。
- 读取本地 Markdown 文件。
- 后续支持 CriticMarkup 批注写回源文件。
- 读写用户设置。
- 监听系统主题变化。
- 打包时注册 `.md` / `.markdown` 文件关联。

### 3.2 React 前端层

职责：

- 渲染阅读界面。
- 解析 Markdown。
- 生成大纲。
- 同步大纲点击和正文滚动。
- 渲染 GFM、数学公式、代码块、图片、表格。
- 管理明暗主题、字体、字号、行高、正文宽度。
- 后续处理 CriticMarkup 的展示和批注交互。

## 4. 窗口模型

窗口模型采用单文件单窗口：

```text
一个 Markdown 文件 = 一个 Tauri 窗口
打开不同文件 = 创建新窗口
重复打开同一文件 = 聚焦已有窗口
```

不采用标签页模式，也不内置文件管理器。这样可以保持阅读器简单，并与操作系统窗口管理习惯一致。

## 4.1 UI 布局

UI 布局全面参考以下项目的阅读器取向：

- `davidhoo/MarkdownReader`
- `easychen/markmark`

UI 设计和适配以 `1920x1080` 作为基础分辨率。基础布局先在 1920x1080 下确认，再验证更小窗口、Windows 缩放比例和 macOS Retina。

基础布局：

```text
左侧：大纲区域
右侧：Markdown 渲染视图
```

已确认的阅读窗口 UI 排布采用左右卡片式结构：左侧大纲和右侧阅读区都是浮起卡片，使用 `docs/ui/ui_colors.html` 对应的整体背景色和卡片背景色，并通过阴影建立层级关系，避免使用硬分割线。后续阅读窗口 UI 设计和实现默认沿用 `docs/ui/reader.html` 当前方案，并同时覆盖明亮主题和暗色主题。

阅读窗口支持沉浸式阅读：用户可以按 `F11` 或点击大纲外侧的 16px 箭头按钮隐藏 / 显示左侧大纲卡片。大纲显示时，左箭头放在大纲卡片右侧的卡片外侧空隙中；大纲隐藏时，阅读卡片向左扩展吃掉原大纲空间，右箭头放在阅读布局左侧空隙中。该交互只通过 CSS grid 列宽和间距做短时过渡，避免重建阅读正文或引入高成本动画。

正文在渲染视图中居中显示，并受最大宽度约束。窗口变宽时，正文不无限拉伸，左右留白自然增加。

阅读窗口支持两类复制：普通选区复制和代码块整块复制。用户在正文或大纲中选中文本后，鼠标右下方显示一个 16px 圆形复制泡泡，点击后复制选中文字；标准 `Ctrl+C` 保留浏览器 / WebView 的原生选区复制行为。代码块右上角固定提供 16px 复制按钮，点击复制整个代码块；如果用户只选中代码块中的部分文本，则按普通选区复制处理。

设置入口只使用齿轮按钮触发全局单例系统原生设置窗口。设置窗口使用固定 Tauri window label `settings`；如果设置窗口已经存在，重复点击任意齿轮只恢复并聚焦已有窗口，不再创建第二个设置窗口：

```text
┌──────────────┬───────────────────────────────┐
│ 大纲          │        居中 Markdown 正文       │
│              │                               │
│ H1           │                               │
│   H2         │                               │
│   H2         │                         ⚙     │
└──────────────┴───────────────────────────────┘
```

设置齿轮规则：

- 打开文件窗口的设置齿轮固定在中央卡片右下角。
- 阅读窗口的设置齿轮固定在渲染视图 / 阅读卡片右下角。
- 打开文件窗口、阅读窗口和设置窗口内主卡片统一使用 `22px` 圆角。
- 圆形设置按钮统一为 `32px × 32px`，半径 `16px`，放在卡片右下角并保持 `6px` 视觉 inset，满足 `16px + 6px = 22px`。
- 对带 `1px` 边框的卡片，CSS 绝对定位数值可以扣除边框宽度，但浏览器实测的可见 inset 必须仍为 `6px`。
- 不放在左侧大纲底部，避免长大纲遮挡或挤压。
- 优先落在正文最大宽度之外的右侧留白区域。
- 不遮挡正文、代码块、数学公式或表格。
- 使用图标按钮和 tooltip，不使用大段文字。
- 不通过左上角应用菜单、系统菜单或快捷键弹出设置窗口。
- 设置窗口由 Tauri / Rust 层统一创建和聚焦，前端窗口只调用 `open_settings_window` 命令。
- 设置窗口是独立原生窗口，不嵌入打开文件窗口或阅读窗口的 React 树，避免多个阅读窗口同时打开多份设置 UI。

## 5. Markdown 渲染管线

基础渲染管线：

```text
Markdown source
 -> remark-parse
 -> remark-gfm
 -> remark-math
 -> 自定义 heading / outline / source position 插件
 -> remark-rehype
 -> rehype-katex
 -> rehype-sanitize
 -> React render
```

需要支持：

- CommonMark 基础语法。
- GFM 表格。
- GFM 任务列表。
- 删除线。
- 自动链接。
- 行内公式 `$...$`。
- 块级公式 `$$...$$`。
- 代码块高亮。
- 相对路径图片。
- 标题锚点。
- 大纲提取。

### 5.1 大纲生成

大纲从 Markdown AST 中的 heading 节点生成，而不是从最终 DOM 中反推。

每个 heading 需要生成稳定 id：

```text
heading text -> slug -> 若重复则追加序号
```

正文渲染时，标题节点携带相同 id。左侧大纲点击时滚动到对应标题。

滚动同步通过 IntersectionObserver 或等价机制实现，当前视口附近标题在大纲中高亮。

### 5.2 HTML 安全

Markdown 中的 HTML 必须经过 sanitize。

默认策略：

- 不执行脚本。
- 不允许事件属性，例如 `onclick`。
- 不允许危险 URL scheme。
- 明确允许 KaTeX 需要的 class、span、math 结构。
- 明确允许代码高亮需要的 class。

## 5.3 资源加载策略

应用运行时所需资源必须全部随应用包分发，默认不允许依赖外部网络。

禁止项：

- CDN 脚本。
- CDN 样式。
- 远程字体。
- 远程代码高亮主题。
- 远程 KaTeX / Shiki 资源。
- 运行时从第三方 URL 拉取主题、字体、图标、样式或脚本。

必须包内提供的资源：

- Maple Mono NF CN 字体文件。
- KaTeX CSS 和字体。
- Shiki 运行所需语言和主题资源。
- `Eva Light Bold` / `Eva Dark Bold` TextMate theme JSON。
- Warm Paper 主题 JSON design tokens。
- 应用 UI 所需图标和样式。

例外：Markdown 文档自身引用的远程图片或链接属于文档内容，不属于应用运行依赖。第一版可以显示为普通外链或按安全策略处理，但应用自身不能因为外部网络不可用而缺字体、缺样式、缺代码主题或缺公式资源。

## 6. 数学公式方案

数学公式使用 KaTeX。

支持：

- 行内公式：`$...$`
- 块级公式：`$$...$$`

取舍：

```text
优点：速度快、体积轻、适合 Markdown 阅读器、和 MarkMark 路线一致。
缺点：不覆盖全部复杂 LaTeX / MathJax 级公式。
```

实现要求：

- KaTeX CSS 和字体必须本地打包，不依赖 CDN。
- 公式渲染失败时，保留原公式文本并显示错误状态。
- 单个公式失败不能导致整篇文档崩溃。
- 宽公式应支持横向滚动。

## 7. 代码高亮方案

代码块高亮使用 Shiki。

默认主题：

```text
默认代码块主题：VS Code Eva Theme
亮色代码主题：Eva Light Bold
暗色代码主题：Eva Dark Bold
```

设置项：

- 亮色代码主题。
- 暗色代码主题。
- 是否跟随系统主题切换。

实现要求：

- 代码块主题必须可配置。
- 默认主题采用 VS Code Eva Theme：明亮主题对应 `Eva Light Bold`，暗色主题对应 `Eva Dark Bold`。
- `Eva Light Bold` 和 `Eva Dark Bold` 应作为本地 VS Code TextMate theme JSON 随应用打包，例如放在 `src/assets/shiki-themes/`。
- 前端初始化 Shiki 时从本地资源加载这两个 JSON 主题，再按当前明暗模式选择对应主题。
- 如果主题来源于第三方仓库或 npm 包，必须同时保留对应 license / attribution 文件。
- 主题资源必须随应用本地打包，不依赖 CDN 或运行时网络请求。

代码块要求：

- 支持常见语言识别。
- 未识别语言按纯文本渲染。
- 长代码行支持横向滚动。
- 代码字体独立于正文字体。

## 8. 字体与排版

不区分中文、英文、数字字体。用户只配置正文字体和代码字体。

默认字体采用 `Maple Mono NF CN`。这是第三方字体，不能假设目标机器已经安装，必须作为应用资源随包分发。正式实现时应把字体文件放入前端静态资源目录，并通过 `@font-face` 注册；字体资源随 Tauri 应用本地打包，不依赖 CDN 或运行时网络请求。

默认正文字体栈：

```css
font-family:
  "Maple Mono NF CN",
  system-ui,
  -apple-system,
  "Segoe UI",
  "PingFang SC",
  "Microsoft YaHei UI",
  "Microsoft YaHei",
  "Noto Sans CJK SC",
  sans-serif;
```

默认代码字体栈：

```css
font-family:
  "Maple Mono NF CN",
  ui-monospace,
  "SF Mono",
  "Cascadia Code",
  "Consolas",
  monospace;
```

设置项：

- 正文字体。
- 代码字体。
- 设置窗口字体候选由 Rust / Tauri 层从本机字体族枚举得到，`Maple Mono NF CN` 始终作为随包默认字体排在首位；枚举失败或非桌面 QA 预览时使用内置常见字体 fallback，不依赖远程字体服务。
- 正文字号。
- 代码字号。
- 行高。
- 正文最大宽度。

排版要求：

- 默认状态下，即使系统未安装 `Maple Mono NF CN`，应用也应使用随包字体渲染正文和代码。
- 如果随包字体加载失败，才回退到系统字体栈。
- 所有应用窗口、Markdown 内容、代码、公式、控件、伪元素和 PDF 输出统一使用 `font-variant-ligatures: none` 关闭可选字体连字；例如源码中的 `->` 必须按两个普通字符显示，不合并为箭头字形。该规则不随正文或代码字体选择而变化。
- 高 DPI 下文字清晰。
- 正文区域保持合适行宽。
- 表格、代码块、长公式允许横向滚动，不撑破整体布局。

## 9. 主题方案

支持三种主题模式：

```text
明亮
暗色
跟随系统
```

主题颜色使用本地 JSON design tokens 维护。JSON 是主题数据源，明亮主题和暗色主题分别把颜色、阴影、控件状态等 token 配置到明确字段中；前端加载并校验 JSON 后，把当前主题注入为 CSS variables。React 组件只使用 `var(--token-name)`，不直接读取十六进制颜色，也不在组件里散落硬编码颜色。

过渡页面必须使用同一套有效主题规则：明亮有效主题下显示明亮过渡页，暗色有效主题下显示暗色过渡页；`themeMode = "system"` 时先解析系统明暗后再决定过渡页颜色。该规则适用于打开文件窗口、阅读窗口、设置窗口等所有窗口，窗口创建时的原生背景色和 HTML boot screen 必须保持一致，避免启动或打开新窗口时出现反主题闪屏。

建议主题资源结构：

```text
src/shared/theme/themes/warm-paper.json
src/shared/theme/theme-schema.ts
src/shared/theme/apply-theme.ts
```

建议 JSON 结构：

```ts
type ThemeTokenBundle = {
  id: "warm-paper";
  name: string;
  modes: {
    light: ThemeTokens;
    dark: ThemeTokens;
  };
};

type ThemeTokens = {
  appBg: string;
  surfaceBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  borderSoft: string;
  codeBg: string;
  tableBorder: string;
  panelShadow: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  controlBg: string;
  controlText: string;
  focusRing: string;
};
```

CSS 变量覆盖：

- 背景色。
- 正文颜色。
- 次级文本颜色。
- 边框颜色。
- 大纲当前项颜色。
- 链接颜色。
- 表格颜色。
- 代码块背景。
- 控件背景、文字、悬停、选中、禁用、焦点状态。
- 面板阴影和浮层阴影。
- 批注颜色，后续阶段使用。

### 9.1 PDF 导出 V1：原生无界面直出

PDF 导出 V1 的目标是让用户从阅读窗口通过显式按钮直接生成 PDF；过程中不得出现浏览器打印预览、系统打印窗口或保存路径选择窗口。

固定实现路线：

```text
当前 Markdown 渲染 HTML
  -> 导出前等待渲染、字体和图片稳定
  -> @media print / @page 专用打印 CSS
  -> Windows：当前 WebView2 的 PrintToPdf COM 回调
  -> 同目录临时 PDF，再原子移动为不覆盖的目标文件
  -> 应用内成功 / 失败通知
```

实现边界：

- 复用当前阅读窗口中 `.markdown-rendered-document` 的真实 DOM，不新增 Markdown 到 PDF 的第二条转换管线，不创建隐藏导出窗口。
- V1 仅由阅读窗口右下角的圆形“导出 PDF”按钮触发；不提供快捷键，也应阻止 `Ctrl+P` / `Cmd+P` 绕过导出前的资源稳定性检查。
- 导出按钮位于现有齿轮设置按钮正上方，两个按钮均为 `32px × 32px` 圆形控件；悬停提示固定为“导出为PDF文档”。
- PDF 始终使用独立的黑白打印主题：白纸、黑字、灰黑边框；不忠实导出当前阅读主题、代码语法高亮、表头填充、链接颜色、引用底色或卡片渐变。固定 A4、CSS 页边距和纵向布局。
- PDF 正文始终以 `12pt` 作为排版起点，不跟随阅读器字号。持久化设置“允许自动缩小 PDF 内容”默认关闭：关闭时普通内容换行、图片限宽，表格、代码和公式只在自身范围内适配，禁止单个超宽元素带动整份 PDF 缩小；开启时跳过这些全局宽度保护，允许 WebView2 根据超宽内容决定是否整体缩小，本次导出结束后恢复临时布局状态。
- PDF 仅包含 Markdown 正文，不包含大纲、设置/导出按钮、返回按钮、复制控件、选择浮层、自定义滚动条、卡片阴影、文件路径或文件名。Windows 必须使用 WebView2 `PrintToPdf`，明确禁止 `window.print()`、`ShowPrintUI`、虚拟打印机和浏览器打印预览；print settings 必须关闭浏览器页眉页脚和 CSS 背景打印。
- 导出前必须等待 Markdown 渲染完成、`document.fonts.ready`、正文图片成功或进入既有失败占位状态，以及至少一次最终布局帧；图片持续加载超过约定超时时间时中止本次导出并提示重试，不能悄悄导出缺图文档。
- 图片加载失败不阻断导出，PDF 保留既有失败占位；导出不修改 Markdown、阅读位置、设置或窗口状态。
- 必须为标题、图片、引用、代码块、表格和块级公式定义打印分页与宽度策略；允许极长单块自然跨页，但不得裁切右侧内容。
- 输出文件与 Markdown 源文件位于同一目录，默认同名 `.pdf`；目标已存在时使用 ` (1)`、` (2)` 等递增文件名，绝不覆盖已有 PDF。
- 导出失败以阅读窗口左下角圆角通知展示原因，不提供重试按钮；通知背景必须是应用背景而非卡片背景，使用强阴影。通知从左至右出现、从右至左关闭，最新通知位于最下方；最多三个活跃错误，第四个错误到来时关闭最旧错误。成功通知 3 秒后关闭，错误原因继承当前阅读字体。

V1 明确不做：

- 应用内保存路径选择、覆盖已有 PDF 或自动打开 PDF。
- 自定义页眉、页脚、页码模板、封面、书签、目录页和 PDF 模板系统。
- Pandoc、LaTeX、外置 Chromium、wkhtmltopdf 或 Rust PDF 绘制库。
- macOS 未经验证的伪实现、`window.print()` 回退或系统打印窗口回退。

验证要求：

- 在现有 `pnpm qa:reader-ui` 基础上新增 `pnpm qa:pdf-export`，该命令必须覆盖打印媒体 CSS 和真实多页 PDF 的基本内容检查。
- Windows 必须实机验证无界面导出、重复命名和实际 PDF 输出；macOS 原生无界面导出尚未实现时必须返回明确错误通知，不得回退到打印窗口。

## 10. 设置存储

设置由 Tauri / Rust 层做本地持久化，前端启动时通过 Tauri command 加载。不要依赖浏览器 `localStorage` 作为主存储，因为应用后续需要跨窗口共享设置，并且需要由 Rust 层统一处理窗口状态、文件路径和未来批注写回相关能力。

本地设置文件建议放在 Tauri 应用数据目录：

```text
{appDataDir}/settings.json
{appDataDir}/window-state.json
```

其中 `{appDataDir}` 由 Tauri path API 获取，对应 Windows 和 macOS 的系统推荐应用数据目录。不要把用户设置写入项目目录、安装目录或 Markdown 文件所在目录。

建议设置结构：

```ts
type ReaderSettings = {
  schemaVersion: 1;
  colorThemeId: string;
  themeMode: "light" | "dark" | "system";
  bodyFontFamily: string | null;
  codeFontFamily: string | null;
  bodyFontSize: number;
  codeFontSize: number;
  lineHeight: number;
  contentMaxWidth: number;
  lightCodeTheme: string;
  darkCodeTheme: string;
};
```

其中 `colorThemeId` 第一版默认使用 `"warm-paper"`；`themeMode` 只决定使用明亮、暗色还是跟随系统。`bodyFontFamily` / `codeFontFamily` 为 `null` 时表示使用随包默认字体 `Maple Mono NF CN`。

Rust 层维护同构结构，并通过 Tauri commands 暴露给前端：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReaderSettings {
    schema_version: u32,
    color_theme_id: String,
    theme_mode: ThemeMode,
    body_font_family: Option<String>,
    code_font_family: Option<String>,
    body_font_size: f64,
    code_font_size: f64,
    line_height: f64,
    content_max_width: u32,
    light_code_theme: String,
    dark_code_theme: String,
}
```

建议命令：

```text
get_reader_settings() -> ReaderSettings
update_reader_settings(patch: PartialReaderSettings) -> ReaderSettings
reset_reader_settings() -> ReaderSettings
get_window_state(filePath: string) -> WindowState | null
save_window_state(state: SaveWindowStateRequest) -> WindowState
```

持久化规则：

- 首次启动时，如果 `settings.json` 不存在，Rust 返回内置默认设置，并创建文件。
- `settings.json` 必须带 `schemaVersion`，后续字段变更通过版本迁移处理。
- 读取失败、JSON 损坏或字段不合法时，不让应用白屏；应回退默认设置，并保留损坏文件的备份，例如 `settings.corrupt.json`。
- 写入设置时使用原子写入：先写临时文件，再替换正式文件，避免异常退出造成半截 JSON。
- 设置变更应广播给所有已打开窗口，包括打开文件窗口、所有阅读窗口和设置窗口自身，保证主题、字体、字号、行高、正文宽度即时同步。
- 前端可以做乐观更新，但 Rust 写入失败时必须回滚并显示明确错误。
- 不要把阅读位置混进 `settings.json`；它属于窗口状态，应单独存储。阅读窗口原生尺寸和位置不持久化。

窗口状态可单独存储：

```ts
type WindowStateStore = {
  schemaVersion: 1;
  files: Record<string, WindowState>;
};

type WindowState = {
  filePath: string;
  scrollTop?: number;
  scrollRatio?: number;
  activeHeadingId?: string;
  activeHeadingOffset?: number;
  fileModifiedAt?: string;
  fileSize?: number;
  updatedAt: string;
};
```

窗口状态规则：

- `filePath` 存规范化绝对路径，避免同一文件因为路径写法不同产生多份状态。
- 阅读窗口默认最大化打开；原生还原态内容尺寸和最小内容尺寸均为 `1320x560`。该宽度必须同时高于阅读视图的 `<=980px` 单列断点，并保证右侧阅读卡片在最小尺寸下仍不少于 `880px` 可用宽度。
- 阅读窗口允许通过原生最大化按钮或双击原生标题栏在“最大化”和 `1320x560` 还原态之间切换；也允许用户通过窗口边缘拖拽调整到任意大于该最小内容尺寸的窗口大小，但不能拖小到破坏左右卡片排布的尺寸。历史窗口状态不再恢复原生窗口尺寸或位置，只用于恢复阅读位置。
- 阅读位置按文件保存。用户滚动正文时，前端节流记录 `scrollTop`、`scrollRatio`、当前 `activeHeadingId` 和标题相对偏移；窗口关闭前再强制保存一次。
- 滚动位置保存应节流，避免滚动时高频写磁盘；建议滚动停止 800ms 后保存，窗口关闭时立即保存。
- 最近打开文件列表可以与窗口状态共用同一存储文件，也可以拆成 `recent-files.json`；如果拆分，仍由 Rust 层统一读写。

### 10.1 阅读位置恢复

重复打开同一份文件时分两种情况处理：

```text
文件窗口仍然存在 -> 聚焦已有窗口，不重新加载，不改变当前滚动位置。
文件窗口已关闭或应用重启后再次打开 -> 创建阅读窗口，并恢复该文件上次保存的阅读位置。
```

打开文件流程：

1. Rust 层先把传入路径规范化为绝对路径。
2. 用规范化路径检查窗口注册表。
3. 如果该文件已有窗口，直接 `set_focus()` / `unminimize()`，并保持该窗口当前滚动位置。
4. 如果没有窗口，读取 `window-state.json` 中该文件的 `WindowState`。
5. 创建阅读窗口，把文件内容和对应 `WindowState` 一起传给前端。
6. 前端完成 Markdown AST 解析、标题 id 生成和首屏渲染后，再恢复滚动位置。

打开文件窗口入口规则：

- 普通启动应用时显示打开文件窗口。
- 打开文件窗口支持按钮选择、最近文件点击和拖入 `.md` / `.markdown` 文件。
- 从打开文件窗口成功打开 Markdown 后，创建或聚焦阅读窗口，并关闭打开文件窗口，避免打开页继续重绘或闪烁。
- 通过命令行参数、系统文件打开事件或默认程序方式传入 Markdown 路径时，直接创建阅读窗口，不再先创建打开文件窗口。

恢复优先级：

1. 如果 `activeHeadingId` 仍存在，优先滚动到该标题，并加上 `activeHeadingOffset`。
2. 如果标题不存在，但 `scrollRatio` 合法，按文档总高度比例恢复。
3. 如果比例不可用，使用 `scrollTop` 作为最后兜底。
4. 如果文件大小或修改时间变化很大，仍尝试恢复，但允许回退到文档顶部，避免跳到明显错误的位置。

保存触发：

- 正文滚动停止后节流保存。
- 大纲点击跳转完成后保存。
- 窗口失焦时可保存一次。
- 窗口关闭前必须保存一次。
- 应用退出前尽量保存所有打开窗口的最新状态。

这个设计比只保存 `scrollTop` 更稳，因为 Markdown 文档重新渲染后高度可能受图片、代码高亮、公式、字体加载影响；标题锚点加偏移能更接近用户上次阅读的位置。

## 11. 文件打开与系统集成

支持文件类型：

```text
.md
.markdown
text/markdown
```

系统集成要求：

- Windows 和 macOS 打包。
- 注册文件关联。
- 支持通过双击 Markdown 文件打开。
- 支持从命令行传入文件路径。
- 系统文件打开事件和命令行路径都应复用同一个 reader window 创建路径，直接进入阅读窗口。
- Windows 上不能强行接管默认程序，只注册为可选打开程序，并引导用户到系统设置确认。
- macOS 通过 app bundle document types 参与打开方式选择。

### 11.1 Windows MSI 打包与升级

- Windows 只发布 MSI，不生成或发布 NSIS 安装包。
- MSI 使用稳定 `UpgradeCode` 和 WiX `MajorUpgrade`；`RemoveExistingProducts` 调度在 `afterInstallInitialize`，使旧 MSI 在新文件写入前卸载。
- `OLDER_VERSION_DETECTED` 使用上限不包含当前 `ProductVersion` 的版本范围，只控制“检测到已安装的旧版本”确认页；因此所有严格低于当前包版本的同 `UpgradeCode` MSI 都显示升级提示，同版本重装不显示。
- `WIX_UPGRADE_DETECTED` 由 `MajorUpgrade` 负责发现并移除可升级的旧 MSI；它和只控制界面的 `OLDER_VERSION_DETECTED` 分工不同。
- `WIX_DOWNGRADE_DETECTED` 识别已安装的高版本，并由 `LaunchCondition` 阻止低版本覆盖；高版本场景不进入旧版本升级确认页。
- `INSTALLDIR` 默认是 `C:\Program Files\iMDReader`。
- 从旧版本升级时不继承旧中文目录或旧自定义目录，仍默认使用 `C:\Program Files\iMDReader`。
- `WixUI_InstallDir` 保留本次安装的目录选择能力，用户可以主动选择新的安装目录。

## 12. 批注方案

批注最后阶段实现，采用 MarkMark 类似路线：

```text
CriticMarkup 直接写入 Markdown 源文件
```

不做：

- SQLite 私有批注。
- sidecar JSON 批注。
- 云同步。
- 锚点恢复。
- detached 批注状态。

原因：CriticMarkup 让批注成为源文件内容本身。协作方式就是共享同一个 Markdown 文件。

### 12.1 支持的 CriticMarkup 语法

```md
{==高亮内容==}
{>>评论内容<<}
{++新增内容++}
{--删除内容--}
{~~旧内容~>新内容~~}
```

第一版重点支持：

```md
{==被批注文本==}{>>批注内容<<}
```

### 12.2 批注渲染

CriticMarkup 渲染要求：

- `{==text==}` 渲染为高亮。
- `{>>comment<<}` 渲染为批注气泡或批注面板项。
- `{--text--}` 渲染为删除样式。
- `{++text++}` 渲染为新增样式。
- `{~~old~>new~~}` 渲染为替换建议。

`{==text==}{>>comment<<}` 相邻结构视为同一条批注。

### 12.3 批注写回限制

第一版批注写回限制：

- 支持普通段落。
- 支持标题。
- 支持列表。
- 支持引用。
- 支持表格单元格。
- 不支持跨多个块级节点的选区。
- 不支持代码块内部任意字符级批注。
- 不支持公式内部字符级批注。
- 不做完整正文编辑器，只做批注相关写回。

## 13. 非目标

第一阶段明确不做：

- Markdown 编辑器。
- 标签页。
- 文件管理器。
- 云同步。
- 账号系统。
- 实时协作。
- 自定义 PDF 保存位置、覆盖已有 PDF 和自定义 PDF 模板。
- 所见即所得编辑。
- 插件系统。

这些功能会显著扩大产品边界，不适合第一版。

## 14. 固定验证工具链

后续开发默认使用仓库内脚本作为验证入口，避免每次修改都重新在 Codex 内置 Browser、临时 Playwright、临时 CDP 和临时本地服务之间切换。

当前稳定的设置窗口 UI QA 入口：

```powershell
pnpm qa:settings-ui
pnpm qa:reader-ui
pnpm qa:markdown-performance
pnpm qa:screenshots
```

这些入口由以下文件组成：

- `tools/settings-ui-qa.html`
- `tools/settings-ui-qa.tsx`
- `tools/settings-ui-qa.mjs`
- `package.json` 中的 `qa:settings-ui`
- `tools/reader-ui-qa.html`
- `tools/reader-ui-qa.tsx`
- `tools/reader-ui-qa.mjs`
- `tools/markdown-performance-check.mjs`
- `tools/playwright-screenshots.mjs`
- `package.json` 中的 `qa:reader-ui` / `qa:markdown-performance` / `qa:screenshots`

设计约束：

- 使用本地 Vite 页面挂载 `SettingsWindow` / `ReaderPreviewWindow`，或使用本地 HTML 原型截图脚本，而不是依赖临时浏览器调试流程。
- 使用本机 Chromium + CDP 验证 DOM、滚动条和字体选择交互。
- 不依赖 Codex 内置 Browser 插件的会话状态。
- 不使用 `networkidle`，因为 Vite HMR websocket 会导致 network idle 等待不稳定；使用 DOM ready 和明确 DOM 条件等待。
- QA 结束后必须清理临时 Chromium / Vite 进程，避免污染下一轮验证。
- 若新增 UI 场景需要浏览器级验证，优先补充新的仓库内 `qa:*` 脚本，而不是恢复 ad hoc 浏览器调试流程。

默认验证分层：

- 纯 Rust / 后端持久化修改：`cargo test --manifest-path src-tauri\Cargo.toml`，必要时补 `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings`。
- 纯前端逻辑 / Markdown 管线修改：`pnpm test`，必要时补 `pnpm lint`、`pnpm format:check`、`pnpm build`。
- 设置窗口、滚动条、字体选择、主题切换等可视 UI 修改：`pnpm qa:settings-ui`，再按影响范围补前端测试和构建。
- 阅读窗口、大纲、图片失败状态、滚动和小窗口 / 高 DPI 相关可视修改：`pnpm qa:reader-ui`，再按影响范围补前端测试和构建。
- Markdown 大文件、渲染性能、前端加载体积和 chunk 拆分相关修改：`pnpm qa:markdown-performance` 和 `pnpm build`。
- UI 原型截图验收：`pnpm qa:screenshots`，输出固定在 `output/playwright/`。
- 打包、资源分发、Tauri 原生窗口行为修改：在相关测试通过后再跑 `pnpm tauri build`。
