import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSettingsApi } from "../settings/settings-api.ts";
import type { OpenFileApi, OpenedReaderWindow } from "./open-file-api.ts";
import { tauriOpenFileApi } from "./open-file-api.ts";
import { getVisibleOpenFileStatusMessage } from "./open-file-status.ts";
import {
  createRecentFileViewModels,
  getFirstMarkdownDropPath,
  type RecentFile,
} from "./recent-files.ts";

type OpenFileWindowProps = {
  api?: OpenFileApi;
  onFileOpened?(this: void, file: OpenedReaderWindow): void;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; file: OpenedReaderWindow };

type OpenPathOptions = {
  showLoading: boolean;
};

export function OpenFileWindow({
  api = tauriOpenFileApi,
  onFileOpened: handleFileOpened,
}: OpenFileWindowProps) {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "idle",
  });
  const settingsApi = useMemo(() => createSettingsApi(), []);

  const recentItems = useMemo(
    () => createRecentFileViewModels(recentFiles),
    [recentFiles],
  );

  useEffect(() => {
    void refreshRecentFiles(api, setRecentFiles, setLoadState);
  }, [api]);

  const openPath = useCallback(
    async (path: string, options: OpenPathOptions = { showLoading: true }) => {
      if (options.showLoading) {
        setLoadState({ status: "loading" });
      }

      try {
        const file = await api.openMarkdownFile(path);
        if (options.showLoading || handleFileOpened) {
          setLoadState({
            status: "ready",
            file,
          });
        }
        handleFileOpened?.(file);
      } catch (error) {
        setLoadState({ status: "error", message: getErrorMessage(error) });
        try {
          setRecentFiles(await api.listRecentFiles());
        } catch {
          // Keep the original open failure visible.
        }
      }
    },
    [api, handleFileOpened],
  );

  useEffect(() => {
    const runtimeWindow = globalThis as typeof globalThis & {
      __TAURI_INTERNALS__?: unknown;
    };

    if (!runtimeWindow.__TAURI_INTERNALS__) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") {
          return;
        }

        const path = getFirstMarkdownDropPath(event.payload.paths);

        if (path === null) {
          setLoadState({
            status: "error",
            message: "请拖入 .md 或 .markdown 文件。",
          });
          return;
        }

        void openPath(path);
      })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch((error: unknown) => {
        setLoadState({ status: "error", message: getErrorMessage(error) });
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openPath]);

  async function handleChooseFile() {
    setLoadState({ status: "loading" });

    try {
      const path = await api.chooseMarkdownFile();

      if (path === null) {
        setLoadState({ status: "idle" });
        return;
      }

      await openPath(path);
    } catch (error) {
      setLoadState({ status: "error", message: getErrorMessage(error) });
    }
  }

  async function handleOpenSettings() {
    try {
      await settingsApi.openSettingsWindow();
    } catch (error) {
      setLoadState({ status: "error", message: getErrorMessage(error) });
    }
  }

  return (
    <main className="app-shell" aria-label="MD极简阅读打开文件窗口">
      <section className="open-file-window" aria-labelledby="open-file-title">
        <button
          className="open-file-settings-button"
          type="button"
          aria-label="设置"
          title="设置"
          onClick={() => void handleOpenSettings()}
        >
          <SettingsIcon />
        </button>

        <div className="open-file-center">
          <div className="open-file-mark" aria-hidden="true">
            <OpenFileMarkIcon />
          </div>

          <h1 id="open-file-title">打开 Markdown 文件</h1>

          <button
            className="primary-open-button"
            type="button"
            onClick={() => void handleChooseFile()}
            disabled={loadState.status === "loading"}
          >
            <span>打开 Markdown 文件</span>
          </button>

          <StatusMessage state={loadState} />

          <section className="recent-block" aria-labelledby="recent-files-title">
            <h2 id="recent-files-title">最近使用</h2>
            {recentItems.length > 0 ? (
              <div className="recent-list">
                {recentItems.map((item) => (
                  <button
                    className="recent-item"
                    data-missing={item.isMissing}
                    key={item.id}
                    type="button"
                    onClick={() => void openPath(item.id, { showLoading: false })}
                  >
                    <span className="recent-file-name">{item.titleLine}</span>
                    <span className="recent-file-path">{item.pathLine}</span>
                    {item.statusLabel ? (
                      <span className="recent-file-status">{item.statusLabel}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-recent">还没有最近打开的 Markdown 文件。</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

async function refreshRecentFiles(
  api: OpenFileApi,
  setRecentFiles: (files: RecentFile[]) => void,
  setLoadState: (state: LoadState) => void,
) {
  try {
    setRecentFiles(await api.listRecentFiles());
  } catch (error) {
    setLoadState({ status: "error", message: getErrorMessage(error) });
  }
}

function StatusMessage({ state }: { state: LoadState }) {
  const message = getVisibleOpenFileStatusMessage(state);

  if (message === null) {
    return null;
  }

  return (
    <p className="open-status" data-status={state.status}>
      {message}
    </p>
  );
}

function OpenFileMarkIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M781.2 63.9H243.6c-65.9 0-119.5 53.4-119.5 119.5v657c0 65.9 53.4 119.5 119.5 119.5h537.6c66 0 119.5-53.4 119.5-119.5v-657c-0.1-66-53.5-119.5-119.5-119.5z m59.7 776.5c0 33-26.7 59.7-59.7 59.7H243.6c-33 0-59.7-26.7-59.7-59.7v-657c0-33 26.7-59.7 59.7-59.7h537.6c33 0 59.7 26.7 59.7 59.7v657z m0 0"
        fill="currentColor"
      />
      <path
        d="M721.8 721H303.7c-16.4 0-29.9 13.4-29.9 29.9 0 16.4 13.4 29.9 29.9 29.9h418.1c16.4 0 29.9-13.4 29.9-29.9 0-16.6-13.5-29.9-29.9-29.9z m0-149.3H303.7c-16.4 0-29.9 13.4-29.9 29.9 0 16.4 13.4 29.9 29.9 29.9h418.1c16.4 0 29.9-13.4 29.9-29.9 0-16.6-13.5-29.9-29.9-29.9z m0 0"
        fill="currentColor"
      />
      <path
        d="M596.8 482.3V337.5c0-13.3 0.7-30.1 2-50.4h-1.3c-3 15.3-5.6 25.6-7.4 30.7l-58.9 164.5h-40.5l-59.6-163c-1.4-3.8-4-14.6-7.6-32.2h-1.4c1.3 20.1 2 40.1 2 60.2v135h-46V243.6h74l51.4 144.2c4.3 11.9 7.2 23.1 8.8 33.6h1c3.1-13.1 6.4-24.4 9.9-33.9l51.6-144h72v238.7h-50.1v0.1z m0 0"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm7.4-3.5a7.8 7.8 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a8.2 8.2 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a8.2 8.2 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a8.2 8.2 0 0 0 2 1.2l.4 2.6h5l.4-2.6a8.2 8.2 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "打开文件失败。";
}
