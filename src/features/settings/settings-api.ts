import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ReaderSettings, ReaderSettingsPatch } from "./reader-settings.ts";
import { defaultReaderSettings } from "./reader-settings.ts";

export const readerSettingsChangedEvent = "reader-settings-changed";

export type AvailableFontFamilies = {
  body: string[];
  code: string[];
};

export type SettingsApi = {
  getReaderSettings(): Promise<ReaderSettings>;
  listAvailableFontFamilies(): Promise<AvailableFontFamilies>;
  updateReaderSettings(patch: ReaderSettingsPatch): Promise<ReaderSettings>;
  resetReaderSettings(): Promise<ReaderSettings>;
  openSettingsWindow(): Promise<void>;
  listenForReaderSettingsChanges(
    handler: (settings: ReaderSettings) => void,
  ): Promise<UnlistenFn>;
};

type CreateSettingsApiOptions = {
  isTauriRuntime?: boolean;
  invoke?: InvokeFn;
  listen?: ListenFn;
  runtimeGlobal?: TauriRuntimeGlobal;
};

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type ListenFn = <T>(
  event: string,
  handler: (event: { payload: T }) => void,
) => Promise<UnlistenFn>;

type TauriRuntimeGlobal = {
  isTauri?: unknown;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

function createTauriSettingsApi(
  invokeCommand: InvokeFn = invoke,
  listenForEvent: ListenFn = listen,
): SettingsApi {
  return {
    getReaderSettings() {
      return invokeCommand<ReaderSettings>("get_reader_settings");
    },

    listAvailableFontFamilies() {
      return invokeCommand<AvailableFontFamilies>("list_available_font_families");
    },

    updateReaderSettings(patch) {
      return invokeCommand<ReaderSettings>("update_reader_settings", { patch });
    },

    resetReaderSettings() {
      return invokeCommand<ReaderSettings>("reset_reader_settings");
    },

    openSettingsWindow() {
      return invokeCommand<void>("open_settings_window");
    },

    listenForReaderSettingsChanges(handler) {
      return listenForEvent<ReaderSettings>(readerSettingsChangedEvent, (event) => {
        handler(event.payload);
      });
    },
  };
}

export const tauriSettingsApi: SettingsApi = createTauriSettingsApi();

export function createSettingsApi(options: CreateSettingsApiOptions = {}): SettingsApi {
  const isDesktopRuntime =
    options.isTauriRuntime ?? detectTauriRuntime(options.runtimeGlobal);
  return isDesktopRuntime
    ? createTauriSettingsApi(options.invoke, options.listen)
    : browserPreviewSettingsApi;
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

const browserPreviewSettingsApi: SettingsApi = {
  getReaderSettings() {
    return Promise.resolve(defaultReaderSettings);
  },

  listAvailableFontFamilies() {
    return Promise.resolve(defaultAvailableFontFamilies);
  },

  updateReaderSettings(patch) {
    return Promise.resolve({
      ...defaultReaderSettings,
      ...patch,
      schemaVersion: 1,
    });
  },

  resetReaderSettings() {
    return Promise.resolve(defaultReaderSettings);
  },

  openSettingsWindow() {
    return Promise.resolve();
  },

  listenForReaderSettingsChanges() {
    return Promise.resolve(() => undefined);
  },
};

export const defaultAvailableFontFamilies: AvailableFontFamilies = {
  body: [
    "Maple Mono NF CN",
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    "PingFang SC",
    "Noto Sans CJK SC",
    "Segoe UI",
    "Arial",
    "Times New Roman",
    "Georgia",
    "Tahoma",
    "Verdana",
  ],
  code: [
    "Maple Mono NF CN",
    "Cascadia Code",
    "Cascadia Mono",
    "Consolas",
    "Courier New",
    "Lucida Console",
    "SF Mono",
    "Menlo",
    "Monaco",
  ],
};
