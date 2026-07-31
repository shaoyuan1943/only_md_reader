import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  createMarkdownDialogOptions,
  normalizeDialogSelection,
} from "../open-file/open-file-dialog.ts";
import type { OpenedMarkdownFile } from "../open-file/open-file-api.ts";
import type { ReaderFileStatus } from "./reader-file-sync.ts";

export type ReaderFileChangedEvent = {
  path: string;
  status: Exclude<ReaderFileStatus, "available" | "recovered"> | "changed";
  revision: number;
};

export type ReaderFileRebindResult =
  | { kind: "rebound"; file: OpenedMarkdownFile }
  | { kind: "existingWindow"; windowLabel: string };

export type ReaderFileSyncApi = {
  chooseMarkdownFile(): Promise<string | null>;
  closeCurrentWindow(): Promise<void>;
  listen(listener: (event: ReaderFileChangedEvent) => void): Promise<() => void>;
  readCurrentFile(): Promise<OpenedMarkdownFile>;
  rebindCurrentFile(path: string): Promise<ReaderFileRebindResult>;
};

type ReaderFileEventWindow = {
  listen<T>(
    event: string,
    listener: (event: { payload: T }) => void,
  ): Promise<() => void>;
};

export function createTauriReaderFileSyncApiForWindow(
  currentWindow: ReaderFileEventWindow,
): ReaderFileSyncApi {
  return {
    async chooseMarkdownFile() {
      return normalizeDialogSelection(await open(createMarkdownDialogOptions()));
    },
    closeCurrentWindow() {
      return getCurrentWindow().close();
    },
    async listen(listener) {
      return currentWindow.listen<ReaderFileChangedEvent>(
        "reader:file-changed",
        ({ payload }) => {
          listener(payload);
        },
      );
    },
    readCurrentFile() {
      return invoke<OpenedMarkdownFile>("read_current_reader_file");
    },
    rebindCurrentFile(path) {
      return invoke<ReaderFileRebindResult>("rebind_current_reader_file", { path });
    },
  };
}

const browserReaderFileSyncApi: ReaderFileSyncApi = {
  chooseMarkdownFile: () =>
    Promise.reject(new Error("文件选择器只能在桌面环境中使用。")),
  closeCurrentWindow: () => Promise.resolve(),
  listen: () => Promise.resolve(() => undefined),
  readCurrentFile: () => Promise.reject(new Error("文件同步只能在桌面环境中使用。")),
  rebindCurrentFile: () => Promise.reject(new Error("文件同步只能在桌面环境中使用。")),
};

type TauriRuntimeGlobal = Window & { __TAURI_INTERNALS__?: unknown };

export function createReaderFileSyncApi(
  runtimeGlobal: TauriRuntimeGlobal = window,
): ReaderFileSyncApi {
  return runtimeGlobal.__TAURI_INTERNALS__
    ? createTauriReaderFileSyncApiForWindow(getCurrentWindow())
    : browserReaderFileSyncApi;
}
