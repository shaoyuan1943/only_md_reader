import assert from "node:assert/strict";
import test from "node:test";
import {
  createMarkdownDialogOptions,
  normalizeDialogSelection,
} from "./open-file-dialog.ts";

void test("dialog options only allow one markdown file", () => {
  assert.deepEqual(createMarkdownDialogOptions(), {
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown"],
      },
    ],
  });
});

void test("dialog cancellation returns null without error state", () => {
  assert.equal(normalizeDialogSelection(null), null);
});

void test("dialog selection returns the selected path", () => {
  assert.equal(
    normalizeDialogSelection("E:\\notes\\产品说明.md"),
    "E:\\notes\\产品说明.md",
  );
});

void test("unexpected multi-selection is reduced to the first path", () => {
  assert.equal(
    normalizeDialogSelection(["E:\\notes\\first.md", "E:\\notes\\second.md"]),
    "E:\\notes\\first.md",
  );
});
