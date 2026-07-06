import type { DialogFilter, OpenDialogOptions } from "@tauri-apps/plugin-dialog";

export const MARKDOWN_FILE_EXTENSIONS = ["md", "markdown"] as const;

export function createMarkdownDialogOptions(): OpenDialogOptions {
  return {
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Markdown",
        extensions: [...MARKDOWN_FILE_EXTENSIONS],
      } satisfies DialogFilter,
    ],
  };
}

export function normalizeDialogSelection(
  selection: string | string[] | null,
): string | null {
  if (Array.isArray(selection)) {
    return selection[0] ?? null;
  }

  return selection;
}
