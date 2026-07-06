import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  THEME_TOKEN_KEYS,
  assertThemeMode,
  validateThemeTokenBundle,
  type ThemeTokenBundle,
} from "./theme-schema.ts";

const warmPaper = JSON.parse(
  readFileSync(new URL("./themes/warm-paper.json", import.meta.url), "utf8"),
) as unknown;

void test("Warm Paper bundle contains complete light and dark token sets", () => {
  const theme = validateThemeTokenBundle(warmPaper);

  assert.equal(theme.id, "warm-paper");
  assert.equal(theme.name, "Warm Paper");
  assert.deepEqual(Object.keys(theme.modes).sort(), ["dark", "light"]);

  for (const mode of ["light", "dark"] as const) {
    for (const key of THEME_TOKEN_KEYS) {
      assert.ok(theme.modes[mode][key], `${mode}.${key} should be present`);
    }
  }
});

void test("theme validation rejects missing token fields with a precise path", () => {
  const invalidTheme: ThemeTokenBundle = structuredClone(
    validateThemeTokenBundle(warmPaper),
  );
  const lightTokens: Partial<Record<(typeof THEME_TOKEN_KEYS)[number], string>> =
    invalidTheme.modes.light;
  delete lightTokens.codeBg;

  assert.throws(
    () => validateThemeTokenBundle(invalidTheme),
    /modes\.light\.codeBg is required/,
  );
});

void test("theme validation rejects invalid CSS color tokens with a precise path", () => {
  const invalidTheme: ThemeTokenBundle = structuredClone(
    validateThemeTokenBundle(warmPaper),
  );
  invalidTheme.modes.dark.buttonPrimaryBg = "warm brown";

  assert.throws(
    () => validateThemeTokenBundle(invalidTheme),
    /modes\.dark\.buttonPrimaryBg must be a CSS color/,
  );
});

void test("theme validation rejects unsupported mode keys", () => {
  const invalidTheme = structuredClone(
    validateThemeTokenBundle(warmPaper),
  ) as ThemeTokenBundle & {
    modes: ThemeTokenBundle["modes"] & { sepia: ThemeTokenBundle["modes"]["light"] };
  };
  invalidTheme.modes.sepia = invalidTheme.modes.light;

  assert.throws(
    () => validateThemeTokenBundle(invalidTheme),
    /unsupported mode "sepia"/,
  );
});

void test("theme mode validation accepts light dark system and rejects anything else", () => {
  assert.equal(assertThemeMode("light"), "light");
  assert.equal(assertThemeMode("dark"), "dark");
  assert.equal(assertThemeMode("system"), "system");

  assert.throws(() => assertThemeMode("sepia"), /Unsupported theme mode "sepia"/);
});
