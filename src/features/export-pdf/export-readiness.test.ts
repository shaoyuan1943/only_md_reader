import assert from "node:assert/strict";
import test from "node:test";
import { waitForPdfExportReadiness } from "./export-readiness.ts";

type FakeImageOptions = {
  complete?: boolean;
  loadState?: "failed";
};

type FakeImage = {
  complete: boolean;
  naturalWidth: number;
  dataset: { loadState?: string };
  addEventListener(type: "error" | "load", listener: () => void): void;
  dispatch(type: "error" | "load"): void;
  listenerCount(): number;
  removeEventListener(type: "error" | "load", listener: () => void): void;
};

void test("waits for document fonts, unfinished markdown images, and two layout frames", async () => {
  const image = createFakeImage({ complete: false });
  const frameScheduler = createQueuedFrameScheduler();
  const readiness = waitForPdfExportReadiness({
    document: createFakeDocument(),
    root: createFakeRoot([image]),
    requestAnimationFrame: (callback) => frameScheduler.requestAnimationFrame(callback),
    timeoutMs: 100,
  });

  image.dispatch("load");
  await frameScheduler.flushWhenQueued();
  await frameScheduler.flushWhenQueued();

  assert.deepEqual(await readiness, { kind: "ready" });
});

void test("allows a markdown image that has already entered the failed placeholder state", async () => {
  const frameScheduler = createQueuedFrameScheduler();
  const readiness = waitForPdfExportReadiness({
    document: createFakeDocument(),
    root: createFakeRoot([createFakeImage({ complete: true, loadState: "failed" })]),
    requestAnimationFrame: (callback) => frameScheduler.requestAnimationFrame(callback),
    timeoutMs: 100,
  });

  await frameScheduler.flushWhenQueued();
  await frameScheduler.flushWhenQueued();

  assert.deepEqual(await readiness, { kind: "ready" });
});

void test("returns a timeout and removes image listeners when an image never settles", async () => {
  const image = createFakeImage({ complete: false });
  const readiness = await waitForPdfExportReadiness({
    document: createFakeDocument(),
    root: createFakeRoot([image]),
    requestAnimationFrame: () => 0,
    timeoutMs: 0,
  });

  assert.deepEqual(readiness, { kind: "timeout" });
  assert.equal(image.listenerCount(), 0);
});

function createFakeDocument() {
  return {
    fonts: {
      ready: Promise.resolve(),
    },
  } as unknown as Document;
}

function createFakeRoot(images: FakeImage[]): ParentNode {
  return {
    querySelectorAll(selector: string) {
      assert.equal(selector, "img.markdown-image");
      return images;
    },
  } as unknown as ParentNode;
}

function createFakeImage({ complete = true, loadState }: FakeImageOptions): FakeImage {
  const listeners = new Map<"error" | "load", Set<() => void>>();

  return {
    complete,
    naturalWidth: complete && loadState !== "failed" ? 1 : 0,
    dataset: loadState ? { loadState } : {},
    addEventListener(type, listener) {
      const typedListeners = listeners.get(type) ?? new Set<() => void>();
      typedListeners.add(listener);
      listeners.set(type, typedListeners);
    },
    dispatch(type) {
      if (type === "load") {
        this.complete = true;
        this.naturalWidth = 1;
      }
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
    listenerCount() {
      return Array.from(listeners.values()).reduce((count, set) => count + set.size, 0);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
}

function createQueuedFrameScheduler() {
  const callbacks: Array<FrameRequestCallback> = [];

  return {
    requestAnimationFrame(callback: FrameRequestCallback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    async flushWhenQueued() {
      while (callbacks.length === 0) {
        await Promise.resolve();
      }
      callbacks.shift()?.(0);
    },
  };
}
