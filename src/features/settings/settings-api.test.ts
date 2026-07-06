import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsApi, detectTauriRuntime } from "./settings-api.ts";
import { defaultReaderSettings } from "./reader-settings.ts";

void test("settings API uses browser defaults outside the desktop runtime", async () => {
  const api = createSettingsApi({ isTauriRuntime: false });

  assert.deepEqual(await api.getReaderSettings(), defaultReaderSettings);
  assert.deepEqual(await api.listAvailableFontFamilies(), {
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
  });
  assert.deepEqual(await api.updateReaderSettings({ themeMode: "dark" }), {
    ...defaultReaderSettings,
    themeMode: "dark",
  });
  await assert.doesNotReject(api.openSettingsWindow());
});

void test("settings API detects Tauri injected globals", () => {
  assert.equal(detectTauriRuntime({ __TAURI_INTERNALS__: {} }), true);
  assert.equal(detectTauriRuntime({}), false);
});

void test("settings API opens the native singleton settings window in desktop runtime", async () => {
  const invokedCommands: string[] = [];
  const invokeMock = <T>(command: string): Promise<T> => {
    invokedCommands.push(command);
    if (command === "open_settings_window") {
      return Promise.resolve(undefined as T);
    }
    return Promise.reject(new Error(`unexpected command: ${command}`));
  };
  const api = createSettingsApi({
    isTauriRuntime: true,
    invoke: invokeMock,
    listen: () => Promise.resolve(() => undefined),
  });

  await api.openSettingsWindow();

  assert.deepEqual(invokedCommands, ["open_settings_window"]);
});

void test("settings API loads desktop font families from Rust", async () => {
  const invokedCommands: string[] = [];
  const invokeMock = <T>(command: string): Promise<T> => {
    invokedCommands.push(command);
    if (command === "list_available_font_families") {
      return Promise.resolve({
        body: ["Maple Mono NF CN", "Microsoft YaHei UI", "Arial"],
        code: ["Maple Mono NF CN", "Consolas"],
      } as T);
    }
    return Promise.reject(new Error(`unexpected command: ${command}`));
  };
  const api = createSettingsApi({
    isTauriRuntime: true,
    invoke: invokeMock,
    listen: () => Promise.resolve(() => undefined),
  });

  assert.deepEqual(await api.listAvailableFontFamilies(), {
    body: ["Maple Mono NF CN", "Microsoft YaHei UI", "Arial"],
    code: ["Maple Mono NF CN", "Consolas"],
  });
  assert.deepEqual(invokedCommands, ["list_available_font_families"]);
});
