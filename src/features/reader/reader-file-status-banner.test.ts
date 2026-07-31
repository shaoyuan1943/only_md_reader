import assert from "node:assert/strict";
import test from "node:test";

import { getReaderFileStatusBanner } from "./reader-file-status.ts";

void test("missing status prioritizes relocating the file", () => {
  assert.deepEqual(getReaderFileStatusBanner("missing"), {
    tone: "warning",
    message: "❗ 文件已被删除或移动，当前显示的是最后一次读取的内容",
    primaryAction: "重新定位文件",
    secondaryAction: "重试",
  });
});

void test("a failed retry after deletion offers no further actions", () => {
  assert.deepEqual(getReaderFileStatusBanner("unreadable", true), {
    tone: "warning",
    message: "❗ 文件暂时无法读取，当前显示的是最后一次成功读取的内容",
    primaryAction: null,
    secondaryAction: null,
  });
});

void test("a recovered file has no banner", () => {
  assert.equal(getReaderFileStatusBanner("available"), null);
  assert.equal(getReaderFileStatusBanner("recovered"), null);
});
