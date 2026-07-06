import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "katex/dist/katex.css";
import warmPaper from "./shared/theme/themes/warm-paper.json";
import { validateThemeTokenBundle } from "./shared/theme/theme-schema";
import { applyReaderSettingsToRoot } from "./features/settings/apply-reader-settings";
import { createSettingsApi } from "./features/settings/settings-api";
import { defaultReaderSettings } from "./features/settings/reader-settings";
import "./shared/fonts/maple-mono-nf-cn.css";
import "./shared/theme/theme.css";

const MIN_BOOT_SCREEN_MS = 640;
const BOOT_SCREEN_FADE_MS = 220;

const hideBootScreen = () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const bootScreen = document.getElementById("boot-screen");

      window.setTimeout(() => {
        document.body.dataset.appReady = "true";

        if (!bootScreen) {
          return;
        }

        bootScreen.classList.add("boot-screen--leaving");
        window.setTimeout(() => {
          bootScreen.remove();
        }, BOOT_SCREEN_FADE_MS);
      }, MIN_BOOT_SCREEN_MS);
    });
  });
};

const theme = validateThemeTokenBundle(warmPaper);
const settingsApi = createSettingsApi();
applyReaderSettingsToRoot(theme, defaultReaderSettings);

void settingsApi.getReaderSettings().then((settings) => {
  applyReaderSettingsToRoot(theme, settings);
});

void settingsApi.listenForReaderSettingsChanges((settings) => {
  applyReaderSettingsToRoot(theme, settings);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

queueMicrotask(hideBootScreen);
