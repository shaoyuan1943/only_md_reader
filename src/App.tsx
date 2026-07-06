import "./App.css";
import type { OpenedMarkdownFile } from "./features/open-file/open-file-api.ts";
import { createOpenFileApi } from "./features/open-file/open-file-api.ts";
import { OpenFileWindow } from "./features/open-file/OpenFileWindow.tsx";
import { ReaderPreviewWindow } from "./features/reader/ReaderPreviewWindow.tsx";
import { SettingsWindow } from "./features/settings/SettingsWindow.tsx";

const openFileApi = createOpenFileApi();
const bootstrap = globalThis.__ONLY_MD_READER_BOOTSTRAP__;

function App() {
  if (bootstrap?.windowKind === "reader") {
    return (
      <ReaderPreviewWindow
        file={bootstrap.file}
        initialWindowState={bootstrap.windowState ?? null}
      />
    );
  }

  if (bootstrap?.windowKind === "settings") {
    return <SettingsWindow />;
  }

  return <OpenFileWindow api={openFileApi} />;
}

export default App;

declare global {
  // Rust injects this before the React bundle runs for secondary windows.
  // The open-file window leaves it undefined and renders the chooser instead.
  var __ONLY_MD_READER_BOOTSTRAP__: AppWindowBootstrap | undefined;
}

type AppWindowBootstrap =
  | {
      windowKind: "reader";
      file: OpenedMarkdownFile;
      windowState?: import("./features/reader/window-state.ts").WindowState | null;
    }
  | {
      windowKind: "settings";
    };
