import assert from "node:assert/strict";
import test from "node:test";
import { createWindowStateApi, detectTauriRuntime } from "./window-state-api.ts";

void test("window state API is inert in browser preview", async () => {
  const api = createWindowStateApi({ isTauriRuntime: false });

  assert.equal(await api.getWindowState("E:\\notes\\guide.md"), null);
  assert.equal(
    (await api.saveWindowState({ filePath: "E:\\notes\\guide.md", scrollTop: 12 }))
      .scrollTop,
    12,
  );
});

void test("window state API detects Tauri injected globals", () => {
  assert.equal(detectTauriRuntime({ __TAURI_INTERNALS__: {} }), true);
  assert.equal(detectTauriRuntime({}), false);
});
