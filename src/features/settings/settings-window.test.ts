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
    ["外观主题", "阅读字体", "代码字体"],
  );
  assert.equal(model.fields[0]?.value, "system");
  assert.equal(model.fields[1]?.value, "Maple Mono NF CN");
  assert.equal(model.fields[2]?.value, "Maple Mono NF CN");
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
