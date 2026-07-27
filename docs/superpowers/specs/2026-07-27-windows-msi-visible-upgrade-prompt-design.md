# Windows MSI 可见升级提示设计

## 1. 背景

当前 `0.1.8` MSI 已使用稳定的 `UpgradeCode` 和 WiX `MajorUpgrade`：

- 同一 MSI 事务内先执行 `RemoveExistingProducts`，再写入新版本文件。
- 默认安装目录为 `C:\Program Files\iMDReader`。
- 不继承旧版本的安装目录。
- 高版本覆盖低版本时继续阻止降级。

现有问题不在升级检测或执行顺序，而在安装向导的可见反馈。`WixUI_InstallDir` 对全新安装和旧版本升级显示同一个“准备好安装”页面，用户看不到“将先卸载旧版本”的提示。

## 2. 目标

检测到当前 MSI 的旧版本时，安装向导必须明确告知用户：

1. 已检测到旧版本。
2. 继续后会先卸载旧版本，再安装当前版本。
3. 应用设置、最近文件和阅读位置不会随旧程序文件删除。

提示只改变安装向导的可见反馈，不改变已经确定的 Major Upgrade 事务、安装目录、用户数据目录或降级拦截策略。

## 3. 旧版本判定

旧版本使用版本范围判定，不能枚举某个历史版本号。

对于当前版本 `0.1.8`：

- 必须具有相同的 `UpgradeCode`。
- 已安装版本严格低于 `0.1.8` 时，设置专用公开属性 `OLDER_VERSION_DETECTED`。
- `0.1.0` 至 `0.1.7` 等所有低于 `0.1.8` 的 MSI 版本均属于旧版本。
- 已安装版本等于 `0.1.8` 时，不得设置 `OLDER_VERSION_DETECTED`，不得显示“旧版本升级”提示。
- 已安装版本高于 `0.1.8` 时，不得显示升级提示，并继续由现有 `WIX_DOWNGRADE_DETECTED` 规则阻止降级。
- 不识别不同 `UpgradeCode` 的产品，也不兼容历史 NSIS 安装。

WiX 使用单独的只检测版本范围表达该语义：

```xml
<Upgrade Id="{{upgrade_code}}">
    <UpgradeVersion
        Maximum="{{version}}"
        IncludeMaximum="no"
        OnlyDetect="yes"
        Property="OLDER_VERSION_DETECTED" />
</Upgrade>
```

`IncludeMaximum="no"` 保证上界不包含当前版本；`OnlyDetect="yes"` 保证该行只提供 UI 分支属性，不重复参与旧产品卸载。实际卸载仍由现有 `MajorUpgrade` 生成的 `WIX_UPGRADE_DETECTED` 行负责。

Windows Installer 只比较产品版本的前三段，因此后续发布版本必须继续递增前三段中的至少一段。

## 4. 安装向导行为

### 4.1 全新安装

未设置 `OLDER_VERSION_DETECTED` 时：

- 保持现有 `WixUI_InstallDir` 流程。
- 安装目录页之后进入现有 `VerifyReadyDlg`。
- 主按钮继续显示“安装”。
- 不出现旧版本相关文案。

### 4.2 旧版本升级

设置 `OLDER_VERSION_DETECTED` 时：

- 安装目录页之后进入专用 `UpgradeReadyDlg`，替换通用 `VerifyReadyDlg`。
- 不增加相对于当前流程的额外确认次数。
- 页面标题：`检测到已安装的旧版本`
- 页面正文：`继续后将先卸载旧版本，再安装 MD极简阅读 0.1.8。应用设置、最近文件和阅读位置不会被删除。`
- 主按钮显示：`升级`
- 保留“上一步”和“取消”。
- “上一步”返回安装目录页。
- “取消”继续使用标准取消确认。
- 点击“升级”后结束 UI 阶段并进入现有安装执行序列。

页面中的当前版本由 Tauri/WiX 模板变量生成，不在静态文案中维护第二份版本来源。

## 5. 执行与数据边界

点击“升级”后的顺序保持不变：

```text
FindRelatedProducts
→ OLDER_VERSION_DETECTED 命中严格低于当前版本的相关 MSI
→ 用户在 UpgradeReadyDlg 点击“升级”
→ InstallInitialize
→ RemoveExistingProducts
→ InstallFiles
→ InstallFinalize
```

- 不调用 `msiexec /x` 自定义动作。
- 不启动独立卸载向导。
- 不强制终止正在运行的应用，由 Windows Installer 的 Files In Use / Restart Manager 处理。
- 升级失败继续由同一 MSI 事务回滚。
- `%APPDATA%\com.onlymd.reader` 不属于安装目录，不随旧版本程序文件删除。

## 6. 自动化验证

### 6.1 源码契约测试

先增加失败测试，再修改 WiX。测试至少检查：

- 存在 `OLDER_VERSION_DETECTED`。
- 使用当前 `upgrade_code` 和 `version` 模板变量。
- `Maximum="{{version}}"`。
- `IncludeMaximum="no"`。
- `OnlyDetect="yes"`。
- 升级提示分支只由 `OLDER_VERSION_DETECTED` 控制。
- 全新安装仍进入 `VerifyReadyDlg`。
- 升级安装进入 `UpgradeReadyDlg`。
- 升级页包含标题、正文、“升级”“上一步”“取消”。
- 不新增外部卸载命令。

### 6.2 最终 MSI 数据库 QA

`pnpm qa:windows-msi` 必须读取最终 MSI 数据库并检查：

- `Upgrade` 表存在 `OLDER_VERSION_DETECTED` 行。
- 该行的 `VersionMax` 等于当前 `ProductVersion`。
- 不包含 `VersionMaxInclusive`。
- 包含 `OnlyDetect`。
- `Dialog`、`Control` 和 `ControlEvent` 表存在 `UpgradeReadyDlg` 及其控件和导航。
- 从安装目录页到升级页的条件为 `OLDER_VERSION_DETECTED`。
- 升级页导航顺序必须高于标准 `VerifyReadyDlg` 导航：没有 `OLDER_VERSION_DETECTED` 时只进入标准页面，属性存在时由后执行的升级导航替换标准页面。
- 点击“升级”进入标准安装执行序列。
- 原有 UpgradeCode、ProductCode、RemoveExistingProducts、降级拦截、`iMDReader` 和无 NSIS 检查继续通过。

### 6.3 可见界面验收

在存在旧 MSI 的安全测试环境中：

1. 打开 `0.1.8` MSI。
2. 进入安装目录页。
3. 点击“下一步”。
4. 确认显示 `UpgradeReadyDlg`、升级提示文案和“升级”按钮。
5. 点击“取消”，不点击“升级”。
6. 确认原安装版本、ProductCode、安装目录和用户数据没有变化。

在无旧版本环境中确认仍显示普通安装确认页。若当前宿主存在用户安装，只允许执行上述“进入提示页后取消”的非安装验收；真实升级仍需在安全测试环境完成。

## 7. 永久回归规则

Windows MSI 相关修改除现有验证外，永久增加以下要求：

- 不能只检查 `WIX_UPGRADE_DETECTED` 或 UpgradeCode。
- 必须验证“严格低于当前版本”的版本范围语义。
- 必须验证最终 MSI 中升级提示的实际控件、文案和条件导航。
- 必须区分全新安装、旧版本升级、同版本重装和高版本降级四条路径。
- 任何路径未执行或无法执行，都必须明确列入“未验证”。

## 8. 非目标

- 不显示具体旧版本号。
- 不兼容历史 NSIS 安装。
- 不增加独立卸载程序或外部引导程序。
- 不改变产品名、应用标识、UpgradeCode、用户数据位置或当前版本号。

## 9. 参考

- [WiX 3 UpgradeVersion Element](https://docs.firegiant.com/wix3/xsd/wix/upgradeversion/)
- [WiX 3 Checking for Oldies](https://docs.firegiant.com/wix3/tutorial/upgrades-and-modularization/checking-for-oldies/)
- [WiX 3 MajorUpgrade Element](https://docs.firegiant.com/wix3/xsd/wix/majorupgrade/)
