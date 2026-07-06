export type WindowState = {
  filePath: string;
  scrollTop?: number;
  scrollRatio?: number;
  activeHeadingId?: string;
  activeHeadingOffset?: number;
  fileModifiedAt?: string;
  fileSize?: number;
  updatedAt: string;
};

export type WindowStateStore = {
  schemaVersion: 1;
  files: Record<string, WindowState>;
};

export type RestoreTarget =
  | { kind: "heading"; id: string; offset: number }
  | { kind: "ratio"; ratio: number }
  | { kind: "scrollTop"; scrollTop: number }
  | { kind: "top" };

export type RestoreTargetOptions = {
  state: WindowState | null;
  availableHeadingIds: Set<string>;
  currentFileSize?: number;
  currentFileModifiedAt?: string;
};

const FILE_SIZE_CHANGE_THRESHOLD = 0.2;

export function getWindowStateStoreKey(filePath: string): string {
  return process.platform === "win32" ? filePath.toLowerCase() : filePath;
}

export function getRestoreTarget({
  state,
  availableHeadingIds,
  currentFileModifiedAt,
  currentFileSize,
}: RestoreTargetOptions): RestoreTarget {
  if (!state) {
    return { kind: "top" };
  }

  if (
    hasSignificantFileChange({
      currentFileModifiedAt,
      currentFileSize,
      previousFileModifiedAt: state.fileModifiedAt,
      previousFileSize: state.fileSize,
    })
  ) {
    return { kind: "top" };
  }

  if (state.activeHeadingId && availableHeadingIds.has(state.activeHeadingId)) {
    return {
      kind: "heading",
      id: state.activeHeadingId,
      offset: state.activeHeadingOffset ?? 0,
    };
  }

  if (typeof state.scrollRatio === "number" && state.scrollRatio >= 0) {
    return {
      kind: "ratio",
      ratio: Math.min(1, state.scrollRatio),
    };
  }

  if (typeof state.scrollTop === "number" && state.scrollTop >= 0) {
    return {
      kind: "scrollTop",
      scrollTop: state.scrollTop,
    };
  }

  return { kind: "top" };
}

function hasSignificantFileChange({
  currentFileModifiedAt,
  currentFileSize,
  previousFileModifiedAt,
  previousFileSize,
}: {
  currentFileModifiedAt?: string;
  currentFileSize?: number;
  previousFileModifiedAt?: string;
  previousFileSize?: number;
}): boolean {
  if (
    typeof currentFileSize !== "number" ||
    typeof previousFileSize !== "number" ||
    previousFileSize <= 0
  ) {
    return false;
  }

  const sizeDelta = Math.abs(currentFileSize - previousFileSize) / previousFileSize;
  if (sizeDelta >= FILE_SIZE_CHANGE_THRESHOLD) {
    return true;
  }

  return Boolean(
    currentFileModifiedAt &&
    previousFileModifiedAt &&
    currentFileModifiedAt !== previousFileModifiedAt &&
    sizeDelta >= 0.05,
  );
}
