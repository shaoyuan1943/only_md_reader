export type RecentFile = {
  path: string;
  fileName: string;
  openedAt: number;
  exists: boolean;
};

export type RecentFileViewModel = {
  id: string;
  titleLine: string;
  pathLine: string;
  statusLabel: string | null;
  isMissing: boolean;
};

const MARKDOWN_EXTENSION_PATTERN = /\.(md|markdown)$/i;
export const VISIBLE_RECENT_FILE_LIMIT = 3;

export function isMarkdownFilePath(path: string): boolean {
  return MARKDOWN_EXTENSION_PATTERN.test(path);
}

export function getFirstMarkdownDropPath(paths: readonly string[]): string | null {
  return paths.find((path) => isMarkdownFilePath(path)) ?? null;
}

export function sortRecentFiles(files: readonly RecentFile[]): RecentFile[] {
  return [...files].sort((left, right) => right.openedAt - left.openedAt);
}

export function createRecentFileViewModels(
  files: readonly RecentFile[],
): RecentFileViewModel[] {
  return sortRecentFiles(files.filter((file) => file.exists))
    .slice(0, VISIBLE_RECENT_FILE_LIMIT)
    .map((file) => ({
      id: file.path,
      titleLine: file.fileName,
      pathLine: normalizeDisplayPath(file.path),
      statusLabel: file.exists ? null : "文件不存在",
      isMissing: !file.exists,
    }));
}

function normalizeDisplayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}
