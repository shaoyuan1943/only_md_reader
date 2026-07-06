import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecentFileViewModels,
  getFirstMarkdownDropPath,
  isMarkdownFilePath,
  sortRecentFiles,
} from "./recent-files.ts";

void test("markdown path detection accepts md and markdown case-insensitively", () => {
  assert.equal(isMarkdownFilePath("E:\\notes\\readme.md"), true);
  assert.equal(isMarkdownFilePath("E:\\notes\\README.MARKDOWN"), true);
  assert.equal(isMarkdownFilePath("E:\\notes\\readme.txt"), false);
});

void test("drop path extraction accepts the first markdown file and ignores other items", () => {
  assert.equal(
    getFirstMarkdownDropPath([
      "E:\\notes\\readme.txt",
      "E:\\notes\\product-plan.MARKDOWN",
      "E:\\notes\\later.md",
    ]),
    "E:\\notes\\product-plan.MARKDOWN",
  );
});

void test("drop path extraction rejects drops without markdown files", () => {
  assert.equal(getFirstMarkdownDropPath(["E:\\notes\\readme.txt"]), null);
  assert.equal(getFirstMarkdownDropPath([]), null);
});

void test("recent files are sorted with the latest open first", () => {
  const sorted = sortRecentFiles([
    {
      path: "E:\\notes\\old.md",
      fileName: "old.md",
      openedAt: 10,
      exists: true,
    },
    {
      path: "E:\\notes\\new.md",
      fileName: "new.md",
      openedAt: 30,
      exists: true,
    },
  ]);

  assert.deepEqual(
    sorted.map((file) => file.fileName),
    ["new.md", "old.md"],
  );
});

void test("recent file view model exposes only the three latest files for the fixed open window", () => {
  const items = createRecentFileViewModels([
    {
      path: "E:\\notes\\oldest.md",
      fileName: "oldest.md",
      openedAt: 10,
      exists: true,
    },
    {
      path: "E:\\notes\\newest.md",
      fileName: "newest.md",
      openedAt: 40,
      exists: true,
    },
    {
      path: "E:\\notes\\third.md",
      fileName: "third.md",
      openedAt: 20,
      exists: true,
    },
    {
      path: "E:\\notes\\second.md",
      fileName: "second.md",
      openedAt: 30,
      exists: true,
    },
  ]);

  assert.deepEqual(
    items.map((item) => item.titleLine),
    ["newest.md", "second.md", "third.md"],
  );
});

void test("recent file view model keeps file name and path as two display lines", () => {
  const items = createRecentFileViewModels([
    {
      path: "E:\\Documents\\notes\\产品需求说明.md",
      fileName: "产品需求说明.md",
      openedAt: 30,
      exists: true,
    },
  ]);

  assert.deepEqual(items, [
    {
      id: "E:\\Documents\\notes\\产品需求说明.md",
      titleLine: "产品需求说明.md",
      pathLine: "E:\\Documents\\notes\\产品需求说明.md",
      statusLabel: null,
      isMissing: false,
    },
  ]);
});

void test("recent file view model displays Windows extended-length paths as normal local paths", () => {
  const items = createRecentFileViewModels([
    {
      path: "\\\\?\\E:\\only_md_reader\\docs\\implementation-worklist.md",
      fileName: "implementation-worklist.md",
      openedAt: 30,
      exists: true,
    },
  ]);

  assert.deepEqual(items, [
    {
      id: "\\\\?\\E:\\only_md_reader\\docs\\implementation-worklist.md",
      titleLine: "implementation-worklist.md",
      pathLine: "E:\\only_md_reader\\docs\\implementation-worklist.md",
      statusLabel: null,
      isMissing: false,
    },
  ]);
});

void test("missing recent files expose a clear missing status", () => {
  const [item] = createRecentFileViewModels([
    {
      path: "E:\\Documents\\notes\\missing.md",
      fileName: "missing.md",
      openedAt: 30,
      exists: false,
    },
  ]);

  assert.equal(item?.statusLabel, "文件不存在");
  assert.equal(item?.isMissing, true);
});
