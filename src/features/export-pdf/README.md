# PDF 导出

PDF 导出 V1 只允许用户点击阅读窗口右下角、设置按钮上方的“导出为PDF文档”按钮。模块先等待字体、Markdown 图片和两个布局帧稳定，再调用浏览器 `window.print()` 打开系统打印界面。

- 不支持 `Ctrl+P` / `Cmd+P` 触发导出；组件会拦截该快捷键。
- 资源等待上限为 10 秒；尚未加载完成的图片会中止当前导出并显示错误。
- 已进入 Markdown 图片失败占位状态的图片不会阻断导出。
- V1 不直接选择保存路径、静默生成文件或调用 Rust PDF API。

验证：

`pnpm qa:pdf-export` 使用本地 Vite QA 页面和本机 Chromium 的 headless print-to-PDF 生成多页 A4 PDF，并检查产物非空且至少两页。
