export type ThemeMode = "light" | "dark" | "system";

export type ReaderSettings = {
  schemaVersion: 1;
  colorThemeId: "warm-paper";
  themeMode: ThemeMode;
  bodyFontFamily: string | null;
  codeFontFamily: string | null;
  bodyFontSize: number;
  codeFontSize: number;
  lineHeight: number;
  contentMaxWidth: number;
  lightCodeTheme: string;
  darkCodeTheme: string;
  pdfAllowGlobalScaling: boolean;
};

export type ReaderSettingsPatch = Partial<Omit<ReaderSettings, "schemaVersion">>;

export const defaultReaderSettings: ReaderSettings = {
  schemaVersion: 1,
  colorThemeId: "warm-paper",
  themeMode: "system",
  bodyFontFamily: null,
  codeFontFamily: null,
  bodyFontSize: 16,
  codeFontSize: 16,
  lineHeight: 1.86,
  contentMaxWidth: 860,
  lightCodeTheme: "Eva Light Bold",
  darkCodeTheme: "Eva Dark Bold",
  pdfAllowGlobalScaling: false,
};

export function mergeReaderSettingsPatch(
  current: ReaderSettings,
  patch: ReaderSettingsPatch,
): ReaderSettings {
  return {
    ...current,
    ...patch,
    schemaVersion: 1,
  };
}
