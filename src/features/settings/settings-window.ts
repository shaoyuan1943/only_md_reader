import type { ReaderSettings } from "./reader-settings.ts";

export type SettingsSectionId = "appearance" | "typography" | "code";

export type SettingsWindowViewModel = {
  title: string;
  fields: Array<{
    id: keyof ReaderSettings;
    label: string;
    value: string;
  }>;
};

export function createSettingsWindowViewModel(
  settings: ReaderSettings,
): SettingsWindowViewModel {
  return {
    title: "设置",
    fields: [
      {
        id: "themeMode",
        label: "外观主题",
        value: settings.themeMode,
      },
      {
        id: "bodyFontFamily",
        label: "阅读字体",
        value: settings.bodyFontFamily ?? "Maple Mono NF CN",
      },
      {
        id: "codeFontFamily",
        label: "代码字体",
        value: settings.codeFontFamily ?? "Maple Mono NF CN",
      },
    ],
  };
}
