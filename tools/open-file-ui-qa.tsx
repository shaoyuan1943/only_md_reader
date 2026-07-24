import React from "react";
import ReactDOM from "react-dom/client";
import "../src/App.css";
import { OpenFileWindow } from "../src/features/open-file/OpenFileWindow.tsx";
import type { OpenFileApi } from "../src/features/open-file/open-file-api.ts";
import { applyReaderSettingsToRoot } from "../src/features/settings/apply-reader-settings.ts";
import { defaultReaderSettings } from "../src/features/settings/reader-settings.ts";
import "../src/shared/fonts/maple-mono-nf-cn.css";
import "../src/shared/theme/theme.css";
import { validateThemeTokenBundle } from "../src/shared/theme/theme-schema.ts";
import warmPaper from "../src/shared/theme/themes/warm-paper.json";

const theme = validateThemeTokenBundle(warmPaper);
const themeMode =
  new URLSearchParams(window.location.search).get("theme") === "dark"
    ? "dark"
    : "light";

applyReaderSettingsToRoot(
  theme,
  {
    ...defaultReaderSettings,
    themeMode,
  },
  document.documentElement,
  false,
);

const qaOpenFileApi: OpenFileApi = {
  chooseMarkdownFile() {
    return Promise.resolve(null);
  },

  openMarkdownFile() {
    return Promise.reject(new Error("Not used by open-file visual QA."));
  },

  listRecentFiles() {
    return Promise.resolve([]);
  },
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OpenFileWindow api={qaOpenFileApi} />
  </React.StrictMode>,
);
