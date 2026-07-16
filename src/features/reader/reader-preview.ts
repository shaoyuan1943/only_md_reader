import type { OpenedMarkdownFile } from "../open-file/open-file-api.ts";

export type ReaderPreviewOutlineItem = {
  id: string;
  isCurrent: boolean;
  label: string;
  level: number;
};

export type ReaderPreviewViewModel = {
  title: string;
  pathLine: string;
  content: string;
  openedAtLabel: string;
  contentLineCount: number;
  outlinePlaceholder: string;
  outlineItems: ReaderPreviewOutlineItem[];
  settingsLabel: string;
  pdfExportLabel: string;
};

export function createReaderPreviewViewModel(
  file: OpenedMarkdownFile,
): ReaderPreviewViewModel {
  const outlineItems = extractPreviewOutline(file.content);

  return {
    title: file.fileName,
    pathLine: normalizeDisplayPath(file.path),
    content: file.content,
    openedAtLabel: "已打开",
    contentLineCount: countLines(file.content),
    outlinePlaceholder: "暂无大纲",
    outlineItems,
    settingsLabel: "设置",
    pdfExportLabel: "导出为PDF文档",
  };
}

function normalizeDisplayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

function countLines(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length;
}

function extractPreviewOutline(content: string): ReaderPreviewOutlineItem[] {
  const slugCounts = new Map<string, number>();
  const items: ReaderPreviewOutlineItem[] = [];
  let isInFence = false;

  for (const line of content.split(/\r\n|\r|\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      isInFence = !isInFence;
      continue;
    }

    if (isInFence) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);

    if (!headingMatch) {
      continue;
    }

    const label = headingMatch[2]?.trim();

    if (!label) {
      continue;
    }

    items.push({
      id: createUniqueSlug(label, slugCounts),
      isCurrent: items.length === 0,
      label,
      level: headingMatch[1]?.length ?? 1,
    });
  }

  return items;
}

function createUniqueSlug(label: string, slugCounts: Map<string, number>): string {
  const baseSlug =
    label
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "heading";
  const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;

  slugCounts.set(baseSlug, nextCount);

  return nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
}
