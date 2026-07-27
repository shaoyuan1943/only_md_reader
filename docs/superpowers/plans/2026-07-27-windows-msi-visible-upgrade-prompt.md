# Windows MSI Visible Upgrade Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect every installed MSI version strictly lower than the current package version and show a visible, single-step upgrade confirmation page before the existing Major Upgrade transaction removes the old version and installs the new one.

**Architecture:** Keep `MajorUpgrade` as the only removal mechanism. Add a separate `UpgradeVersion` row with `OnlyDetect="yes"` and an exclusive current-version upper bound to populate `OLDER_VERSION_DETECTED`; use that property only to route the existing install-directory page to a custom `UpgradeReadyDlg`. Extend the repository-owned MSI database QA to verify the version range, dialog controls, text, and navigation in the compiled MSI.

**Tech Stack:** Tauri 2, WiX Toolset 3 XML, Windows Installer MSI tables, PowerShell COM automation, Node.js test runner, TypeScript.

---

## File map

- Modify `src/app-shell.test.ts`: source-level contract for the strict old-version range and upgrade-only dialog.
- Modify `src-tauri/wix/main.wxs`: add `OLDER_VERSION_DETECTED`, `UpgradeReadyDlg`, and conditional navigation.
- Modify `src/qa-workflows.test.ts`: guard the compiled-MSI QA against losing the new table checks.
- Modify `tools/windows-msi-qa.ps1`: inspect `Upgrade`, `Dialog`, `Control`, and `ControlEvent` rows in the final MSI.
- Modify `AGENTS.md`: make visible upgrade prompting and strict version-range behavior permanent regression requirements.
- Modify `docs/technical-architecture.md`: record the separate detection-property/UI-routing boundary.
- Modify `docs/feature-roadmap.md`: add the visible-upgrade acceptance criterion.
- Modify `docs/qa/package-release-checklist.md`: add old/same/newer version UI cases.
- Modify `docs/implementation-worklist.md`: record implementation and final verification evidence without claiming unexecuted real upgrades.

### Task 1: Lock the source-level version-range and dialog contract

**Files:**
- Modify: `src/app-shell.test.ts:724-757`
- Test: `src/app-shell.test.ts`

- [ ] **Step 1: Add a failing source contract test**

Extend the existing Windows MSI test with exact extraction and assertions:

```ts
const olderVersionDetection = wixTemplate.match(
  /<Upgrade\b(?=[^>]*\bId="\{\{upgrade_code\}\}")[^>]*>\s*<UpgradeVersion\b(?<attributes>[^>]*)\/>\s*<\/Upgrade>/,
);
const upgradeDialog = wixTemplate.match(
  /<Dialog\b(?=[^>]*\bId="UpgradeReadyDlg")[^>]*>(?<body>[\s\S]*?)<\/Dialog>/,
);
const upgradeRoute = wixTemplate.match(
  /<Publish\b(?=[^>]*\bDialog="InstallDirDlg")(?=[^>]*\bControl="Next")(?=[^>]*\bEvent="NewDialog")(?=[^>]*\bValue="UpgradeReadyDlg")[^>]*>(?<condition>[\s\S]*?)<\/Publish>/,
);

assert.ok(olderVersionDetection?.groups);
assert.match(olderVersionDetection.groups.attributes, /\bMaximum="\{\{version\}\}"/);
assert.match(olderVersionDetection.groups.attributes, /\bIncludeMaximum="no"/);
assert.match(olderVersionDetection.groups.attributes, /\bOnlyDetect="yes"/);
assert.match(
  olderVersionDetection.groups.attributes,
  /\bProperty="OLDER_VERSION_DETECTED"/,
);
assert.doesNotMatch(olderVersionDetection.groups.attributes, /\bMinimum=/);

assert.ok(upgradeDialog?.groups);
assert.match(upgradeDialog.groups.body, /检测到已安装的旧版本/);
assert.match(
  upgradeDialog.groups.body,
  /继续后将先卸载旧版本，再安装 \[ProductName\] \[ProductVersion\]/,
);
assert.match(upgradeDialog.groups.body, /应用设置、最近文件和阅读位置不会被删除/);
assert.match(upgradeDialog.groups.body, /\bId="Upgrade"/);
assert.match(upgradeDialog.groups.body, /\bText="升级"/);
assert.match(upgradeDialog.groups.body, /\bId="Back"/);
assert.match(upgradeDialog.groups.body, /\bId="Cancel"/);

assert.ok(upgradeRoute?.groups);
assert.match(upgradeRoute.groups.condition, /\bOLDER_VERSION_DETECTED\b/);
assert.match(
  upgradeRoute.groups.condition,
  /WIXUI_DONTVALIDATEPATH OR WIXUI_INSTALLDIR_VALID="1"/,
);
assert.doesNotMatch(wixTemplate, /msiexec(?:\.exe)?\s+\/x/i);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: the Windows MSI contract fails because `OLDER_VERSION_DETECTED` and `UpgradeReadyDlg` do not exist.

- [ ] **Step 3: Commit the RED test**

```powershell
git add -- src/app-shell.test.ts
git commit -m "test: require visible MSI upgrade prompt"
```

### Task 2: Add strict old-version detection and the upgrade confirmation page

**Files:**
- Modify: `src-tauri/wix/main.wxs:46-54`
- Modify: `src-tauri/wix/main.wxs:85-106`
- Test: `src/app-shell.test.ts`

- [ ] **Step 1: Add a detection-only version range**

Immediately after the existing `MajorUpgrade` branch, add:

```xml
<Upgrade Id="{{upgrade_code}}">
    <UpgradeVersion
            Maximum="{{version}}"
            IncludeMaximum="no"
            OnlyDetect="yes"
            Property="OLDER_VERSION_DETECTED" />
</Upgrade>
```

Do not add `Minimum`: every related MSI strictly below the current three-part MSI version must be detected. Do not replace `MajorUpgrade`; it remains responsible for removal and downgrade blocking.

- [ ] **Step 2: Add the custom upgrade-ready dialog**

Inside the existing `<UI>` element, add:

```xml
<Dialog Id="UpgradeReadyDlg"
        Width="370"
        Height="270"
        Title="[ProductName] 安装程序"
        NoMinimize="yes">
    <Control Id="Title"
             Type="Text"
             X="25"
             Y="20"
             Width="320"
             Height="25"
             Transparent="yes"
             NoPrefix="yes"
             Text="{\WixUI_Font_Title}检测到已安装的旧版本" />
    <Control Id="Description"
             Type="Text"
             X="25"
             Y="65"
             Width="320"
             Height="75"
             NoPrefix="yes"
             Text="继续后将先卸载旧版本，再安装 [ProductName] [ProductVersion]。应用设置、最近文件和阅读位置不会被删除。" />
    <Control Id="BottomLine"
             Type="Line"
             X="0"
             Y="234"
             Width="370"
             Height="0" />
    <Control Id="Back"
             Type="PushButton"
             X="180"
             Y="243"
             Width="56"
             Height="17"
             Text="上一步">
        <Publish Event="NewDialog" Value="InstallDirDlg">1</Publish>
    </Control>
    <Control Id="Upgrade"
             Type="PushButton"
             X="236"
             Y="243"
             Width="56"
             Height="17"
             Default="yes"
             ElevationShield="yes"
             Text="升级">
        <Publish Event="EndDialog" Value="Return" Order="1">OutOfDiskSpace &lt;&gt; 1</Publish>
        <Publish Event="SpawnDialog" Value="OutOfRbDiskDlg" Order="2">OutOfDiskSpace = 1 AND OutOfNoRbDiskSpace = 0 AND (PROMPTROLLBACKCOST="P" OR NOT PROMPTROLLBACKCOST)</Publish>
        <Publish Event="EndDialog" Value="Return" Order="3">OutOfDiskSpace = 1 AND OutOfNoRbDiskSpace = 0 AND PROMPTROLLBACKCOST="D"</Publish>
        <Publish Event="EnableRollback" Value="False" Order="4">OutOfDiskSpace = 1 AND OutOfNoRbDiskSpace = 0 AND PROMPTROLLBACKCOST="D"</Publish>
        <Publish Event="SpawnDialog" Value="OutOfDiskDlg" Order="5">(OutOfDiskSpace = 1 AND OutOfNoRbDiskSpace = 1) OR (OutOfDiskSpace = 1 AND PROMPTROLLBACKCOST="F")</Publish>
    </Control>
    <Control Id="Cancel"
             Type="PushButton"
             X="304"
             Y="243"
             Width="56"
             Height="17"
             Cancel="yes"
             Text="取消">
        <Publish Event="SpawnDialog" Value="CancelDlg">1</Publish>
    </Control>
</Dialog>
```

- [ ] **Step 3: Route only detected older versions to the custom page**

Still inside `<UI>`, add this event after the existing license-skip events:

```xml
<Publish Dialog="InstallDirDlg"
         Control="Next"
         Event="NewDialog"
         Value="UpgradeReadyDlg"
         Order="5">OLDER_VERSION_DETECTED AND (WIXUI_DONTVALIDATEPATH OR WIXUI_INSTALLDIR_VALID="1")</Publish>
```

The built-in fresh-install event remains order `4`; the order `5` event is the final navigation event only when `OLDER_VERSION_DETECTED` is set. Same-version reinstalls do not set the property because the upper bound is exclusive. Newer installed versions remain blocked by `WIX_DOWNGRADE_DETECTED`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: all app-shell tests pass.

- [ ] **Step 5: Build the MSI to prove the WiX authoring links**

Run:

```powershell
pnpm tauri build --bundles msi
```

Expected: WiX candle/light and Tauri build exit `0`; the only accepted warning is the already-recorded Vite chunk-size warning.

- [ ] **Step 6: Inspect the generated version-range and UI rows**

Use read-only Windows Installer COM queries against the generated `0.1.8` MSI:

```sql
SELECT `UpgradeCode`,`VersionMin`,`VersionMax`,`Attributes`,`ActionProperty`
FROM `Upgrade`
WHERE `ActionProperty`='OLDER_VERSION_DETECTED'
```

Expected:

```text
VersionMin = empty
VersionMax = 0.1.8
Attributes = 2
ActionProperty = OLDER_VERSION_DETECTED
```

Also query `Dialog`, `Control`, and `ControlEvent` for `UpgradeReadyDlg`. Expected: the dialog, five controls, upgrade execution events, Back/Cancel events, and the conditional route all exist.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- src-tauri/wix/main.wxs
git commit -m "feat: show MSI upgrade confirmation"
```

### Task 3: Make the compiled MSI QA enforce the visible prompt

**Files:**
- Modify: `src/qa-workflows.test.ts`
- Modify: `tools/windows-msi-qa.ps1`
- Test: `src/qa-workflows.test.ts`

- [ ] **Step 1: Add a failing QA-script guard**

Append:

```ts
void test("Windows MSI QA verifies strict older-version UI routing", () => {
  assert.match(windowsMsiQa, /OLDER_VERSION_DETECTED/);
  assert.match(windowsMsiQa, /UpgradeReadyDlg/);
  assert.match(
    windowsMsiQa,
    /SELECT ``Dialog`` FROM ``Dialog`` WHERE ``Dialog`` = 'UpgradeReadyDlg'/,
  );
  assert.match(windowsMsiQa, /SELECT ``Dialog_``,``Control``,``Type``,``Text`` FROM ``Control``/);
  assert.match(
    windowsMsiQa,
    /SELECT ``Dialog_``,``Control_``,``Event``,``Argument``,``Condition``,``Ordering`` FROM ``ControlEvent``/,
  );
  assert.match(windowsMsiQa, /VersionMaxInclusive/);
  assert.match(windowsMsiQa, /UpgradePrompt/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
```

Expected: the new QA-script guard fails because the script does not inspect MSI UI tables.

- [ ] **Step 3: Add read-only MSI UI row readers**

Add two helpers following the existing COM cleanup pattern:

```powershell
function Get-MsiDialogControls {
    param([object]$Database)

    $view = $null
    $record = $null
    $rows = @()
    try {
        $view = $Database.OpenView(
            "SELECT ``Dialog_``,``Control``,``Type``,``Text`` FROM ``Control`` WHERE ``Dialog_`` = 'UpgradeReadyDlg'"
        )
        [void]$view.Execute()
        while ($null -ne ($record = $view.Fetch())) {
            $rows += [pscustomobject][ordered]@{
                Dialog = $record.StringData(1)
                Control = $record.StringData(2)
                Type = $record.StringData(3)
                Text = $record.StringData(4)
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
            $record = $null
        }
        return $rows
    }
    finally {
        if ($null -ne $record) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
        }
        if ($null -ne $view) {
            try { [void]$view.Close() }
            finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($view) }
        }
    }
}

function Get-MsiUpgradePromptEvents {
    param([object]$Database)

    $view = $null
    $record = $null
    $rows = @()
    try {
        $view = $Database.OpenView(
            "SELECT ``Dialog_``,``Control_``,``Event``,``Argument``,``Condition``,``Ordering`` FROM ``ControlEvent`` WHERE ``Dialog_`` = 'InstallDirDlg' OR ``Dialog_`` = 'UpgradeReadyDlg'"
        )
        [void]$view.Execute()
        while ($null -ne ($record = $view.Fetch())) {
            $rows += [pscustomobject][ordered]@{
                Dialog = $record.StringData(1)
                Control = $record.StringData(2)
                Event = $record.StringData(3)
                Argument = $record.StringData(4)
                Condition = $record.StringData(5)
                Ordering = $record.IntegerData(6)
            }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
            $record = $null
        }
        return $rows
    }
    finally {
        if ($null -ne $record) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)
        }
        if ($null -ne $view) {
            try { [void]$view.Close() }
            finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($view) }
        }
    }
}
```

- [ ] **Step 4: Include UI rows in the current MSI contract**

Under `-IncludeDowngradeContract`, add:

```powershell
$contract.UpgradePromptDialog = Get-MsiScalar $database "SELECT ``Dialog`` FROM ``Dialog`` WHERE ``Dialog`` = 'UpgradeReadyDlg'"
$contract.UpgradePromptControls = @(Get-MsiDialogControls $database)
$contract.UpgradePromptEvents = @(Get-MsiUpgradePromptEvents $database)
```

- [ ] **Step 5: Validate the exclusive old-version row**

After the existing sequence checks, add:

```powershell
$msidbUpgradeAttributesOnlyDetect = 2
$msidbUpgradeAttributesVersionMaxInclusive = 512
$olderVersionRows = @(
    $current.UpgradeRows |
        Where-Object { $_.ActionProperty -ceq "OLDER_VERSION_DETECTED" }
)
if ($olderVersionRows.Count -ne 1) {
    throw "Expected exactly one OLDER_VERSION_DETECTED row."
}
$olderVersion = $olderVersionRows[0]
if ($olderVersion.UpgradeCode.ToUpperInvariant() -cne $expectedUpgradeCode) {
    throw "OLDER_VERSION_DETECTED must use the stable UpgradeCode."
}
if (-not [string]::IsNullOrWhiteSpace($olderVersion.VersionMin)) {
    throw "OLDER_VERSION_DETECTED must not set a minimum version."
}
if ($olderVersion.VersionMax -cne $current.ProductVersion) {
    throw "OLDER_VERSION_DETECTED VersionMax must equal ProductVersion."
}
if (($olderVersion.Attributes -band $msidbUpgradeAttributesOnlyDetect) -eq 0) {
    throw "OLDER_VERSION_DETECTED must be detection-only."
}
if (($olderVersion.Attributes -band $msidbUpgradeAttributesVersionMaxInclusive) -ne 0) {
    throw "OLDER_VERSION_DETECTED must exclude the current version."
}
```

- [ ] **Step 6: Validate the dialog text and navigation**

Add:

```powershell
$title = @(
    $current.UpgradePromptControls |
        Where-Object {
            $_.Control -ceq "Title" -and
            $_.Text -match "检测到已安装的旧版本"
        }
)
$description = @(
    $current.UpgradePromptControls |
        Where-Object {
            $_.Control -ceq "Description" -and
            $_.Text -match "先卸载旧版本" -and
            $_.Text -match "\[ProductVersion\]"
        }
)
$upgradeButton = @(
    $current.UpgradePromptControls |
        Where-Object { $_.Control -ceq "Upgrade" -and $_.Text -ceq "升级" }
)
$upgradeRoute = @(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "InstallDirDlg" -and
            $_.Control -ceq "Next" -and
            $_.Event -ceq "NewDialog" -and
            $_.Argument -ceq "UpgradeReadyDlg" -and
            $_.Condition -match "\bOLDER_VERSION_DETECTED\b"
        }
)
$standardRoute = @(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "InstallDirDlg" -and
            $_.Control -ceq "Next" -and
            $_.Event -ceq "NewDialog" -and
            $_.Argument -ceq "VerifyReadyDlg"
        }
)
$upgradeExecution = @(
    $current.UpgradePromptEvents |
        Where-Object {
            $_.Dialog -ceq "UpgradeReadyDlg" -and
            $_.Control -ceq "Upgrade" -and
            $_.Event -ceq "EndDialog" -and
            $_.Argument -ceq "Return"
        }
)
if ($current.UpgradePromptDialog -cne "UpgradeReadyDlg" -or
    $title.Count -ne 1 -or $description.Count -ne 1 -or
    $upgradeButton.Count -ne 1 -or $upgradeRoute.Count -ne 1 -or
    $standardRoute.Count -ne 1 -or $upgradeExecution.Count -lt 1) {
    throw "Compiled MSI upgrade prompt contract is incomplete."
}
if ($upgradeRoute[0].Ordering -le $standardRoute[0].Ordering) {
    throw "The conditional upgrade route must override the standard ready-page route."
}
```

Include `OlderVersionDetected`, `UpgradePrompt`, and the prompt route in the final JSON.

- [ ] **Step 7: Verify GREEN with the compiled MSI**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
pnpm qa:windows-msi
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows-msi-qa.ps1 -PreviousMsiPath "E:\only_md_reader\src-tauri\target\release\bundle\msi\MD极简阅读_0.1.7_x64_zh-CN.msi"
```

Expected: all commands exit `0`; JSON reports the strict old-version row and compiled prompt controls.

- [ ] **Step 8: Commit the MSI QA**

```powershell
git add -- src/qa-workflows.test.ts tools/windows-msi-qa.ps1
git commit -m "test: validate compiled MSI upgrade prompt"
```

### Task 4: Update durable architecture, release, and regression rules

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-roadmap.md`
- Modify: `docs/qa/package-release-checklist.md`
- Modify: `docs/implementation-worklist.md`
- Test: `src/qa-workflows.test.ts`

- [ ] **Step 1: Add failing release-checklist assertions**

In `manual and packaging acceptance checklists are available for release QA`, require:

```ts
for (const requiredText of [
  "严格低于当前版本",
  "检测到已安装的旧版本",
  "同版本重装",
  "高版本降级",
]) {
  assert.match(packageReleaseChecklist, new RegExp(requiredText));
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
```

Expected: the release checklist test fails because the new acceptance cases are absent.

- [ ] **Step 3: Update architecture and product acceptance**

Add the following decisions:

- `OLDER_VERSION_DETECTED` is UI-only and detects every same-UpgradeCode MSI strictly below the current version.
- `WIX_UPGRADE_DETECTED` remains the removal property.
- `WIX_DOWNGRADE_DETECTED` remains the higher-version block.
- Fresh, older, same, and newer version paths have distinct expected UI.
- The upgrade confirmation page replaces the generic ready page and does not add another confirmation click.

- [ ] **Step 4: Update the release checklist**

Add four MSI UI cases:

```text
- 无相关 MSI：显示普通“准备好安装”页面。
- 同 UpgradeCode 且严格低于当前版本：显示“检测到已安装的旧版本”和“升级”按钮。
- 同版本重装：不得显示“旧版本”提示。
- 已安装版本高于当前包：显示降级拦截，不得进入升级提示页。
```

Require `pnpm qa:windows-msi` to validate the final MSI tables before any manual UI check.

- [ ] **Step 5: Update AGENTS and worklist without overclaiming**

Add a permanent rule under Windows MSI validation:

```text
升级提示属于永久回归项：最终 MSI 必须用版本范围识别所有严格低于当前包版本的同 UpgradeCode MSI；同版本重装不得显示旧版本提示，高版本必须走降级拦截。`pnpm qa:windows-msi` 必须验证最终 MSI 的 Upgrade、Dialog、Control 和 ControlEvent 表。可见界面验收未执行时必须列为“未验证”。
```

In the worklist, record implementation and automated evidence only. Keep actual upgrade/install/uninstall and any unexecuted clean-machine UI path under “未验证”.

- [ ] **Step 6: Verify GREEN and commit docs**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
pnpm format:check
git diff --check
```

Expected: all commands pass.

```powershell
git add -- AGENTS.md docs/technical-architecture.md docs/feature-roadmap.md docs/qa/package-release-checklist.md docs/implementation-worklist.md src/qa-workflows.test.ts
git commit -m "docs: require visible MSI upgrade validation"
```

### Task 5: Verify the visible page without modifying the installed application

**Files:**
- No tracked file changes expected
- Verify: final `0.1.8` MSI

- [ ] **Step 1: Capture the safety baseline**

Read the three uninstall registry scopes and Windows Installer product metadata. Expected baseline on the current host:

```text
DisplayName = MD极简阅读
DisplayVersion = 0.1.6
ProductCode = {18AEB4C3-DDE8-4143-B566-E1449FE540F3}
InstallLocation = C:\Program Files\MD极简阅读\
```

Also record that `C:\Program Files\iMDReader` and an installed `0.1.8` ProductCode do not exist.

- [ ] **Step 2: Launch only the pre-install MSI UI**

Open the final `0.1.8` MSI normally. Navigate through the installation-directory page to the ready page.

Expected:

```text
Title: 检测到已安装的旧版本
Body includes: 先卸载旧版本
Body includes: MD极简阅读 0.1.8
Primary button: 升级
```

Do not click “升级”.

- [ ] **Step 3: Cancel and verify zero host mutation**

Click “取消” and confirm cancellation. Re-read the safety baseline.

Expected:

- the installed version remains `0.1.6`;
- ProductCode and installation directory remain unchanged;
- no `0.1.8` uninstall entry exists;
- no `C:\Program Files\iMDReader` directory was created;
- user data timestamps are unchanged without reading file contents;
- no `msiexec` remains running.

If native UI inspection cannot be executed safely or automatically, report it as unverified; do not substitute MSI table checks for a visual claim.

### Task 6: Run the complete cross-feature regression and refresh artifacts

**Files:**
- Modify: `docs/implementation-worklist.md`

- [ ] **Step 1: Run the complete verification baseline serially**

Run:

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
pnpm qa:windows-msi
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows-msi-qa.ps1 -PreviousMsiPath "E:\only_md_reader\src-tauri\target\release\bundle\msi\MD极简阅读_0.1.7_x64_zh-CN.msi"
```

Expected:

- all commands exit `0`;
- code-theme QA verifies Eva Light Bold/Eva Dark Bold through computed token colors with multiple colors and zero mismatches;
- only the already-recorded Vite chunk warning is accepted;
- no current-version NSIS is generated.

- [ ] **Step 2: Record final artifact metadata**

For the final EXE and MSI, record absolute path, byte size, LastWriteTime, SHA-256, ProductCode, and UpgradeCode. Confirm the final MSI includes:

- `OLDER_VERSION_DETECTED` with an exclusive current-version upper bound;
- `UpgradeReadyDlg` and the Chinese prompt;
- `RemoveExistingProducts < InstallFiles`;
- the downgrade detection row and `NOT WIX_DOWNGRADE_DETECTED`;
- `INSTALLDIR=iMDReader`;
- zero current-version NSIS artifacts.

- [ ] **Step 3: Update final worklist evidence**

Update only the relevant MSI worklist entry with actual results. Explicitly separate:

- implemented;
- automated/static verified;
- native pre-install prompt verified or unverified;
- real upgrade/fresh install/uninstall unverified unless executed in a safe environment;
- GitHub-hosted Actions unverified until push;
- macOS unverified.

- [ ] **Step 4: Re-run document checks and commit**

```powershell
pnpm format:check
git diff --check
git add -- docs/implementation-worklist.md
git commit -m "docs: record visible MSI upgrade verification"
git status --short --branch
```

Expected: the branch is clean after the evidence commit.

### Task 7: Final independent review

**Files:**
- Review all commits after `6bcf7e9`

- [ ] **Step 1: Review the complete change against the approved spec**

Confirm:

- any same-UpgradeCode MSI below the current version gets the visible prompt;
- same version does not get the old-version prompt;
- higher versions remain blocked;
- fresh installation remains unchanged;
- prompt text is compiled into the final MSI;
- no external uninstaller or NSIS support was introduced;
- existing code-theme behavior remains intact;
- all unverified boundaries are explicit.

- [ ] **Step 2: Fix every review issue with RED/GREEN evidence**

For each issue, add or tighten a failing test before the production fix, run the focused test to GREEN, and rerun the affected QA.

- [ ] **Step 3: Run the final completion checks**

Run:

```powershell
pnpm test
cargo test --manifest-path src-tauri\Cargo.toml
git diff --check
git status --short --branch
```

Expected: all pass and the worktree is clean.
