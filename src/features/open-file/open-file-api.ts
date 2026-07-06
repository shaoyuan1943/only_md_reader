import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createMarkdownDialogOptions,
  normalizeDialogSelection,
} from "./open-file-dialog.ts";
import type { RecentFile } from "./recent-files.ts";

export type OpenedMarkdownFile = {
  path: string;
  fileName: string;
  content: string;
  openedAt: number;
  fileSize: number;
  modifiedAt?: string;
};

export type OpenedReaderWindow = {
  path: string;
  fileName: string;
  windowLabel: string;
  created: boolean;
};

export type OpenFileApi = {
  chooseMarkdownFile(): Promise<string | null>;
  openMarkdownFile(path: string): Promise<OpenedReaderWindow>;
  listRecentFiles(): Promise<RecentFile[]>;
};

type CreateOpenFileApiOptions = {
  isTauriRuntime?: boolean;
  runtimeGlobal?: TauriRuntimeGlobal;
};

type TauriRuntimeGlobal = {
  isTauri?: unknown;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export const tauriOpenFileApi: OpenFileApi = {
  async chooseMarkdownFile() {
    const selection = await open(createMarkdownDialogOptions());
    return normalizeDialogSelection(selection);
  },

  openMarkdownFile(path) {
    return invoke<OpenedReaderWindow>("open_reader_window", {
      path,
      sourceWindowLabel: getCurrentWindow().label,
    });
  },

  listRecentFiles() {
    return invoke<RecentFile[]>("list_recent_files");
  },
};

export function createOpenFileApi(options: CreateOpenFileApiOptions = {}): OpenFileApi {
  const isDesktopRuntime =
    options.isTauriRuntime ?? detectTauriRuntime(options.runtimeGlobal);
  return isDesktopRuntime ? tauriOpenFileApi : browserPreviewOpenFileApi;
}

export function detectTauriRuntime(
  runtimeGlobal: TauriRuntimeGlobal = globalThis as TauriRuntimeGlobal,
): boolean {
  return Boolean(
    runtimeGlobal.isTauri ||
    runtimeGlobal.__TAURI__ ||
    runtimeGlobal.__TAURI_INTERNALS__,
  );
}

const browserPreviewOpenFileApi: OpenFileApi = {
  chooseMarkdownFile() {
    return Promise.reject(new Error("文件选择器只能在桌面环境中使用。"));
  },

  openMarkdownFile() {
    return Promise.reject(new Error("Markdown 文件只能在桌面环境中打开。"));
  },

  listRecentFiles() {
    return Promise.resolve([]);
  },
};
