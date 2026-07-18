import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultReaderSettings,
  mergeReaderSettingsPatch,
  type ReaderSettings,
} from "./reader-settings.ts";

void test("default reader settings match the persisted camelCase contract", () => {
  assert.deepEqual(Object.keys(defaultReaderSettings), [
    "schemaVersion",
    "colorThemeId",
    "themeMode",
    "bodyFontFamily",
    "codeFontFamily",
    "bodyFontSize",
    "codeFontSize",
    "lineHeight",
    "contentMaxWidth",
    "lightCodeTheme",
    "darkCodeTheme",
    "pdfAllowGlobalScaling",
  ]);
  assert.equal(defaultReaderSettings.schemaVersion, 1);
  assert.equal(defaultReaderSettings.colorThemeId, "warm-paper");
  assert.equal(defaultReaderSettings.themeMode, "system");
  assert.equal(defaultReaderSettings.bodyFontFamily, null);
  assert.equal(defaultReaderSettings.codeFontFamily, null);
  assert.equal(defaultReaderSettings.bodyFontSize, 16);
  assert.equal(defaultReaderSettings.codeFontSize, 16);
  assert.equal(defaultReaderSettings.lineHeight, 1.86);
  assert.equal(defaultReaderSettings.contentMaxWidth, 860);
  assert.equal(defaultReaderSettings.lightCodeTheme, "Eva Light Bold");
  assert.equal(defaultReaderSettings.darkCodeTheme, "Eva Dark Bold");
  assert.equal(Reflect.get(defaultReaderSettings, "pdfAllowGlobalScaling"), false);
});

void test("settings patches cannot change the schema version", () => {
  const current: ReaderSettings = {
    ...defaultReaderSettings,
    themeMode: "light",
  };

  const updated = mergeReaderSettingsPatch(current, {
    themeMode: "dark",
    contentMaxWidth: 920,
  });

  assert.deepEqual(updated, {
    ...defaultReaderSettings,
    themeMode: "dark",
    contentMaxWidth: 920,
  });
});
