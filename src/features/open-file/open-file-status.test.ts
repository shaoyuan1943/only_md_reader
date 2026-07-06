import assert from "node:assert/strict";
import test from "node:test";
import { getVisibleOpenFileStatusMessage } from "./open-file-status.ts";

void test("open file operation states do not render helper status text", () => {
  assert.equal(getVisibleOpenFileStatusMessage({ status: "idle" }), null);
  assert.equal(getVisibleOpenFileStatusMessage({ status: "loading" }), null);
  assert.equal(getVisibleOpenFileStatusMessage({ status: "ready" }), null);
});

void test("open file errors still render explicit failure text", () => {
  assert.equal(
    getVisibleOpenFileStatusMessage({
      status: "error",
      message: "文件不存在。",
    }),
    "文件不存在。",
  );
});
