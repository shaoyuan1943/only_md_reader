import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenFileApi,
  detectTauriRuntime,
  type OpenedReaderWindow,
  tauriOpenFileApi,
} from "./open-file-api.ts";

void test("runtime detection accepts Tauri injected internals", () => {
  assert.equal(detectTauriRuntime({ __TAURI_INTERNALS__: {} }), true);
  assert.equal(detectTauriRuntime({ __TAURI__: {} }), true);
  assert.equal(detectTauriRuntime({ isTauri: true }), true);
  assert.equal(detectTauriRuntime({}), false);
});

void test("open file API uses the desktop implementation when Tauri internals exist", () => {
  const api = createOpenFileApi({
    runtimeGlobal: {
      __TAURI_INTERNALS__: {},
    },
  });

  assert.equal(api, tauriOpenFileApi);
});

void test("browser preview API returns an empty recent list without invoking Tauri", async () => {
  const api = createOpenFileApi({ isTauriRuntime: false });

  assert.deepEqual(await api.listRecentFiles(), []);
});

void test("browser preview API does not pretend to open native files", async () => {
  const api = createOpenFileApi({ isTauriRuntime: false });

  await assert.rejects(() => api.openMarkdownFile("E:\\notes\\readme.md"), /桌面环境/);
});

void test("opened reader window result reports path label and whether a new window was created", () => {
  const result = {
    path: "E:\\notes\\readme.md",
    fileName: "readme.md",
    windowLabel: "reader-abc123",
    created: true,
  } satisfies OpenedReaderWindow;

  assert.deepEqual(result, {
    path: "E:\\notes\\readme.md",
    fileName: "readme.md",
    windowLabel: "reader-abc123",
    created: true,
  });
});
