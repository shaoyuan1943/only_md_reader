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
    "Windows 安装",
    "macOS 安装",
    "文件关联",
    "离线资源",
    "高 DPI",
  ]) {
    assert.match(packageReleaseChecklist, new RegExp(requiredText));
  }
});

void test("GitHub workflows verify the project and publish Windows MSI releases", () => {
  assert.match(ciWorkflow, /branches:\s*\[main\]/);
  assert.match(ciWorkflow, /pnpm format:check/);
  assert.match(ciWorkflow, /pnpm test/);
  assert.match(ciWorkflow, /pnpm lint/);
  assert.match(ciWorkflow, /cargo test --manifest-path src-tauri\\Cargo\.toml/);

  assert.match(releaseWorkflow, /Release Windows MSI/);
  assert.match(releaseWorkflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(releaseWorkflow, /\^v\\d\+\\\.\\d\+\\\.\\d\+\$/);
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
