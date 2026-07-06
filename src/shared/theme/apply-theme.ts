import {
  THEME_TOKEN_KEYS,
  type ThemeModeSetting,
  type ThemeTokenBundle,
  type ThemeTokens,
} from "./theme-schema.ts";

type ThemeStyleTarget = {
  dataset?: Record<string, string | undefined>;
  style: {
    setProperty(name: string, value: string): void;
  };
};

export type ApplyThemeOptions = {
  mode: ThemeModeSetting;
  root?: ThemeStyleTarget;
  systemPrefersDark?: boolean;
};

export type ApplyThemeResult = {
  effectiveMode: "light" | "dark";
  variables: Record<string, string>;
};

export function applyTheme(
  theme: ThemeTokenBundle,
  options: ApplyThemeOptions,
): ApplyThemeResult {
  const effectiveMode = resolveThemeMode(options.mode, options.systemPrefersDark);
  const variables = getThemeCssVariables(theme.modes[effectiveMode]);
  const root = options.root ?? document.documentElement;

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  root.style.setProperty("--theme-color-scheme", effectiveMode);
  root.style.setProperty("color-scheme", effectiveMode);

  if (root.dataset) {
    root.dataset.themeId = theme.id;
    root.dataset.themeMode = options.mode;
    root.dataset.themeEffectiveMode = effectiveMode;
  }

  return { effectiveMode, variables };
}

export function getThemeCssVariables(tokens: ThemeTokens): Record<string, string> {
  return Object.fromEntries(
    THEME_TOKEN_KEYS.map((key) => [`--${toKebabCase(key)}`, tokens[key]]),
  );
}

function resolveThemeMode(
  mode: ThemeModeSetting,
  systemPrefersDark: boolean | undefined,
): "light" | "dark" {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return mode;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
