import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultReaderSettings } from "./reader-settings.ts";
import { createSettingsWindowViewModel } from "./settings-window.ts";

void test("settings window view model follows the settings.html prototype rows", () => {
  const model = createSettingsWindowViewModel(defaultReaderSettings);

  assert.equal(model.title, "设置");
  assert.deepEqual(
    model.fields.map((field) => field.label),
    ["外观主题", "阅读字体", "代码字体", "PDF 导出"],
  );
  assert.equal(model.fields[0]?.value, "system");
  assert.equal(model.fields[1]?.value, "Maple Mono NF CN");
  assert.equal(model.fields[2]?.value, "Maple Mono NF CN");
  assert.equal(model.fields[3]?.value, false);
});

void test("settings window renders the approved PDF auto-scale switch icons", () => {
  const settingsWindowTsx = readLocalSource("SettingsWindow.tsx");

  assert.match(settingsWindowTsx, /允许自动缩小 PDF 内容/);
  assert.match(settingsWindowTsx, /超宽内容可能触发整页缩小，导致不同文件字号显示不同/);
  assert.doesNotMatch(settingsWindowTsx, /超宽内容可触发整页缩小，最终字号可能不同/);
  assert.match(settingsWindowTsx, /pdf-auto-scale-toggle/);
  assert.match(
    settingsWindowTsx,
    /m-406 60c80\.081 0 145 64\.919 145 145s-64\.919 145-145 145/,
  );
  assert.match(
    settingsWindowTsx,
    /m0 60c80\.081 0 145 64\.919 145 145s-64\.919 145-145 145/,
  );
});

void test("PDF auto-scale switch uses palette colors without outer button chrome", () => {
  const appCss = readFileSync(new URL("../../App.css", import.meta.url), "utf8");
  const baseRule = readCssRule(appCss, ".pdf-auto-scale-toggle");
  const hoverRule = readCssRule(appCss, ".pdf-auto-scale-toggle:hover");
  const pressedRule = readCssRule(
    appCss,
    '.pdf-auto-scale-toggle[aria-pressed="true"]',
  );

  assert.match(baseRule, /background:\s*transparent/);
  assert.match(baseRule, /color:\s*var\(--text-secondary\)/);
  assert.doesNotMatch(baseRule, /border-radius:/);
  assert.doesNotMatch(baseRule, /box-shadow:/);
  assert.match(hoverRule, /color:\s*var\(--control-focus-border\)/);
  assert.match(pressedRule, /color:\s*var\(--switch-track-on\)/);
  assert.doesNotMatch(pressedRule, /box-shadow:/);
});

void test("font dropdown keeps four complete options visible in the compact window", () => {
  const appCss = readFileSync(new URL("../../App.css", import.meta.url), "utf8");
  const menuRule = readCssRule(appCss, ".select-menu");
  const optionRule = readCssRule(appCss, ".select-option");

  assert.match(
    menuRule,
    /--select-menu-max-height:\s*clamp\(168px,\s*calc\(100vh - 318px\),\s*196px\)/,
  );
  assert.match(optionRule, /min-height:\s*42px/);
});

void test("font dropdown scrollbar keeps the normal arrow cursor", () => {
  const appCss = readFileSync(new URL("../../App.css", import.meta.url), "utf8");
  const hotzoneRule = readCssRule(appCss, ".select-menu-scrollbar-hotzone");
  const trackRule = readCssRule(appCss, ".select-menu-scrollbar");
  const thumbRule = readCssRule(appCss, ".select-menu-scrollbar-thumb");

  assert.match(hotzoneRule, /cursor:\s*default/);
  assert.match(trackRule, /cursor:\s*default/);
  assert.match(thumbRule, /cursor:\s*default/);
  assert.match(
    appCss,
    /\.select-menu\[data-dragging-scrollbar="true"\] \.select-menu-scrollbar-thumb\s*\{[^}]*cursor:\s*default/,
  );
  assert.doesNotMatch(thumbRule, /cursor:\s*grab/);
  assert.doesNotMatch(appCss, /cursor:\s*grabbing/);
});

void test("an expanded font dropdown raises the settings panel above the title", () => {
  const appCss = readFileSync(new URL("../../App.css", import.meta.url), "utf8");
  const titleRule = readCssRule(appCss, ".settings-window-title");
  const panelRule = readCssRule(appCss, ".settings-panel");
  const expandedPanelRule = readCssRule(
    appCss,
    ".settings-panel:has(.custom-select[open])",
  );
  const expandedTitleRule = readCssRule(
    appCss,
    ".settings-window-frame:has(.custom-select[open]) .settings-window-title",
  );

  assert.match(titleRule, /z-index:\s*4/);
  assert.match(panelRule, /z-index:\s*3/);
  assert.match(expandedPanelRule, /z-index:\s*5/);
  assert.match(expandedTitleRule, /visibility:\s*hidden/);
});

void test("expanded font menus use the stronger palette dropdown shadow for elevation", () => {
  const appCss = readFileSync(new URL("../../App.css", import.meta.url), "utf8");
  const menuRule = readCssRule(appCss, ".select-menu");

  assert.match(
    menuRule,
    /box-shadow:\s*var\(--dropdown-shadow\),\s*inset 0 0 0 1px var\(--control-border\)/,
  );
  assert.doesNotMatch(
    menuRule,
    /0 18px 36px color-mix\(in srgb, var\(--app-bg\) 48%, transparent\)/,
  );
});

void test("settings form moves upward to fit the compact window height", () => {
  const appCss = readFileSync(new URL("../../App.css", import.meta.url), "utf8");
  const panelRule = readCssRule(appCss, ".settings-panel");
  const compactBreakpoint = appCss.indexOf("@media (max-width: 560px)");
  assert.notEqual(compactBreakpoint, -1);
  const responsiveCss = appCss.slice(compactBreakpoint);
  const responsivePanelRule = readCssRule(responsiveCss, ".settings-panel");

  assert.match(panelRule, /top:\s*58px/);
  assert.match(panelRule, /padding:\s*12px 40px 28px/);
  assert.match(responsivePanelRule, /top:\s*58px/);
  assert.match(responsivePanelRule, /padding:\s*12px 22px 28px/);
});

void test("settings window exposes bundled default plus broad system font fallbacks", () => {
  const settingsWindowTsx = readLocalSource("SettingsWindow.tsx");
  const settingsApiTs = readLocalSource("settings-api.ts");

  assert.match(settingsWindowTsx, /availableFonts/);
  assert.match(settingsWindowTsx, /listAvailableFontFamilies/);
  assert.match(settingsWindowTsx, /createFontOptions/);
  assert.match(settingsApiTs, /"Arial"/);
  assert.match(settingsApiTs, /"Segoe UI"/);
  assert.match(settingsApiTs, /"Times New Roman"/);
  assert.match(settingsApiTs, /"Courier New"/);
  assert.match(settingsApiTs, /"Cascadia Mono"/);
});

function readLocalSource(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function readCssRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1] ?? "";
}
