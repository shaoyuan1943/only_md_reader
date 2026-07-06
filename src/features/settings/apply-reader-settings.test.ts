import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyReaderSettingsToRoot } from "./apply-reader-settings.ts";
import { defaultReaderSettings } from "./reader-settings.ts";
import { validateThemeTokenBundle } from "../../shared/theme/theme-schema.ts";

const warmPaper = validateThemeTokenBundle(
  JSON.parse(
    readFileSync(
      new URL("../../shared/theme/themes/warm-paper.json", import.meta.url),
      "utf8",
    ),
  ),
);

void test("reader settings write theme and typography CSS variables to the root", () => {
  const root = {
    dataset: {},
    style: new MapStyleDeclaration(),
  } as unknown as HTMLElement;

  applyReaderSettingsToRoot(
    warmPaper,
    {
      ...defaultReaderSettings,
      themeMode: "dark",
      bodyFontFamily: "PingFang SC",
      codeFontFamily: "Cascadia Code",
      bodyFontSize: 18,
      codeFontSize: 15,
      lineHeight: 1.72,
      contentMaxWidth: 920,
    },
    root,
    false,
  );

  assert.equal(root.dataset.themeMode, "dark");
  assert.equal(root.dataset.themeEffectiveMode, "dark");
  assert.equal(root.style.getPropertyValue("--reader-content-max-width"), "920px");
  assert.equal(root.style.getPropertyValue("--reader-body-font-size"), "18px");
  assert.equal(root.style.getPropertyValue("--reader-code-font-size"), "15px");
  assert.equal(root.style.getPropertyValue("--reader-line-height"), "1.72");
  assert.match(
    root.style.getPropertyValue("--reader-body-font-family"),
    /^"PingFang SC"/,
  );
  assert.match(
    root.style.getPropertyValue("--reader-code-font-family"),
    /^"Cascadia Code"/,
  );
});

class MapStyleDeclaration {
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string) {
    this.values.set(name, value);
  }

  getPropertyValue(name: string) {
    return this.values.get(name) ?? "";
  }
}
