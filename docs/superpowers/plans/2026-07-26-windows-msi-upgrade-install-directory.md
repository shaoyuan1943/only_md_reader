# Windows MSI Upgrade and English Install Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布 `0.1.8` Windows MSI，使其先卸载同升级链中的旧 MSI，再默认安装到 `C:\Program Files\iMDReader`，同时保留本次安装的路径选择能力。

**Architecture:** 保留现有 WiX `MajorUpgrade` 和稳定 `UpgradeCode`，删除旧安装路径恢复逻辑，并让 `INSTALLDIR` 使用独立英文目录名。通过源文件契约测试和 Windows Installer 数据库检查共同守护升级顺序、目录、版本与 MSI-only 发布边界。

**Tech Stack:** Tauri 2.11.3、WiX Toolset/MSI、React/TypeScript、Rust/Cargo、Node `node:test`、PowerShell Windows Installer COM API、GitHub Actions。

---

## 文件边界

- `src-tauri/wix/main.wxs`：定义 MSI Major Upgrade、默认安装目录和安装目录 UI。
- `src/app-shell.test.ts`：守护 WiX 源模板、产品显示名和跨语言版本一致性。
- `package.json`：应用版本和 `qa:windows-msi` 仓库入口。
- `src-tauri/Cargo.toml`：Rust 应用包版本。
- `src-tauri/Cargo.lock`：锁定 Rust 应用包版本。
- `src-tauri/tauri.conf.json`：Tauri 产品版本、MSI-only 目标和产品显示名。
- `src/features/settings/SettingsWindow.tsx`：设置窗口用户可见版本。
- `tools/windows-msi-qa.ps1`：检查构建后的 MSI 数据库，不安装或卸载任何程序。
- `src/qa-workflows.test.ts`：守护安装器 QA 入口及发布工作流调用。
- `.github/workflows/release-windows-msi.yml`：发布前构建 MSI 并执行 MSI 数据库检查。
- `docs/technical-architecture.md`：记录 Windows MSI 升级与目录决策。
- `docs/feature-roadmap.md`：记录产品级安装升级验收口径。
- `docs/implementation-worklist.md`：记录实现、证据和未验证项。
- `docs/qa/package-release-checklist.md`：提供发布前真实升级和全新安装检查项。
- `AGENTS.md`：把 `qa:windows-msi` 接入打包修改的固定验证链路。

现有工作区已经包含与代码主题修复有关的未提交修改。所有提交都必须使用明确文件列表，并在提交前执行 `git diff --cached --stat` 与 `git diff --cached`，不得把既有修改混入安装器提交。

### Task 1: 增加 MSI 升级与目录契约红灯测试

**Files:**
- Modify: `src/app-shell.test.ts:683-717`
- Test: `src/app-shell.test.ts`

- [ ] **Step 1: 在现有 Windows MSI 测试后增加失败测试**

加入以下测试：

```ts
void test("Windows MSI removes older MSI versions before installing to the English default directory", () => {
  assert.equal(tauriConfig.productName, "MD极简阅读");
  assert.deepEqual(tauriConfig.bundle?.targets, ["msi"]);
  assert.match(
    wixTemplate,
    /<MajorUpgrade Schedule="afterInstallInitialize"[^>]*(?:DowngradeErrorMessage|AllowDowngrades)/,
  );
  assert.match(
    wixTemplate,
    /<Directory Id="INSTALLDIR" Name="iMDReader"\s*\/>/,
  );
  assert.doesNotMatch(wixTemplate, /PrevInstallDirNoName/);
  assert.doesNotMatch(wixTemplate, /PrevInstallDirWithName/);
  assert.doesNotMatch(
    wixTemplate,
    /<Property Id="INSTALLDIR">[\s\S]*?<RegistrySearch/,
  );
  assert.match(
    wixTemplate,
    /<Property Id="WIXUI_INSTALLDIR" Value="INSTALLDIR"\s*\/>/,
  );
  assert.match(wixTemplate, /ConfigurableDirectory="INSTALLDIR"/);
});
```

- [ ] **Step 2: 运行单个测试文件并确认预期失败**

Run:

```powershell
node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: FAIL，失败点是模板仍使用 `Name="{{product_name}}"`，并且仍包含 `PrevInstallDirNoName` / `PrevInstallDirWithName`。

- [ ] **Step 3: 确认失败原因只对应本需求**

Run:

```powershell
git diff -- src/app-shell.test.ts
```

Expected: 只有新增的 MSI 契约测试；没有产品实现修改。

### Task 2: 最小修改 WiX 安装目录与旧路径恢复行为

**Files:**
- Modify: `src-tauri/wix/main.wxs:78-91`
- Modify: `src-tauri/wix/main.wxs:128-130`
- Test: `src/app-shell.test.ts`

- [ ] **Step 1: 删除旧安装路径注册表搜索**

从 `src-tauri/wix/main.wxs` 删除完整的 `INSTALLDIR` 属性搜索块：

```xml
<Property Id="INSTALLDIR">
  <RegistrySearch Id="PrevInstallDirNoName" ... />
  <RegistrySearch Id="PrevInstallDirWithName" ... />
</Property>
```

不增加替代搜索或自定义卸载动作。

- [ ] **Step 2: 将默认安装目录名固定为英文**

把：

```xml
<Directory Id="INSTALLDIR" Name="{{product_name}}"/>
```

改为：

```xml
<Directory Id="INSTALLDIR" Name="iMDReader"/>
```

保留 `MajorUpgrade Schedule="afterInstallInitialize"`、`WIXUI_INSTALLDIR` 和 `ConfigurableDirectory="INSTALLDIR"` 原样。

- [ ] **Step 3: 运行契约测试并确认转绿**

Run:

```powershell
node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: PASS；现有文件关联、默认应用、窗口和代码主题相关静态测试也继续通过。

- [ ] **Step 4: 提交 WiX 行为和回归测试**

```powershell
git add -- src/app-shell.test.ts src-tauri/wix/main.wxs
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "fix: enforce MSI upgrade install directory"
```

Expected: 提交只包含上述两个文件。

### Task 3: 将所有应用版本同步为 0.1.8

**Files:**
- Modify: `src/app-shell.test.ts:1570-1577`
- Modify: `package.json:4`
- Modify: `src-tauri/Cargo.toml:3`
- Modify: `src-tauri/Cargo.lock:2275-2278`
- Modify: `src-tauri/tauri.conf.json:4`
- Modify: `src/features/settings/SettingsWindow.tsx:287`
- Test: `src/app-shell.test.ts`

- [ ] **Step 1: 扩展版本一致性测试并先制造红灯**

在 `src/app-shell.test.ts` 顶部读取 Cargo lock：

```ts
const tauriCargoLock = readFileSync(
  new URL("../src-tauri/Cargo.lock", import.meta.url),
  "utf8",
);
```

把版本测试改为：

```ts
void test("settings window displays the synchronized package version", () => {
  assert.equal(packageJson.version, "0.1.8");
  assert.equal(tauriConfig.version, packageJson.version);
  assert.match(
    tauriCargoToml,
    /^\[package\]\r?\nname = "only-md-reader"\r?\nversion = "0\.1\.8"/m,
  );
  assert.match(
    tauriCargoLock,
    /\[\[package\]\]\r?\nname = "only-md-reader"\r?\nversion = "0\.1\.8"/,
  );
  assert.match(
    settingsWindowTsx,
    new RegExp(`settings-version">MD极简阅读 · v${packageJson.version}<`),
  );
});
```

- [ ] **Step 2: 运行测试并确认版本红灯**

Run:

```powershell
node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: FAIL，报告 `packageJson.version` 仍为 `0.1.7`。

- [ ] **Step 3: 更新四个版本来源和设置窗口**

执行精准文本修改：

```text
package.json                         0.1.7 → 0.1.8
src-tauri/Cargo.toml                 0.1.7 → 0.1.8
src-tauri/tauri.conf.json            0.1.7 → 0.1.8
src/features/settings/SettingsWindow.tsx
  MD极简阅读 · v0.1.7 → MD极简阅读 · v0.1.8
```

- [ ] **Step 4: 让 Cargo 只更新根应用包锁定版本**

Run:

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

Expected: exit 0；`src-tauri/Cargo.lock` 中 `name = "only-md-reader"` 对应版本变为 `0.1.8`，其他恰好为 `0.1.7` 的第三方依赖版本不变。

- [ ] **Step 5: 运行版本测试并确认转绿**

Run:

```powershell
node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交版本同步**

```powershell
git add -- package.json src/app-shell.test.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src/features/settings/SettingsWindow.tsx
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "chore: bump app version to 0.1.8"
```

Expected: 不包含 `AGENTS.md`、工作清单或现有代码主题修改。

### Task 4: 增加构建后 MSI 数据库 QA

**Files:**
- Create: `tools/windows-msi-qa.ps1`
- Modify: `package.json:25-29`
- Modify: `src/qa-workflows.test.ts:15-27`
- Modify: `src/qa-workflows.test.ts:85-98`
- Modify: `.github/workflows/release-windows-msi.yml:64-67`
- Test: `src/qa-workflows.test.ts`

- [ ] **Step 1: 增加 QA 入口和工作流红灯测试**

在 `src/qa-workflows.test.ts` 增加：

```ts
void test("Windows MSI QA is a stable release entrypoint", () => {
  assert.match(
    packageJson,
    /"qa:windows-msi":\s*"powershell -NoProfile -ExecutionPolicy Bypass -File tools\/windows-msi-qa\.ps1"/,
  );
  assert.equal(
    existsSync(new URL("../tools/windows-msi-qa.ps1", import.meta.url)),
    true,
  );
  assert.match(releaseWorkflow, /pnpm qa:windows-msi/);
});
```

- [ ] **Step 2: 运行测试并确认预期失败**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
```

Expected: FAIL，原因是 `qa:windows-msi`、脚本和发布工作流步骤尚不存在。

- [ ] **Step 3: 创建只读 MSI 数据库检查脚本**

创建 `tools/windows-msi-qa.ps1`：

```powershell
param(
    [string]$MsiPath = "",
    [string]$PreviousMsiPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriConfigPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle"
$msiDirectory = Join-Path $bundleRoot "msi"
$tauriConfig = Get-Content -Raw -Encoding UTF8 $tauriConfigPath | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
    $MsiPath = Get-ChildItem -LiteralPath $msiDirectory -Filter "*_$($tauriConfig.version)_*.msi" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

if ([string]::IsNullOrWhiteSpace($MsiPath) -or -not (Test-Path -LiteralPath $MsiPath)) {
    throw "MSI not found for version $($tauriConfig.version)."
}

function Get-MsiScalar {
    param(
        [Parameter(Mandatory)]
        [object]$Database,
        [Parameter(Mandatory)]
        [string]$Sql
    )

    $view = $Database.OpenView($Sql)
    $record = $null

    try {
        [void]$view.Execute()
        $record = $view.Fetch()
        if ($null -eq $record) {
            throw "MSI query returned no row: $Sql"
        }
        return $record.StringData(1)
    }
    finally {
        if ($null -ne $record) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
        }
        [void]$view.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($view)
    }
}

function Read-MsiContract {
    param(
        [Parameter(Mandatory)]
        [object]$Installer,
        [Parameter(Mandatory)]
        [string]$Path
    )

    $database = $Installer.OpenDatabase((Resolve-Path -LiteralPath $Path).Path, 0)
    try {
        return [ordered]@{
            Path = (Resolve-Path -LiteralPath $Path).Path
            ProductCode = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductCode'"
            ProductName = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductName'"
            ProductVersion = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'ProductVersion'"
            UpgradeCode = Get-MsiScalar $database "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = 'UpgradeCode'"
            InstallDir = Get-MsiScalar $database "SELECT ``DefaultDir`` FROM ``Directory`` WHERE ``Directory`` = 'INSTALLDIR'"
            RemoveExistingProductsSequence = [int](Get-MsiScalar $database "SELECT ``Sequence`` FROM ``InstallExecuteSequence`` WHERE ``Action`` = 'RemoveExistingProducts'")
            InstallFilesSequence = [int](Get-MsiScalar $database "SELECT ``Sequence`` FROM ``InstallExecuteSequence`` WHERE ``Action`` = 'InstallFiles'")
        }
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($database)
    }
}

$installer = New-Object -ComObject WindowsInstaller.Installer
try {
    $current = Read-MsiContract $installer $MsiPath
    $expectedUpgradeCode = "{D282D977-779F-5080-A3EA-623A41BA26A2}"

    if ($current.ProductName -ne $tauriConfig.productName) {
        throw "ProductName mismatch: $($current.ProductName)"
    }
    if ($current.ProductVersion -ne $tauriConfig.version) {
        throw "ProductVersion mismatch: $($current.ProductVersion)"
    }
    if ($current.UpgradeCode.ToUpperInvariant() -ne $expectedUpgradeCode) {
        throw "UpgradeCode changed: $($current.UpgradeCode)"
    }
    if ($current.InstallDir -ne "iMDReader") {
        throw "INSTALLDIR must default to iMDReader; got $($current.InstallDir)"
    }
    if ($current.RemoveExistingProductsSequence -ge $current.InstallFilesSequence) {
        throw "RemoveExistingProducts must run before InstallFiles."
    }

    $nsisDirectory = Join-Path $bundleRoot "nsis"
    $currentNsisArtifacts = @()
    if (Test-Path -LiteralPath $nsisDirectory) {
        $currentNsisArtifacts = @(
            Get-ChildItem -LiteralPath $nsisDirectory -File |
                Where-Object { $_.Name -like "*_$($tauriConfig.version)_*" }
        )
    }
    if ($currentNsisArtifacts.Count -gt 0) {
        throw "NSIS artifacts exist for version $($tauriConfig.version)."
    }

    $previous = $null
    if (-not [string]::IsNullOrWhiteSpace($PreviousMsiPath)) {
        $previous = Read-MsiContract $installer $PreviousMsiPath
        if ($previous.UpgradeCode.ToUpperInvariant() -ne $current.UpgradeCode.ToUpperInvariant()) {
            throw "Previous and current MSI UpgradeCode values differ."
        }
        if ([version]$previous.ProductVersion -ge [version]$current.ProductVersion) {
            throw "Previous MSI version must be lower than current MSI version."
        }
    }

    [ordered]@{
        status = "passed"
        current = $current
        previous = $previous
        nsisArtifactsForCurrentVersion = $currentNsisArtifacts.Count
    } | ConvertTo-Json -Depth 5
}
finally {
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)
}
```

- [ ] **Step 4: 增加 package 脚本**

在 `package.json` 的 QA 脚本中增加：

```json
"qa:windows-msi": "powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows-msi-qa.ps1"
```

- [ ] **Step 5: 发布工作流在构建后检查 MSI**

在 `.github/workflows/release-windows-msi.yml` 的 `Build Windows MSI` 后增加：

```yaml
      - name: Validate Windows MSI
        run: pnpm qa:windows-msi
```

- [ ] **Step 6: 运行工作流契约测试**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
```

Expected: PASS。

- [ ] **Step 7: 检查 PowerShell 语法**

Run:

```powershell
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path tools\windows-msi-qa.ps1),
    [ref]$null,
    [ref]$errors
)
if ($errors.Count -gt 0) {
    $errors | Format-List
    exit 1
}
```

Expected: exit 0，无语法错误。

- [ ] **Step 8: 提交 MSI QA 和发布守门**

```powershell
git add -- tools/windows-msi-qa.ps1 package.json src/qa-workflows.test.ts .github/workflows/release-windows-msi.yml
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "test: validate Windows MSI upgrade contract"
```

Expected: 只包含 MSI QA、package 入口、测试和 Windows MSI 发布工作流。

### Task 5: 同步架构、路线图、工作清单和发布规则

**Files:**
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-roadmap.md`
- Modify: `docs/implementation-worklist.md`
- Modify: `docs/qa/package-release-checklist.md`
- Modify: `AGENTS.md`
- Test: `src/qa-workflows.test.ts`

- [ ] **Step 1: 更新技术架构**

在 Windows 打包章节写明：

```text
Windows 只发布 MSI。MSI 使用稳定 UpgradeCode 和 WiX MajorUpgrade，
RemoveExistingProducts 调度在 afterInstallInitialize，使旧 MSI 在新文件写入前卸载。
默认 INSTALLDIR 为 C:\Program Files\iMDReader；升级不继承旧路径，
但 WixUI_InstallDir 允许用户在本次安装中主动选择其他目录。
```

- [ ] **Step 2: 更新产品路线图验收口径**

在系统集成/打包阶段增加：

```text
Windows MSI 从旧版本升级时先卸载旧 MSI，再安装新版本；
全新安装和升级安装均默认使用英文目录 iMDReader，
且不发布 NSIS 安装包。
```

- [ ] **Step 3: 更新发布验收清单**

把 Windows 安装部分替换为：

```markdown
## Windows MSI 安装

- 运行 `pnpm tauri build --bundles msi`，确认只生成 MSI，不生成当前版本 NSIS。
- 运行 `pnpm qa:windows-msi`，确认版本、UpgradeCode、`iMDReader` 目录和升级动作顺序。
- 无旧版本时，确认默认安装到 `C:\Program Files\iMDReader`，并确认安装向导允许本次修改路径。
- 安装已知旧 MSI 后再运行新 MSI，确认旧 ProductCode 已移除、新 ProductCode 已安装。
- 确认升级不继承旧中文目录或旧自定义目录。
- 卸载后确认安装文件被清理，但用户数据目录不被误删。
```

- [ ] **Step 4: 更新 AGENTS 固定验证链路**

在打包/Tauri 原生验证规则中加入：

```text
Windows MSI 模板、版本、安装目录或发布工作流修改：除相关 Rust/前端测试外，
运行 pnpm tauri build --bundles msi 和 pnpm qa:windows-msi；
涉及升级行为时按 docs/qa/package-release-checklist.md 做旧版升级与全新安装验收。
```

- [ ] **Step 5: 更新工作清单**

新增完成项，记录：

```text
0.1.8 版本同步、WiX MajorUpgrade 顺序、iMDReader 默认目录、旧路径不继承、
MSI-only、红绿测试、MSI 数据库检查、真实安装是否执行、完整回归命令、
测试 EXE/MSI 元数据、Windows/macOS 未验证边界。
```

- [ ] **Step 6: 让 QA 测试守护发布清单**

在 `src/qa-workflows.test.ts` 的打包验收清单断言中增加：

```ts
for (const requiredText of [
  "Windows MSI 安装",
  "pnpm qa:windows-msi",
  "C:\\\\Program Files\\\\iMDReader",
  "旧 ProductCode",
  "不生成当前版本 NSIS",
]) {
  assert.match(packageReleaseChecklist, new RegExp(requiredText));
}
```

- [ ] **Step 7: 运行文档契约测试**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
```

Expected: PASS。

- [ ] **Step 8: 精准暂存文档修改**

`AGENTS.md` 和 `docs/implementation-worklist.md` 已有其他未提交修改，必须逐块暂存本任务新增内容：

```powershell
git add -- docs/technical-architecture.md docs/feature-roadmap.md docs/qa/package-release-checklist.md src/qa-workflows.test.ts
git add -p -- AGENTS.md docs/implementation-worklist.md
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Expected: staged diff 只包含 MSI `0.1.8` 任务内容；代码主题修复及其既有规则不进入本次提交。

- [ ] **Step 9: 提交文档与发布规则**

```powershell
git commit -m "docs: record MSI upgrade release policy"
```

### Task 6: 构建并检查 0.1.8 MSI

**Files:**
- Verify: `src-tauri/target/release/bundle/msi/MD极简阅读_0.1.7_x64_zh-CN.msi`
- Generate: `src-tauri/target/release/bundle/msi/MD极简阅读_0.1.8_x64_zh-CN.msi`
- Verify: `src-tauri/target/release/wix/x64/main.wxs`

- [ ] **Step 1: 记录旧 MSI 基线**

Run:

```powershell
$previousMsi = Resolve-Path 'src-tauri\target\release\bundle\msi\MD极简阅读_0.1.7_x64_zh-CN.msi'
Get-FileHash -Algorithm SHA256 -LiteralPath $previousMsi
```

Expected: 文件存在并输出 SHA-256；若不存在，停止真实升级测试，不得伪造旧包。

- [ ] **Step 2: 构建新 MSI**

Run:

```powershell
pnpm tauri build --bundles msi
```

Expected: exit 0，生成 `MD极简阅读_0.1.8_x64_zh-CN.msi`，不生成 `0.1.8` NSIS。

- [ ] **Step 3: 检查当前 MSI 数据库**

Run:

```powershell
pnpm qa:windows-msi
```

Expected JSON:

```json
{
  "status": "passed",
  "current": {
    "ProductName": "MD极简阅读",
    "ProductVersion": "0.1.8",
    "UpgradeCode": "{D282D977-779F-5080-A3EA-623A41BA26A2}",
    "InstallDir": "iMDReader",
    "RemoveExistingProductsSequence": 1501,
    "InstallFilesSequence": 4000
  },
  "nsisArtifactsForCurrentVersion": 0
}
```

- [ ] **Step 4: 对比旧 MSI 与新 MSI**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\windows-msi-qa.ps1 `
    -PreviousMsiPath 'src-tauri\target\release\bundle\msi\MD极简阅读_0.1.7_x64_zh-CN.msi'
```

Expected: `status = passed`；旧版为 `0.1.7`，新版为 `0.1.8`，两者 `UpgradeCode` 相同。

- [ ] **Step 5: 检查渲染后的 WiX**

Run:

```powershell
rg -n "MajorUpgrade|RemoveExistingProducts|InstallFiles|INSTALLDIR|iMDReader|PrevInstallDir" src-tauri\target\release\wix\x64\main.wxs
```

Expected: `MajorUpgrade` 保持 `afterInstallInitialize`，`INSTALLDIR` 为 `iMDReader`，不存在 `PrevInstallDir`。

### Task 7: 在安全前提下执行真实升级和全新安装

**Files:**
- Use: `src-tauri/target/release/bundle/msi/MD极简阅读_0.1.7_x64_zh-CN.msi`
- Use: `src-tauri/target/release/bundle/msi/MD极简阅读_0.1.8_x64_zh-CN.msi`
- Generate: `output/msi-upgrade-qa/*.log`

- [ ] **Step 1: 只读检查现有用户安装状态**

Run:

```powershell
$uninstallRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$existingInstall = Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'MD极简阅读' }
$existingInstall | Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString
```

Expected:

- 如果有任何结果：停止 Task 7，不卸载或覆盖用户实例；在最终报告中标记真实升级与全新安装“未验证”。
- 如果无结果：继续下一步。

- [ ] **Step 2: 创建安装日志目录**

Run:

```powershell
$qaLogDirectory = Join-Path (Resolve-Path .) 'output\msi-upgrade-qa'
New-Item -ItemType Directory -Path $qaLogDirectory -Force | Out-Null
$appDataDirectory = Join-Path $env:APPDATA 'com.onlymd.reader'
$sentinelPath = Join-Path $appDataDirectory 'msi-upgrade-qa-sentinel.txt'
New-Item -ItemType Directory -Path $appDataDirectory -Force | Out-Null
Set-Content -LiteralPath $sentinelPath -Value 'preserve-user-data' -Encoding UTF8
```

- [ ] **Step 3: 安装 0.1.7 基线 MSI**

Run:

```powershell
$oldMsi = (Resolve-Path 'src-tauri\target\release\bundle\msi\MD极简阅读_0.1.7_x64_zh-CN.msi').Path
$oldInstall = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @(
    '/i', "`"$oldMsi`"", '/qn', '/norestart',
    '/L*v', "`"$qaLogDirectory\install-0.1.7.log`""
)
if ($oldInstall.ExitCode -notin 0, 3010) {
    throw "0.1.7 install failed with exit code $($oldInstall.ExitCode)"
}
```

Expected: exit code 0 或 3010。

- [ ] **Step 4: 用 0.1.8 执行升级**

Run:

```powershell
$newMsi = (Resolve-Path 'src-tauri\target\release\bundle\msi\MD极简阅读_0.1.8_x64_zh-CN.msi').Path
$upgrade = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @(
    '/i', "`"$newMsi`"", '/qn', '/norestart',
    '/L*v', "`"$qaLogDirectory\upgrade-0.1.7-to-0.1.8.log`""
)
if ($upgrade.ExitCode -notin 0, 3010) {
    throw "0.1.8 upgrade failed with exit code $($upgrade.ExitCode)"
}
```

- [ ] **Step 5: 验证升级结果**

Run:

```powershell
$newExecutable = Join-Path $env:ProgramFiles 'iMDReader\only-md-reader.exe'
$oldExecutable = Join-Path $env:ProgramFiles 'MD极简阅读\only-md-reader.exe'
if (-not (Test-Path -LiteralPath $newExecutable)) {
    throw "New executable is missing from $newExecutable"
}
if (Test-Path -LiteralPath $oldExecutable) {
    throw "Old executable still exists at $oldExecutable"
}
$installed = Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'MD极简阅读' }
if (@($installed).Count -ne 1 -or $installed.DisplayVersion -ne '0.1.8') {
    throw "Expected exactly one installed 0.1.8 product."
}
```

Expected: 只有一个 `0.1.8` 安装记录，新 EXE 位于 `C:\Program Files\iMDReader`，旧默认 EXE 不存在。

- [ ] **Step 6: 卸载升级后的测试版本**

Run:

```powershell
$productCode = $installed.PSChildName
$uninstall = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @(
    '/x', $productCode, '/qn', '/norestart',
    '/L*v', "`"$qaLogDirectory\uninstall-upgraded-0.1.8.log`""
)
if ($uninstall.ExitCode -notin 0, 3010) {
    throw "0.1.8 uninstall failed with exit code $($uninstall.ExitCode)"
}
```

- [ ] **Step 7: 在无旧版本状态下全新安装 0.1.8**

Run:

```powershell
$freshInstall = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @(
    '/i', "`"$newMsi`"", '/qn', '/norestart',
    '/L*v', "`"$qaLogDirectory\fresh-install-0.1.8.log`""
)
if ($freshInstall.ExitCode -notin 0, 3010) {
    throw "Fresh 0.1.8 install failed with exit code $($freshInstall.ExitCode)"
}
if (-not (Test-Path -LiteralPath $newExecutable)) {
    throw "Fresh install did not use $newExecutable"
}
```

- [ ] **Step 8: 卸载全新安装并确认清理**

Run:

```powershell
$freshProduct = Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'MD极简阅读' -and $_.DisplayVersion -eq '0.1.8' }
$freshUninstall = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @(
    '/x', $freshProduct.PSChildName, '/qn', '/norestart',
    '/L*v', "`"$qaLogDirectory\uninstall-fresh-0.1.8.log`""
)
if ($freshUninstall.ExitCode -notin 0, 3010) {
    throw "Fresh 0.1.8 uninstall failed with exit code $($freshUninstall.ExitCode)"
}
if (Test-Path -LiteralPath $newExecutable) {
    throw "Test executable remains after uninstall."
}
if ((Get-Content -Raw -Encoding UTF8 $sentinelPath).Trim() -ne 'preserve-user-data') {
    throw "The MSI removed or changed application user data."
}
Remove-Item -LiteralPath $sentinelPath
```

Expected: 测试安装记录和安装文件已清理；`%APPDATA%\com.onlymd.reader` 不被删除。

### Task 8: 执行完整跨功能回归并收口

**Files:**
- Verify: all modified files
- Generate: `src-tauri/target/release/only-md-reader.exe`
- Generate: `src-tauri/target/release/bundle/msi/MD极简阅读_0.1.8_x64_zh-CN.msi`

- [ ] **Step 1: 运行前端基线**

Run sequentially:

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Expected: 全部 exit 0；只允许工作清单 13.8 已记录的 Vite 大 chunk 非阻塞警告。

- [ ] **Step 2: 运行 Rust 基线**

Run sequentially:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --all-features -- -D warnings
```

Expected: 全部 exit 0，无 clippy warning。

- [ ] **Step 3: 依次运行五条固定 QA**

Run sequentially，避免本地固定端口和浏览器 profile 冲突：

```powershell
pnpm qa:settings-ui
pnpm qa:reader-ui
pnpm qa:markdown-performance
pnpm qa:pdf-export
pnpm qa:screenshots
```

Expected:

- 五条命令全部 `status: passed`。
- 阅读器明亮/暗色分别为 `Eva Light Bold` / `Eva Dark Bold`。
- 两种主题均至少 3 种 token 计算颜色，`highlightedTokenMismatches` 为空。

- [ ] **Step 4: 构建测试 EXE**

Run:

```powershell
pnpm tauri build --no-bundle --ci
```

Expected: exit 0，生成新的 `src-tauri/target/release/only-md-reader.exe`，不生成安装包。

- [ ] **Step 5: 重建并复验 MSI**

Run:

```powershell
pnpm tauri build --bundles msi
pnpm qa:windows-msi
```

Expected: 两条命令 exit 0，MSI QA 输出 `status: passed`。

- [ ] **Step 6: 记录最终产物元数据**

Run:

```powershell
$artifacts = @(
    'src-tauri\target\release\only-md-reader.exe',
    'src-tauri\target\release\bundle\msi\MD极简阅读_0.1.8_x64_zh-CN.msi'
)
Get-Item -LiteralPath $artifacts | Select-Object FullName, Length, LastWriteTime
Get-FileHash -Algorithm SHA256 -LiteralPath $artifacts
```

Expected: 两个文件都存在，并输出大小、时间戳和 SHA-256。

- [ ] **Step 7: 检查最终差异和工作区边界**

Run:

```powershell
git diff --check
git status --short --branch
git diff --stat
git log -6 --oneline --decorate
```

Expected:

- 没有 whitespace error。
- `.superpowers/`、`AGENTS.pdf`、既有 PDF 和代码主题修改保持原样。
- 没有 NSIS `0.1.8` 产物被纳入版本控制。

- [ ] **Step 8: 汇报**

按以下结构汇报：

```text
已完成：
- MSI Major Upgrade 顺序
- iMDReader 默认目录与旧路径不继承
- 0.1.8 版本同步
- MSI-only 发布守门

已验证：
- 红绿测试
- MSI 数据库
- 真实升级/全新安装（仅在实际执行成功时）
- 前端、Rust、五条固定 QA、代码主题、EXE/MSI 构建

未验证：
- 因现有用户安装而跳过的真实安装测试
- macOS 实机

已知限制：
- 不兼容历史 NSIS 自动卸载
- 已记录的 Vite 大 chunk 警告

产物：
- EXE 绝对路径、大小、时间戳、SHA-256
- MSI 绝对路径、大小、时间戳、SHA-256
```
