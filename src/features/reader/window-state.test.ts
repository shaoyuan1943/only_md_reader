import assert from "node:assert/strict";
import test from "node:test";
import {
  getRestoreTarget,
  getWindowStateStoreKey,
  type WindowState,
} from "./window-state.ts";

const baseState: WindowState = {
  filePath: "E:\\notes\\guide.md",
  scrollTop: 400,
  scrollRatio: 0.5,
  activeHeadingId: "chapter-two",
  activeHeadingOffset: 18,
  fileModifiedAt: "2026-06-30T01:00:00.000Z",
  fileSize: 1000,
  updatedAt: "2026-06-30T01:01:00.000Z",
};

void test("window state store keys normalize Windows paths for one file identity", () => {
  const key = getWindowStateStoreKey("E:\\Notes\\Guide.md");

  if (process.platform === "win32") {
    assert.equal(key, "e:\\notes\\guide.md");
  } else {
    assert.equal(key, "E:\\Notes\\Guide.md");
  }
});

void test("restore target prefers active heading then ratio then scrollTop then top", () => {
  assert.deepEqual(
    getRestoreTarget({
      state: baseState,
      availableHeadingIds: new Set(["chapter-two"]),
      currentFileModifiedAt: baseState.fileModifiedAt,
      currentFileSize: baseState.fileSize,
    }),
    { kind: "heading", id: "chapter-two", offset: 18 },
  );

  assert.deepEqual(
    getRestoreTarget({
      state: { ...baseState, activeHeadingId: "missing" },
      availableHeadingIds: new Set(["chapter-two"]),
      currentFileModifiedAt: baseState.fileModifiedAt,
      currentFileSize: baseState.fileSize,
    }),
    { kind: "ratio", ratio: 0.5 },
  );

  assert.deepEqual(
    getRestoreTarget({
      state: {
        ...baseState,
        activeHeadingId: undefined,
        scrollRatio: undefined,
      },
      availableHeadingIds: new Set(),
      currentFileModifiedAt: baseState.fileModifiedAt,
      currentFileSize: baseState.fileSize,
    }),
    { kind: "scrollTop", scrollTop: 400 },
  );
});

void test("restore target falls back to the top when file size changed significantly", () => {
  assert.deepEqual(
    getRestoreTarget({
      state: baseState,
      availableHeadingIds: new Set(["chapter-two"]),
      currentFileModifiedAt: "2026-06-30T02:00:00.000Z",
      currentFileSize: 1500,
    }),
    { kind: "top" },
  );
});
