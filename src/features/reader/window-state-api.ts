import { invoke } from "@tauri-apps/api/core";
import type { WindowState } from "./window-state.ts";

export type SaveWindowStateRequest = {
  filePath: string;
  scrollTop?: number;
  scrollRatio?: number;
  activeHeadingId?: string;
  activeHeadingOffset?: number;
  fileModifiedAt?: string;
  fileSize?: number;
};

export type WindowStateApi = {
  getWindowState(filePath: string): Promise<WindowState | null>;
  saveWindowState(state: SaveWindowStateRequest): Promise<WindowState>;
};

type CreateWindowStateApiOptions = {
  isTauriRuntime?: boolean;
  runtimeGlobal?: TauriRuntimeGlobal;
};

type TauriRuntimeGlobal = {
  isTauri?: unknown;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export const tauriWindowStateApi: WindowStateApi = {
  getWindowState(filePath) {
    return invoke<WindowState | null>("get_window_state", { filePath });
  },

  saveWindowState(state) {
    return invoke<WindowState>("save_window_state", { state });
  },
};

export function createWindowStateApi(
  options: CreateWindowStateApiOptions = {},
): WindowStateApi {
  const isDesktopRuntime =
    options.isTauriRuntime ?? detectTauriRuntime(options.runtimeGlobal);
  return isDesktopRuntime ? tauriWindowStateApi : browserPreviewWindowStateApi;
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

const browserPreviewWindowStateApi: WindowStateApi = {
  getWindowState() {
    return Promise.resolve(null);
  },

  saveWindowState(state) {
    return Promise.resolve({
      filePath: state.filePath,
      scrollTop: state.scrollTop,
      scrollRatio: state.scrollRatio,
      activeHeadingId: state.activeHeadingId,
      activeHeadingOffset: state.activeHeadingOffset,
      fileModifiedAt: state.fileModifiedAt,
      fileSize: state.fileSize,
      updatedAt: new Date(0).toISOString(),
    });
  },
};
