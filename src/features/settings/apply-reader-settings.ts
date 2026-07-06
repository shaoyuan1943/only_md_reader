import type { ThemeTokenBundle } from "../../shared/theme/theme-schema.ts";
import { applyTheme } from "../../shared/theme/apply-theme.ts";
import type { ReaderSettings } from "./reader-settings.ts";

export function applyReaderSettingsToRoot(
  theme: ThemeTokenBundle,
  settings: ReaderSettings,
  root: HTMLElement = document.documentElement,
  systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
) {
  applyTheme(theme, {
    mode: settings.themeMode,
    systemPrefersDark,
    root,
  });

  root.style.setProperty("--reader-content-max-width", `${settings.contentMaxWidth}px`);
  root.style.setProperty("--reader-body-font-size", `${settings.bodyFontSize}px`);
  root.style.setProperty("--reader-code-font-size", `${settings.codeFontSize}px`);
  root.style.setProperty("--reader-line-height", `${settings.lineHeight}`);
  root.style.setProperty(
    "--reader-body-font-family",
    buildFontStack(settings.bodyFontFamily, "body"),
  );
  root.style.setProperty(
    "--reader-code-font-family",
    buildFontStack(settings.codeFontFamily, "code"),
  );
}

function buildFontStack(fontFamily: string | null, kind: "body" | "code"): string {
  const primary = fontFamily?.trim()
    ? quoteFontFamily(fontFamily)
    : '"Maple Mono NF CN"';

  if (kind === "code") {
    return `${primary}, ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace`;
  }

  return `${primary}, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
}

function quoteFontFamily(fontFamily: string): string {
  const escaped = fontFamily.replace(/"/g, '\\"');
  return `"${escaped}"`;
}
