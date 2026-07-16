# PDF 导出 V1（原生无界面直出）实施计划

**目标：** 以 Windows WebView2 `PrintToPdf` 替换现有浏览器/系统打印方案：点击阅读窗口导出按钮后，不出现任何打印或预览窗口，直接将当前已渲染的 Markdown 写为 A4 PDF。失败和成功统一以阅读窗口左下角的通知栈反馈。

## 已冻结的产品合同

- 仅允许点击右下角、设置按钮正上方的圆形导出按钮触发；不提供快捷键。
- PDF 复用阅读窗口真实 DOM 与已有打印 CSS：A4、浅色高对比、无文件名、无应用自定义页眉页脚，且不输出应用 UI。
- Windows：通过当前 Tauri WebView 的 WebView2 COM `PrintToPdf` 直接写文件，禁止 `window.print()`、`ShowPrintUI`、虚拟打印机和浏览器预览。
- 输出位置：Markdown 同目录；默认同名 `.pdf`。目标已存在时按 `文件名 (1).pdf`、`文件名 (2).pdf` 递增，绝不覆盖已有文件。
- 图片加载超时中止导出；已有图片失败占位允许导出。
- 通知固定于应用左下角，背景使用 `--app-bg` 而不是卡片 `--surface-bg`，使用强阴影和圆角卡片。
- 新通知从左至右进入；关闭从右至左离开；错误通知不提供重试或操作按钮，只展示原因。
- 通知视觉顺序为“最新在最下方，旧通知向上堆叠”。同时最多三个**未关闭的错误**；出现第四条错误时先关闭最旧错误。成功通知在 3 秒后关闭。
- 错误原因字体继承 `--reader-body-font-family`。

## 实施顺序

1. **先写前端红测。** 改写导出编排与 Tauri bridge 单测，确保结果包含输出路径、不再使用 `window.print`，并新增通知队列测试（新错误在末尾、三条限制、淘汰最旧错误）。
2. **实现 Windows 原生 command。** 新 command 接收源 Markdown 路径，Rust 层安全生成不覆盖的输出路径；在 `WebviewWindow::with_webview` 中创建 WebView2 print settings，关闭 header/footer、启用背景、指定 A4，并异步等待 `PrintToPdf` 回调后返回输出路径。失败不遗留空 PDF。
3. **替换阅读窗口状态。** 删除行内 PDF 错误提示，接入 `export_pdf` command 和通知栈。按钮忙碌状态维持到原生回调完成；成功加入 3 秒通知，失败加入持久错误通知。
4. **实现通知 UI。** 使用纯 reducer 管理排列/数量；由组件管理进入、离开和延时移除，保证新通知位于 DOM/视觉的底部。新增左下角样式、圆角、阴影、进入/离开关键帧与减少动态效果兼容。
5. **清理旧方案与文档。** 删除 `open_pdf_print_dialog`、浏览器 fallback 及所有“系统打印 / 用户另存为 PDF”表述。重写项目三份基线与模块 README；将 macOS 记录为未实现而非降级回 `window.print()`。
6. **验证。** 跑前端/Rust 单测、固定 QA、release 无安装包构建；在 Windows 实机导出 fixture，检查 PDF 文件、页数、可提取正文以及不含浏览器页眉页脚。macOS 不在当前 Windows 环境伪造验证。

## macOS 边界

当前工作树实现并验证 Windows 路径。macOS 不能回退到 `window.print()` 或系统对话框；在原生静默实现（应基于 WKWebView/AppKit PDF 输出）完成并用 macOS 实机验证前，命令会返回明确的“不支持”错误，由同一通知栈展示。这是有意限制，避免把用户已否决的交互重新带回产品。

## 完成判据

- Windows 点击导出按钮不弹出浏览器预览或系统打印窗口，并生成非空 PDF。
- 输出使用不覆盖命名；重复导出可得到递增文件。
- 通知顺序、圆角、位置、背景、动画、成功自动关闭和错误三条上限均有自动化覆盖。
- 旧打印 command 和 `window.print()` 导出 fallback 均不存在。
