import type { ReaderFileStatus } from "./reader-file-sync.ts";

export function getReaderFileStatusBanner(
  status: ReaderFileStatus,
  retryFailedAfterMissing = false,
) {
  if (status === "missing") {
    return {
      tone: "warning" as const,
      message: "❗ 文件已被删除或移动，当前显示的是最后一次读取的内容",
      primaryAction: "重新定位文件",
      secondaryAction: "重试",
    };
  }

  if (status === "unreadable") {
    return {
      tone: "warning" as const,
      message: "❗ 文件暂时无法读取，当前显示的是最后一次成功读取的内容",
      primaryAction: retryFailedAfterMissing ? null : "重试",
      secondaryAction: retryFailedAfterMissing ? null : "关闭",
    };
  }

  return null;
}
