export const THEME_MODES = ["light", "dark"] as const;
export type ThemeColorMode = (typeof THEME_MODES)[number];

export const THEME_MODE_OPTIONS = ["light", "dark", "system"] as const;
export type ThemeModeSetting = (typeof THEME_MODE_OPTIONS)[number];

export const THEME_TOKEN_KEYS = [
  "appBg",
  "surfaceBg",
  "codeBg",
  "textPrimary",
  "textSecondary",
  "textMuted",
  "accent",
  "borderSoft",
  "selectionBg",
  "heading1",
  "heading2",
  "link",
  "markBg",
  "blockquoteBg",
  "blockquoteBorder",
  "tableHeaderBg",
  "tableBorder",
  "buttonPrimaryBg",
  "buttonPrimaryHover",
  "buttonPrimaryText",
  "buttonSecondaryBg",
  "buttonSecondaryHover",
  "buttonSecondaryText",
  "buttonGhostText",
  "buttonGhostHoverBg",
  "buttonDangerBg",
  "buttonDangerHover",
  "buttonDangerText",
  "controlBg",
  "controlHoverBg",
  "controlText",
  "controlPlaceholder",
  "controlBorder",
  "controlFocusBorder",
  "dropdownMenuBg",
  "dropdownOptionHoverBg",
  "dropdownOptionSelectedBg",
  "dropdownShadow",
  "switchTrackOff",
  "switchTrackOn",
  "switchThumb",
  "focusRing",
  "disabledBg",
  "disabledText",
  "panelShadow",
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];
export type ThemeTokens = Record<ThemeTokenKey, string>;

export type ThemeTokenBundle = {
  id: string;
  name: string;
  modes: Record<ThemeColorMode, ThemeTokens>;
};

const COLOR_VALUE_PATTERN =
  /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]+\)|hsla?\([^)]+\)|color-mix\([^)]+\)|transparent|currentColor)$/;
const NON_COLOR_TOKEN_KEYS = new Set<ThemeTokenKey>(["dropdownShadow", "panelShadow"]);

const MODE_SET = new Set<string>(THEME_MODES);
const MODE_OPTION_SET = new Set<string>(THEME_MODE_OPTIONS);

export function assertThemeMode(value: unknown): ThemeModeSetting {
  if (typeof value === "string" && MODE_OPTION_SET.has(value)) {
    return value as ThemeModeSetting;
  }

  throw new Error(`Unsupported theme mode "${String(value)}"`);
}

export function validateThemeTokenBundle(value: unknown): ThemeTokenBundle {
  if (!isRecord(value)) {
    throw new Error("theme bundle must be an object");
  }

  const id = requireString(value.id, "id");
  const name = requireString(value.name, "name");

  if (!isRecord(value.modes)) {
    throw new Error("modes must be an object");
  }

  for (const mode of Object.keys(value.modes)) {
    if (!MODE_SET.has(mode)) {
      throw new Error(`unsupported mode "${mode}"`);
    }
  }

  const modes = {
    light: validateThemeTokens(value.modes.light, "modes.light"),
    dark: validateThemeTokens(value.modes.dark, "modes.dark"),
  };

  return { id, name, modes };
}

function validateThemeTokens(value: unknown, path: string): ThemeTokens {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const tokens = {} as ThemeTokens;

  for (const key of THEME_TOKEN_KEYS) {
    const tokenPath = `${path}.${key}`;
    const tokenValue = value[key];

    if (tokenValue === undefined) {
      throw new Error(`${tokenPath} is required`);
    }

    const cssValue = requireString(tokenValue, tokenPath);

    if (!NON_COLOR_TOKEN_KEYS.has(key) && !COLOR_VALUE_PATTERN.test(cssValue)) {
      throw new Error(`${tokenPath} must be a CSS color`);
    }

    tokens[key] = cssValue;
  }

  return tokens;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
