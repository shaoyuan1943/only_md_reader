import assert from "node:assert/strict";
import test from "node:test";
import { createReaderPreviewViewModel } from "./reader-preview.ts";

void test("reader preview exposes the full path and raw markdown content", () => {
  const preview = createReaderPreviewViewModel({
    path: "E:\\notes\\readme.md",
    fileName: "readme.md",
    content: "# Title\n\nBody",
    openedAt: 10,
    fileSize: 12,
  });

  assert.deepEqual(preview, {
    title: "readme.md",
    pathLine: "E:\\notes\\readme.md",
    content: "# Title\n\nBody",
    openedAtLabel: "已打开",
    contentLineCount: 3,
    outlinePlaceholder: "暂无大纲",
    outlineItems: [
      {
        id: "title",
        isCurrent: true,
        label: "Title",
        level: 1,
      },
    ],
    settingsLabel: "设置",
  });
});

void test("reader preview does not synthesize a document title when markdown has no h1", () => {
  const preview = createReaderPreviewViewModel({
    path: "E:\\notes\\readme.md",
    fileName: "readme.md",
    content: "Body only\n\nNo heading here.",
    openedAt: 10,
    fileSize: 27,
  });

  assert.equal("documentTitle" in preview, false);
  assert.equal(preview.pathLine, "E:\\notes\\readme.md");
  assert.equal(preview.contentLineCount, 3);
  assert.equal(preview.outlineItems.length, 0);
  assert.equal(preview.outlinePlaceholder, "暂无大纲");
  assert.equal(preview.settingsLabel, "设置");
});

void test("reader preview displays Windows extended-length paths as normal local paths", () => {
  const preview = createReaderPreviewViewModel({
    path: "\\\\?\\E:\\notes\\readme.md",
    fileName: "readme.md",
    content: "# Title",
    openedAt: 10,
    fileSize: 7,
  });

  assert.equal(preview.pathLine, "E:\\notes\\readme.md");
});

void test("reader preview derives a provisional outline from source headings", () => {
  const preview = createReaderPreviewViewModel({
    path: "E:\\notes\\readme.md",
    fileName: "readme.md",
    content: "# Project Notes\n\n## Architecture\n\n### Runtime\n\n## Architecture",
    openedAt: 10,
    fileSize: 62,
  });

  assert.equal("documentTitle" in preview, false);
  assert.deepEqual(preview.outlineItems, [
    {
      id: "project-notes",
      isCurrent: true,
      label: "Project Notes",
      level: 1,
    },
    {
      id: "architecture",
      isCurrent: false,
      label: "Architecture",
      level: 2,
    },
    {
      id: "runtime",
      isCurrent: false,
      label: "Runtime",
      level: 3,
    },
    {
      id: "architecture-2",
      isCurrent: false,
      label: "Architecture",
      level: 2,
    },
  ]);
});
