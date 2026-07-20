import assert from "node:assert/strict";
import test from "node:test";
import { getPdfExportFileName, startPdfExport } from "./export-pdf.ts";

void test("extracts only the PDF file name from native output paths", () => {
  assert.equal(
    getPdfExportFileName(String.raw`E:\notes\readme (2).pdf`),
    "readme (2).pdf",
  );
  assert.equal(getPdfExportFileName("/Users/name/notes/readme.pdf"), "readme.pdf");
});

void test("exports exactly once after readiness succeeds", async () => {
  let exports = 0;

  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    exportPdf: () => {
      exports += 1;
      return Promise.resolve({ outputPath: "E:/notes/readme.pdf" });
    },
  });

  assert.deepEqual(result, {
    kind: "exported",
    outputPath: "E:/notes/readme.pdf",
  });
  assert.equal(exports, 1);
});

void test("waits for the native PDF write before reporting success", async () => {
  let resolveExport: ((value: { outputPath: string }) => void) | undefined;
  let settled = false;

  const result = startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    exportPdf: () =>
      new Promise<{ outputPath: string }>((resolve) => {
        resolveExport = resolve;
      }),
  }).then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(settled, false);
  resolveExport?.({ outputPath: "E:/notes/readme.pdf" });
  assert.deepEqual(await result, {
    kind: "exported",
    outputPath: "E:/notes/readme.pdf",
  });
});

void test("does not export when export resources time out", async () => {
  let exports = 0;

  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "timeout" }),
    exportPdf: () => {
      exports += 1;
      return Promise.resolve({ outputPath: "E:/notes/readme.pdf" });
    },
  });

  assert.deepEqual(result, { kind: "resource-timeout" });
  assert.equal(exports, 0);
});

void test("returns the native export failure message", async () => {
  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    exportPdf: () => {
      throw new Error("native PDF unavailable");
    },
  });

  assert.deepEqual(result, {
    kind: "export-failed",
    message: "native PDF unavailable",
  });
});

void test("keeps local print fitting active until the native PDF write finishes", async () => {
  const events: string[] = [];

  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    prepareLayout: () => {
      events.push("prepare");
      return () => events.push("restore");
    },
    exportPdf: () => {
      events.push("export");
      return Promise.resolve({ outputPath: "E:/notes/readme.pdf" });
    },
  });

  assert.deepEqual(result, {
    kind: "exported",
    outputPath: "E:/notes/readme.pdf",
  });
  assert.deepEqual(events, ["prepare", "export", "restore"]);
});
