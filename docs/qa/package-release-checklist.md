# 打包验收清单

用于发布前收口，不替代当前开发阶段的自动化测试。

## Windows MSI 安装

- 运行 `pnpm tauri build --bundles msi`，确认只生成 MSI，不生成当前版本 NSIS。
- 运行 `pnpm qa:windows-msi`，确认版本、UpgradeCode、`iMDReader` 目录和升级动作顺序。
- 无旧版本时，确认默认安装到 `C:\Program Files\iMDReader`，并确认安装向导允许本次修改路径。
- 安装已知旧 MSI 后再运行新 MSI，确认旧 ProductCode 已移除、新 ProductCode 已安装。
- 确认升级不继承旧中文目录或旧自定义目录。
- 卸载后确认安装文件被清理，但用户数据目录不被误删。

## macOS 安装

- 在 macOS 机器上生成并打开 `.app` / `.dmg`。
- 确认应用可启动，窗口尺寸和主题过渡正常。
- 记录签名、公证和 Gatekeeper 状态；没有 macOS 环境时必须标注未验证。

## 文件关联

- Windows：确认系统“打开方式”中可选择本应用打开 `.md` 和 `.markdown`。
- macOS：确认 Finder 里 Markdown 文件可通过本应用打开。
- 双击文件后确认内容进入独立阅读窗口。

## 离线资源

- 断网后启动应用并打开包含字体、公式、代码块、表格和图片的 Markdown。
- 确认 Maple Mono NF CN、KaTeX CSS/字体、Shiki 主题和 Warm Paper token 全部来自包内资源。
- 检查构建产物中没有应用运行依赖的 CDN、远程字体、远程主题或远程脚本。

## 高 DPI

- Windows 125%、150%、200% 缩放下检查打开文件窗口、阅读窗口、设置窗口。
- macOS Retina 下检查文本清晰度、卡片边缘、滚动条、浮动设置按钮。
- 小窗口下确认没有明显模糊、遮挡、错位或正文被齿轮按钮覆盖。

## 发布记录

```text
版本：
构建时间：
Windows 安装：
macOS 安装：
文件关联：
离线资源：
高 DPI：
阻塞问题：
```
