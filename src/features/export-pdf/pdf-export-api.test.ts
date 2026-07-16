import assert from "node:assert/strict";
import test from "node:test";
import { createPdfExportApi } from "./pdf-export-api.ts";

void test("uses the Windows native system print command in Tauri", async () => {
  const commands: string[] = [];
  let browserPrints = 0;
  const api = createPdfExportApi({
    invokeCommand: (command: string) => {
      commands.push(command);
      return Promise.resolve();
    },
    isTauriRuntime: () => true,
    print: () => {
      browserPrints += 1;
    },
  });

  await api.openPrintDialog();

  assert.deepEqual(commands, ["open_pdf_print_dialog"]);
  assert.equal(browserPrints, 0);
});

void test("falls back to the browser print dialog outside Tauri", async () => {
  let invoked = false;
  let browserPrints = 0;
  const api = createPdfExportApi({
    invokeCommand: () => {
      invoked = true;
      return Promise.resolve();
    },
    isTauriRuntime: () => false,
    print: () => {
      browserPrints += 1;
    },
  });

  await api.openPrintDialog();

  assert.equal(invoked, false);
  assert.equal(browserPrints, 1);
});
