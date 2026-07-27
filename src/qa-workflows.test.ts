import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release-windows-msi.yml", import.meta.url),
  "utf8",
);
const windowsMsiQa = readFileSync(
  new URL("../tools/windows-msi-qa.ps1", import.meta.url),
  "utf8",
);

void test("package exposes stable QA entrypoints for reader, performance, and screenshots", () => {
  assert.match(packageJson, /"qa:open-file-ui":\s*"node tools\/open-file-ui-qa\.mjs"/);
  assert.match(packageJson, /"qa:settings-ui":\s*"node tools\/settings-ui-qa\.mjs"/);
  assert.match(packageJson, /"qa:reader-ui":\s*"node tools\/reader-ui-qa\.mjs"/);
  assert.match(
    packageJson,
    /"qa:markdown-performance":\s*"node --experimental-strip-types tools\/markdown-performance-check\.mjs"/,
  );
  assert.match(
    packageJson,
    /"qa:screenshots":\s*"node tools\/playwright-screenshots\.mjs"/,
  );
});

void test("visual QA scripts and browser fixtures are committed under tools", () => {
  for (const relativePath of [
    "../tools/open-file-ui-qa.html",
    "../tools/open-file-ui-qa.tsx",
    "../tools/open-file-ui-qa.mjs",
    "../tools/reader-ui-qa.html",
    "../tools/reader-ui-qa.tsx",
    "../tools/reader-ui-qa.mjs",
    "../tools/markdown-performance-check.mjs",
    "../tools/playwright-screenshots.mjs",
  ]) {
    assert.equal(
      existsSync(new URL(relativePath, import.meta.url)),
      true,
      `${relativePath} should exist`,
    );
  }
});

void test("manual and packaging acceptance checklists are available for release QA", () => {
  const tauriManualChecklistUrl = new URL(
    "../docs/qa/tauri-manual-acceptance.md",
    import.meta.url,
  );
  const packageReleaseChecklistUrl = new URL(
    "../docs/qa/package-release-checklist.md",
    import.meta.url,
  );

  assert.equal(existsSync(tauriManualChecklistUrl), true);
  assert.equal(existsSync(packageReleaseChecklistUrl), true);

  const tauriManualChecklist = readFileSync(tauriManualChecklistUrl, "utf8");
  const packageReleaseChecklist = readFileSync(packageReleaseChecklistUrl, "utf8");

  for (const requiredText of [
    "打开文件",
    "多窗口",
    "重复打开聚焦",
    "设置保存",
    "阅读位置恢复",
  ]) {
    assert.match(tauriManualChecklist, new RegExp(requiredText));
  }

  for (const requiredText of [
    "Windows MSI 安装",
    "pnpm qa:windows-msi",
    "C:\\\\Program Files\\\\iMDReader",
    "旧 ProductCode",
    "不生成当前版本 NSIS",
    "严格低于当前版本",
    "检测到已安装的旧版本",
    "同版本重装",
    "高版本降级",
    "macOS 安装",
    "文件关联",
    "离线资源",
    "高 DPI",
  ]) {
    assert.match(packageReleaseChecklist, new RegExp(requiredText));
  }
});

void test("GitHub workflows verify the project and publish Windows MSI releases", () => {
  const validateReleaseTagStep = releaseWorkflow.match(
    / {6}- name: Validate release tag[\s\S]*?(?=\n {6}- name:)/,
  )?.[0];
  const validateReleaseTagRunBlock = validateReleaseTagStep?.match(
    / {8}run: \|\n(?<script>[\s\S]*)/,
  )?.groups?.script;

  assert.match(ciWorkflow, /branches:\s*\[main\]/);
  assert.match(ciWorkflow, /pnpm format:check/);
  assert.match(ciWorkflow, /pnpm test/);
  assert.match(ciWorkflow, /pnpm lint/);
  assert.match(ciWorkflow, /cargo test --manifest-path src-tauri\\Cargo\.toml/);

  assert.match(releaseWorkflow, /Release Windows MSI/);
  assert.match(releaseWorkflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(releaseWorkflow, /description:\s*"Release tag, for example v0\.1\.8"/);
  assert.match(releaseWorkflow, /default:\s*"v0\.1\.8"/);
  assert.ok(validateReleaseTagStep);
  assert.match(
    validateReleaseTagStep,
    /env:\s*\n\s+WORKFLOW_EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/,
  );
  assert.match(
    validateReleaseTagStep,
    /REQUESTED_TAG_NAME:\s*\$\{\{\s*inputs\.tag_name\s*\}\}/,
  );
  assert.match(
    validateReleaseTagStep,
    /GIT_REF_NAME:\s*\$\{\{\s*github\.ref_name\s*\}\}/,
  );
  assert.ok(validateReleaseTagRunBlock);
  assert.doesNotMatch(
    validateReleaseTagRunBlock,
    /\$\{\{\s*(?:inputs\.tag_name|github\.ref_name|github\.event_name)\s*\}\}/,
  );
  assert.match(validateReleaseTagRunBlock, /\$env:WORKFLOW_EVENT_NAME/);
  assert.match(validateReleaseTagRunBlock, /\$env:REQUESTED_TAG_NAME/);
  assert.match(validateReleaseTagRunBlock, /\$env:GIT_REF_NAME/);
  assert.match(
    releaseWorkflow,
    /Get-Content -Raw package\.json\s*\|\s*ConvertFrom-Json/,
  );
  assert.match(
    releaseWorkflow,
    /Get-Content -Raw src-tauri\\tauri\.conf\.json\s*\|\s*ConvertFrom-Json/,
  );
  assert.match(releaseWorkflow, /Package version .* does not match Tauri version/);
  assert.match(releaseWorkflow, /\$expectedTag\s*=\s*"v\$packageVersion"/);
  assert.match(releaseWorkflow, /\$tag\s+-cne\s+\$expectedTag/);
  assert.match(releaseWorkflow, /Release tag must be '\$expectedTag'/);
  assert.doesNotMatch(validateReleaseTagRunBlock, /v0\.1\.8/);
  assert.match(releaseWorkflow, /pnpm tauri build --bundles msi/);
  assert.match(releaseWorkflow, /NSIS artifacts were produced/);
  assert.match(releaseWorkflow, /gh release create/);
});

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

void test("Windows MSI QA normalizes WiX short and long directory names", () => {
  assert.match(
    windowsMsiQa,
    /\$current\.InstallDir = \(\$current\.InstallDir -split "\\\|"\)\[-1\]\r?\nif \(\$current\.InstallDir -cne "iMDReader"\)/,
  );
});

void test("Windows MSI QA verifies the generated Upgrade table blocks downgrades", () => {
  assert.match(
    windowsMsiQa,
    /SELECT ``UpgradeCode``,``VersionMin``,``VersionMax``,``Attributes``,``ActionProperty`` FROM ``Upgrade``/,
  );
  assert.match(windowsMsiQa, /WIX_DOWNGRADE_DETECTED/);
  assert.match(windowsMsiQa, /VersionMin/);
  assert.match(windowsMsiQa, /VersionMax/);
  assert.match(windowsMsiQa, /OnlyDetect/);
  assert.match(
    windowsMsiQa,
    /\$downgrade\.Attributes -cne \$msidbUpgradeAttributesOnlyDetect/,
  );
  assert.match(windowsMsiQa, /DowngradeDetected/);
  assert.match(
    windowsMsiQa,
    /SELECT ``Condition``,``Description`` FROM ``LaunchCondition``/,
  );
  assert.match(windowsMsiQa, /NOT WIX_DOWNGRADE_DETECTED/);
  assert.match(windowsMsiQa, /DowngradeBlockCondition/);
  assert.match(windowsMsiQa, /\[switch\]\$IncludeDowngradeContract/);
  assert.match(
    windowsMsiQa,
    /\$current = Read-MsiContract \$MsiPath -IncludeDowngradeContract/,
  );
  assert.match(
    windowsMsiQa,
    /\$previous = Read-MsiContract \(Resolve-Path -LiteralPath \$PreviousMsiPath\)\.Path\r?\n/,
  );
});

void test("Windows MSI QA verifies strict older-version UI routing", () => {
  assert.match(windowsMsiQa, /OLDER_VERSION_DETECTED/);
  assert.match(windowsMsiQa, /UpgradeReadyDlg/);
  assert.match(
    windowsMsiQa,
    /SELECT ``Dialog`` FROM ``Dialog`` WHERE ``Dialog`` = 'UpgradeReadyDlg'/,
  );
  assert.match(
    windowsMsiQa,
    /SELECT ``Dialog_``,``Control``,``Type``,``Text`` FROM ``Control``/,
  );
  assert.match(
    windowsMsiQa,
    /SELECT ``Dialog_``,``Control_``,``Event``,``Argument``,``Condition``,``Ordering`` FROM ``ControlEvent``/,
  );
  assert.match(windowsMsiQa, /VersionMaxInclusive/);
  assert.match(windowsMsiQa, /UpgradePrompt/);
});
