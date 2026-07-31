import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenedMarkdownFile } from "../open-file/open-file-api.ts";
import {
  createReaderFileRequestGate,
  type ReaderFileStatus,
} from "./reader-file-sync.ts";
import {
  createReaderFileSyncApi,
  type ReaderFileSyncApi,
} from "./reader-file-sync-api.ts";

type UseReaderFileSyncOptions = {
  api?: ReaderFileSyncApi;
  file: OpenedMarkdownFile;
  onBeforeFileChange(this: void): void;
  onFileChange(this: void, file: OpenedMarkdownFile): void;
};

export function useReaderFileSync({
  api = createReaderFileSyncApi(),
  file,
  onBeforeFileChange,
  onFileChange,
}: UseReaderFileSyncOptions) {
  const [status, setStatus] = useState<ReaderFileStatus>("available");
  const [retryFailedAfterMissing, setRetryFailedAfterMissing] = useState(false);
  const fileRef = useRef(file);
  const gateRef = useRef(createReaderFileRequestGate());

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  const applyFile = useCallback(
    (nextFile: OpenedMarkdownFile) => {
      onBeforeFileChange();
      onFileChange(nextFile);
      setRetryFailedAfterMissing(false);
      setStatus("available");
    },
    [onBeforeFileChange, onFileChange],
  );

  const retry = useCallback(async () => {
    const requestId = gateRef.current.begin();
    const retryingMissingFile = status === "missing";
    try {
      const nextFile = await api.readCurrentFile();
      if (!gateRef.current.isCurrent(requestId)) {
        return;
      }
      applyFile(nextFile);
    } catch {
      if (gateRef.current.isCurrent(requestId)) {
        setStatus("unreadable");
        setRetryFailedAfterMissing(retryingMissingFile);
      }
    }
  }, [api, applyFile, status]);

  const relocate = useCallback(async () => {
    const path = await api.chooseMarkdownFile();
    if (!path) {
      return;
    }
    try {
      const result = await api.rebindCurrentFile(path);
      if (result.kind === "existingWindow") {
        await api.closeCurrentWindow();
        return;
      }
      applyFile(result.file);
    } catch {
      setStatus("unreadable");
    }
  }, [api, applyFile]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void api
      .listen((event) => {
        if (disposed || event.path !== fileRef.current.path) {
          return;
        }
        if (event.status === "missing") {
          setStatus("missing");
          setRetryFailedAfterMissing(false);
        } else if (event.status === "unreadable") {
          setStatus("unreadable");
          setRetryFailedAfterMissing(false);
        } else {
          void retry();
        }
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [api, retry]);

  return {
    relocate,
    retry,
    retryFailedAfterMissing,
    status,
    close: () => api.closeCurrentWindow(),
  };
}
