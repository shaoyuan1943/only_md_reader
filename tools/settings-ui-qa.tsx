import React from "react";
import ReactDOM from "react-dom/client";
import "../src/App.css";
import "katex/dist/katex.css";
import { SettingsWindow } from "../src/features/settings/SettingsWindow.tsx";
import { applyReaderSettingsToRoot } from "../src/features/settings/apply-reader-settings.ts";
import {
  defaultReaderSettings,
  type ReaderSettings,
  type ReaderSettingsPatch,
} from "../src/features/settings/reader-settings.ts";
import type { SettingsApi } from "../src/features/settings/settings-api.ts";
import { defaultAvailableFontFamilies } from "../src/features/settings/settings-api.ts";
import "../src/shared/fonts/maple-mono-nf-cn.css";
import "../src/shared/theme/theme.css";
import { validateThemeTokenBundle } from "../src/shared/theme/theme-schema.ts";
import warmPaper from "../src/shared/theme/themes/warm-paper.json";

const theme = validateThemeTokenBundle(warmPaper);
let currentSettings: ReaderSettings = defaultReaderSettings;

declare global {
  interface Window {
    __qaSettingsPatches?: ReaderSettingsPatch[];
  }
}

window.__qaSettingsPatches = [];
applyReaderSettingsToRoot(theme, currentSettings);

const qaSettingsApi: SettingsApi = {
  getReaderSettings() {
    return Promise.resolve(currentSettings);
  },

  listAvailableFontFamilies() {
    return Promise.resolve({
      body: [
        ...defaultAvailableFontFamilies.body,
        "Noto Sans SC",
        "Times New Roman",
        "Georgia",
      ],
      code: [
        ...defaultAvailableFontFamilies.code,
        "Cascadia Mono",
        "Courier New",
        "Lucida Console",
      ],
    });
  },

  updateReaderSettings(patch) {
    window.__qaSettingsPatches?.push(patch);
    currentSettings = {
      ...currentSettings,
      ...patch,
      schemaVersion: 1,
    };
    applyReaderSettingsToRoot(theme, currentSettings);

    return Promise.resolve(currentSettings);
  },

  resetReaderSettings() {
    currentSettings = defaultReaderSettings;
    applyReaderSettingsToRoot(theme, currentSettings);

    return Promise.resolve(currentSettings);
  },

  openSettingsWindow() {
    return Promise.resolve();
  },

  listenForReaderSettingsChanges() {
    return Promise.resolve(() => undefined);
  },
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsWindow api={qaSettingsApi} />
  </React.StrictMode>,
);
