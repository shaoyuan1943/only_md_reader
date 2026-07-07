import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "katex/dist/katex.css";
import warmPaper from "./shared/theme/themes/warm-paper.json";
import { validateThemeTokenBundle } from "./shared/theme/theme-schema";
import { applyReaderSettingsToRoot } from "./features/settings/apply-reader-settings";
import { createSettingsApi } from "./features/settings/settings-api";
import { defaultReaderSettings } from "./features/settings/reader-settings";
import { READER_READY_TO_REVEAL_EVENT } from "./shared/window-reveal";
import "./shared/fonts/maple-mono-nf-cn.css";
import "./shared/theme/theme.css";

const MIN_BOOT_SCREEN_MS = 640;
const BOOT_SCREEN_FADE_MS = 220;
const runtimeWindow = window as Window & {
  __TAURI_INTERNALS__?: unknown;
};
const isTauriRuntime = Boolean(runtimeWindow.__TAURI_INTERNALS__);
const windowKind = globalThis.__ONLY_MD_READER_BOOTSTRAP__?.windowKind;

const showCurrentWindowWhenReady = () => {
  if (!isTauriRuntime) {
    return;
  }

  const currentWindow = getCurrentWindow();
  const revealWindow =
    windowKind === "reader"
      ? currentWindow.maximize().then(() => currentWindow.show())
      : currentWindow.show();

  void revealWindow;
};

type HideBootScreenOptions = {
  fadeBootScreen?: boolean;
  delayMs?: number;
};

const hideBootScreen = ({
  fadeBootScreen = true,
  delayMs = MIN_BOOT_SCREEN_MS,
}: HideBootScreenOptions = {}) => {
  const revealDelayMs = delayMs;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const bootScreen = document.getElementById("boot-screen");

      window.setTimeout(() => {
        document.body.dataset.appReady = "true";

        if (!bootScreen) {
          requestAnimationFrame(showCurrentWindowWhenReady);
          return;
        }

        if (!fadeBootScreen) {
          bootScreen.remove();
          requestAnimationFrame(showCurrentWindowWhenReady);
          return;
        }

        bootScreen.classList.add("boot-screen--leaving");
        requestAnimationFrame(showCurrentWindowWhenReady);
        window.setTimeout(() => {
          bootScreen.remove();
        }, BOOT_SCREEN_FADE_MS);
      }, revealDelayMs);
    });
  });
};

const scheduleWindowReveal = () => {
  if (windowKind === "reader") {
    window.addEventListener(
      READER_READY_TO_REVEAL_EVENT,
      () => hideBootScreen({ fadeBootScreen: false, delayMs: 0 }),
      { once: true },
    );
    return;
  }

  queueMicrotask(() => hideBootScreen());
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

scheduleWindowReveal();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
