import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyTheme, getThemeCssVariables } from "./apply-theme.ts";
import { THEME_TOKEN_KEYS, validateThemeTokenBundle } from "./theme-schema.ts";

class StyleRecorder {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

function createTarget() {
  return {
    dataset: {} as Record<string, string>,
    style: new StyleRecorder(),
  };
}

const warmPaper = validateThemeTokenBundle(
  JSON.parse(
    readFileSync(new URL("./themes/warm-paper.json", import.meta.url), "utf8"),
  ),
);

void test("getThemeCssVariables maps every token key to a kebab CSS variable", () => {
  const variables = getThemeCssVariables(warmPaper.modes.light);

  assert.equal(Object.keys(variables).length, THEME_TOKEN_KEYS.length);
  assert.equal(variables["--app-bg"], "#EDE4D7");
  assert.equal(variables["--button-primary-bg"], "#8A5A3C");
  assert.equal(variables["--dropdown-option-selected-bg"], "#E7D3BD");
});

void test("applyTheme writes light mode CSS variables and metadata to the target root", () => {
  const target = createTarget();

  const result = applyTheme(warmPaper, { mode: "light", root: target });

  assert.equal(result.effectiveMode, "light");
  assert.equal(target.dataset.themeId, "warm-paper");
  assert.equal(target.dataset.themeMode, "light");
  assert.equal(target.dataset.themeEffectiveMode, "light");
  assert.equal(target.style.values.get("--app-bg"), "#EDE4D7");
  assert.equal(target.style.values.get("--control-focus-border"), "#A66E4F");
  assert.equal(target.style.values.get("--theme-color-scheme"), "light");
  assert.equal(target.style.values.get("color-scheme"), "light");
});

void test("applyTheme resolves system mode to dark when the system preference is dark", () => {
  const target = createTarget();

  const result = applyTheme(warmPaper, {
    mode: "system",
    root: target,
    systemPrefersDark: true,
  });

  assert.equal(result.effectiveMode, "dark");
  assert.equal(target.dataset.themeMode, "system");
  assert.equal(target.dataset.themeEffectiveMode, "dark");
  assert.equal(target.style.values.get("--app-bg"), "#151210");
  assert.equal(target.style.values.get("--button-primary-bg"), "#C28A63");
  assert.equal(target.style.values.get("--theme-color-scheme"), "dark");
});
