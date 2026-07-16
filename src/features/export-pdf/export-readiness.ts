export const PDF_EXPORT_RESOURCE_TIMEOUT_MS = 10_000;

export type PdfExportReadiness = { kind: "ready" } | { kind: "timeout" };

type PdfExportReadinessOptions = {
  document: Document;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  root: ParentNode;
  timeoutMs?: number;
};

type ReadinessTask = {
  cleanup(this: void): void;
  promise: Promise<void>;
};

export async function waitForPdfExportReadiness({
  document,
  requestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis),
  root,
  timeoutMs = PDF_EXPORT_RESOURCE_TIMEOUT_MS,
}: PdfExportReadinessOptions): Promise<PdfExportReadiness> {
  const imageTasks = Array.from(
    root.querySelectorAll<HTMLImageElement>("img.markdown-image"),
  ).map(createImageReadinessTask);
  const tasks = [createFontReadinessTask(document), ...imageTasks];
  const settled = Promise.all(tasks.map((task) => task.promise)).then(async () => {
    await waitForAnimationFrame(requestAnimationFrame);
    await waitForAnimationFrame(requestAnimationFrame);
  });
  const timeout = createTimeoutTask(timeoutMs);

  try {
    const result = await Promise.race([
      settled.then(() => ({ kind: "ready" }) as const),
      timeout.promise.then(() => ({ kind: "timeout" }) as const),
    ]);

    return result;
  } finally {
    timeout.cleanup();
    for (const task of tasks) {
      task.cleanup();
    }
  }
}

function createFontReadinessTask(document: Document): ReadinessTask {
  return {
    cleanup() {},
    promise:
      document.fonts?.ready.then(
        () => undefined,
        () => undefined,
      ) ?? Promise.resolve(),
  };
}

function createImageReadinessTask(image: HTMLImageElement): ReadinessTask {
  if (image.dataset.loadState === "failed" || isLoadedImage(image)) {
    return {
      cleanup() {},
      promise: Promise.resolve(),
    };
  }

  let handleError: (() => void) | null = null;
  let handleLoad: (() => void) | null = null;

  const promise = new Promise<void>((resolve) => {
    const settle = () => {
      resolve();
    };

    handleError = settle;
    handleLoad = settle;
    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });

  return {
    cleanup() {
      if (handleLoad) {
        image.removeEventListener("load", handleLoad);
      }
      if (handleError) {
        image.removeEventListener("error", handleError);
      }
      handleLoad = null;
      handleError = null;
    },
    promise,
  };
}

function createTimeoutTask(timeoutMs: number): ReadinessTask {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  return {
    cleanup() {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    promise: new Promise<void>((resolve) => {
      timeoutId = globalThis.setTimeout(resolve, Math.max(0, timeoutMs));
    }),
  };
}

function isLoadedImage(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

function waitForAnimationFrame(
  requestAnimationFrame: (callback: FrameRequestCallback) => number,
): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
