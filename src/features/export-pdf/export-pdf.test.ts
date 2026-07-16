import assert from "node:assert/strict";
import test from "node:test";
import { startPdfExport } from "./export-pdf.ts";

void test("prints exactly once after readiness succeeds", async () => {
  let prints = 0;

  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    print: () => {
      prints += 1;
    },
  });

  assert.deepEqual(result, { kind: "printed" });
  assert.equal(prints, 1);
});

void test("waits for the native system print dialog request before reporting success", async () => {
  let resolvePrint: (() => void) | undefined;
  let settled = false;

  const result = startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    print: () =>
      new Promise<void>((resolve) => {
        resolvePrint = resolve;
      }),
  }).then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(settled, false);
  resolvePrint?.();
  assert.deepEqual(await result, { kind: "printed" });
});

void test("does not print when export resources time out", async () => {
  let prints = 0;

  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "timeout" }),
    print: () => {
      prints += 1;
    },
  });

  assert.deepEqual(result, { kind: "resource-timeout" });
  assert.equal(prints, 0);
});

void test("returns the print failure message when the native print dialog cannot open", async () => {
  const result = await startPdfExport({
    awaitReadiness: () => Promise.resolve({ kind: "ready" }),
    print: () => {
      throw new Error("native print unavailable");
    },
  });

  assert.deepEqual(result, {
    kind: "print-failed",
    message: "native print unavailable",
  });
});
