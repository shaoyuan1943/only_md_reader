import type { ReaderFileStatus } from "./reader-file-sync.ts";
import { getReaderFileStatusBanner } from "./reader-file-status.ts";

type ReaderFileStatusBannerProps = {
  retryFailedAfterMissing: boolean;
  status: ReaderFileStatus;
  onClose(this: void): void;
  onRelocate(this: void): void;
  onRetry(this: void): void;
};

export function ReaderFileStatusBanner({
  retryFailedAfterMissing,
  status,
  onClose,
  onRelocate,
  onRetry,
}: ReaderFileStatusBannerProps) {
  const banner = getReaderFileStatusBanner(status, retryFailedAfterMissing);

  if (!banner) {
    return null;
  }

  return (
    <section
      className="reader-file-status-banner"
      data-tone={banner.tone}
      role={banner.tone === "warning" ? "alert" : "status"}
    >
      <p>{banner.message}</p>
      {banner.primaryAction || banner.secondaryAction ? (
        <div className="reader-file-status-banner-actions">
          {banner.primaryAction ? (
            <button
              className="reader-file-status-banner-primary"
              type="button"
              onClick={banner.primaryAction === "重新定位文件" ? onRelocate : onRetry}
            >
              {banner.primaryAction}
            </button>
          ) : null}
          {banner.secondaryAction ? (
            <button
              className="reader-file-status-banner-secondary"
              type="button"
              onClick={banner.secondaryAction === "关闭" ? onClose : onRetry}
            >
              {banner.secondaryAction}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
