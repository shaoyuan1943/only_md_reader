# Windows MSI 升级与英文安装目录设计

## 1. 目标

调整 Windows MSI 安装行为：

1. 检测到同一产品的旧 MSI 版本时，在写入新版本文件前卸载旧版本，再安装新版本。
2. 未检测到旧 MSI 版本时，直接安装新版本。
3. 默认安装目录改为 `C:\Program Files\iMDReader`。
4. 升级时不继承旧版本的中文目录或自定义目录。
5. 安装向导继续允许用户为本次安装主动选择其他目录。
6. 应用显示名、窗口标题、快捷方式名称和文件关联名称继续使用“MD极简阅读”。
7. 新版本号统一调整为 `0.1.8`。

## 2. 范围

本次只处理项目当前发布的 Windows MSI 安装包：

- 支持从使用相同 `UpgradeCode` 的旧 MSI 版本升级。
- 不生成 NSIS 安装包。
- 不检测或卸载历史 NSIS 安装。
- 不修改 macOS 安装行为。
- 不修改应用数据格式、用户设置或阅读位置存储。

## 3. 方案选择

### 3.1 采用方案：WiX 原生 Major Upgrade

继续使用当前 WiX 模板中的原生升级机制：

```xml
<MajorUpgrade Schedule="afterInstallInitialize" ... />
```

保持当前稳定的 `UpgradeCode`。新 MSI 通过 Windows Installer 的 Upgrade 表识别旧 ProductCode，并在 `InstallInitialize` 之后、`InstallFiles` 之前执行 `RemoveExistingProducts`。

该方案使旧版本卸载和新版本安装处于同一 MSI 安装流程中，不增加外部卸载命令或嵌套安装。

### 3.2 不采用的方案

不将 `productName` 改为 `iMDReader`。该做法虽然会改变默认目录名，但也会改变用户可见的应用名称、快捷方式和文件关联描述，超出需求范围。

不增加调用 `msiexec /x` 的自定义动作。该做法与 Major Upgrade 重复，并会增加嵌套安装、UAC、重启和回滚风险。

## 4. 安装目录策略

WiX 的 `INSTALLDIR` 默认目录名固定为 `iMDReader`，不再从 `productName` 派生：

```xml
<Directory Id="INSTALLDIR" Name="iMDReader" />
```

移除当前 `INSTALLDIR` 下用于读取旧安装路径的注册表搜索。这样无论旧 MSI 安装在中文默认目录还是用户自定义目录，新安装器都不会自动继承旧路径。

保留：

```xml
<Property Id="WIXUI_INSTALLDIR" Value="INSTALLDIR" />
```

以及：

```xml
ConfigurableDirectory="INSTALLDIR"
```

因此安装向导默认显示 `C:\Program Files\iMDReader`，但用户仍可在本次安装时主动选择其他目录。

最终流程：

```text
检测到同 UpgradeCode 的旧 MSI
→ 开始 MSI 安装事务
→ 卸载旧 ProductCode
→ 不读取旧安装路径
→ 默认安装到 C:\Program Files\iMDReader
→ 用户本次主动改路径时安装到新选择的路径

未检测到旧 MSI
→ 直接默认安装到 C:\Program Files\iMDReader
```

## 5. 版本同步

以下位置统一从 `0.1.7` 更新为 `0.1.8`：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` 中的应用包版本
- `src-tauri/tauri.conf.json`
- `src/features/settings/SettingsWindow.tsx`
- 对应版本一致性测试

不改变应用标识 `com.onlymd.reader`、WiX `UpgradeCode` 或用户数据目录。

## 6. 失败与兼容行为

- 不增加强制结束应用进程的逻辑，由 Windows Installer 的 Files In Use / Restart Manager 处理占用文件。
- 升级失败由 MSI 安装事务处理回滚。
- 低版本覆盖高版本继续使用现有 Downgrade 拦截规则。
- 旧 MSI 卸载后，其旧安装目录应由旧安装包自身清理。
- `%APPDATA%\com.onlymd.reader` 中的设置、最近文件和阅读位置不属于安装目录，不随升级卸载删除。
- 历史 NSIS 安装不在本次兼容范围内。

## 7. 自动化回归

先增加会在当前实现上失败的安装器契约测试，再修改 WiX 和版本配置。测试至少覆盖：

1. Windows bundle 目标只有 `msi`。
2. `MajorUpgrade` 的调度位置为 `afterInstallInitialize`。
3. `INSTALLDIR` 默认目录名为 `iMDReader`。
4. WiX 模板不再包含旧安装目录注册表搜索。
5. `WixUI_InstallDir` 和 `ConfigurableDirectory="INSTALLDIR"` 仍存在。
6. `productName` 仍为“MD极简阅读”。
7. 所有项目版本来源与设置窗口显示均为 `0.1.8`。

构建 MSI 后检查安装包数据库：

- `ProductVersion = 0.1.8`
- `INSTALLDIR` 的默认目录为 `iMDReader`
- 新旧 MSI 的 `UpgradeCode` 相同
- `RemoveExistingProducts` 位于 `InstallFiles` 之前
- 未生成 NSIS 产物

## 8. 真实安装验收

真实安装测试必须先检查本机是否已经存在用户安装实例。

若不存在用户安装实例：

1. 安装已知 `0.1.7` MSI。
2. 安装新构建的 `0.1.8` MSI。
3. 确认旧 ProductCode 已移除。
4. 确认旧安装目录已删除。
5. 确认新版本默认安装到 `C:\Program Files\iMDReader`。
6. 卸载测试版本。
7. 在无旧版本状态下全新安装 `0.1.8`。
8. 确认全新安装目录同样为 `C:\Program Files\iMDReader`。
9. 卸载测试版本并确认测试产生的安装状态已清理。

若本机已有用户安装实例，不擅自卸载或覆盖该实例；改为完成 MSI 数据库验证，并把真实升级测试列为“未验证”。

## 9. 完整回归

除安装器专项验证外，执行项目规定的跨功能回归：

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
cargo test --manifest-path src-tauri\Cargo.toml
cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings
pnpm qa:settings-ui
pnpm qa:reader-ui
pnpm qa:markdown-performance
pnpm qa:pdf-export
pnpm qa:screenshots
pnpm tauri build --no-bundle --ci
pnpm tauri build --bundles msi
```

`pnpm qa:reader-ui` 必须继续通过明亮和暗色 Eva 代码主题的浏览器计算样式检查。

## 10. 文档维护

实现完成后同步更新：

- `docs/technical-architecture.md`
- `docs/feature-roadmap.md`
- `docs/implementation-worklist.md`
- `docs/qa/package-release-checklist.md`
- 如增加安装器专用 QA 命令，则更新 `AGENTS.md`

汇报必须区分已完成、已验证、未验证和已知限制，并提供新 MSI 的绝对路径、文件大小、时间戳和 SHA-256。
