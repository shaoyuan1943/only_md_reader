import assert from "node:assert/strict";
import test from "node:test";
import { createPdfExportApi } from "./pdf-export-api.ts";

void test("uses the native direct-export command in Tauri", async () => {
  const calls: Array<{ command: string; args: Record<string, string> }> = [];
  const api = createPdfExportApi({
    invokeCommand: (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ outputPath: "E:/notes/readme.pdf" });
    },
    isTauriRuntime: () => true,
  });

  const result = await api.exportPdf("E:/notes/readme.md");

  assert.deepEqual(calls, [
    {
      command: "export_pdf",
      args: { sourcePath: "E:/notes/readme.md" },
    },
  ]);
  assert.deepEqual(result, { outputPath: "E:/notes/readme.pdf" });
});

void test("never falls back to a browser print dialog outside Tauri", async () => {
  let invoked = false;
  const api = createPdfExportApi({
    invokeCommand: () => {
      invoked = true;
      return Promise.resolve({ outputPath: "E:/notes/readme.pdf" });
    },
    isTauriRuntime: () => false,
  });

  await assert.rejects(() => api.exportPdf("E:/notes/readme.md"), {
    message: "PDF 导出只能在桌面应用中使用。",
  });

  assert.equal(invoked, false);
});
