import assert from "node:assert/strict";
import test from "node:test";
import {
  addMarkdownImageFailureKey,
  applyMarkdownImageFailureStates,
  getMarkdownImageFailureKey,
  markMarkdownImageFailed,
} from "./reader-image-state.ts";

void test("markdown image failure state uses a stable local source key", () => {
  const image = createFakeImage({
    alt: "missing image",
    dataset: {
      localSrc: "E:\\notes\\assets\\missing.png",
      sourceSrc: "./assets/missing.png",
    },
    src: "http://127.0.0.1:4188/assets/missing.png",
  });

  assert.equal(getMarkdownImageFailureKey(image), "E:\\notes\\assets\\missing.png");

  const key = markMarkdownImageFailed(image);

  assert.equal(key, "E:\\notes\\assets\\missing.png");
  assert.equal(image.dataset.loadState, "failed");
  assert.equal(image.alt, "missing image（加载失败）");
  assert.deepEqual(image.classList.added, ["markdown-image-fallback"]);
});

void test("markdown image failure state can be reapplied after React redraws markdown html", () => {
  const failedKey = "E:\\notes\\assets\\missing.png";
  const redrawnImage = createFakeImage({
    alt: "missing image",
    dataset: {
      localSrc: failedKey,
      sourceSrc: "./assets/missing.png",
    },
    src: "http://127.0.0.1:4188/assets/missing.png",
  });
  const root = createFakeImageRoot([redrawnImage]);

  applyMarkdownImageFailureStates(root, new Set([failedKey]));

  assert.equal(redrawnImage.dataset.loadState, "failed");
  assert.equal(redrawnImage.alt, "missing image（加载失败）");
  assert.deepEqual(redrawnImage.classList.added, ["markdown-image-fallback"]);
});

void test("markdown image failure state is idempotent when reapplied repeatedly", () => {
  const image = createFakeImage({
    alt: "missing image",
    dataset: {
      localSrc: "E:\\notes\\assets\\missing.png",
      sourceSrc: "./assets/missing.png",
    },
    src: "http://127.0.0.1:4188/assets/missing.png",
  });

  markMarkdownImageFailed(image);
  markMarkdownImageFailed(image);

  assert.equal(image.alt, "missing image（加载失败）");
});

void test("markdown image failure state falls back to currentSrc for asset protocol images", () => {
  const image = createFakeImage({
    alt: "asset image",
    dataset: {},
    currentSrc: "asset://localhost/E:/notes/assets/missing.png",
    src: "file:///E:/notes/assets/missing.png",
  });

  const key = markMarkdownImageFailed(image);

  assert.equal(key, "asset://localhost/E:/notes/assets/missing.png");
  assert.equal(image.dataset.loadState, "failed");
  assert.equal(image.alt, "asset image（加载失败）");
});

void test("markdown image failure state uses a readable default label when alt is empty", () => {
  const image = createFakeImage({
    alt: "",
    dataset: {
      localSrc: "E:\\notes\\assets\\missing.png",
    },
    src: "asset://localhost/E:/notes/assets/missing.png",
  });

  markMarkdownImageFailed(image);

  assert.equal(image.alt, "图片（加载失败）");
  assert.deepEqual(image.classList.added, ["markdown-image-fallback"]);
});

void test("markdown image failure state only applies to matching failed image keys", () => {
  const failedImage = createFakeImage({
    alt: "failed",
    dataset: {
      localSrc: "E:\\notes\\assets\\failed.png",
    },
    src: "asset://localhost/E:/notes/assets/failed.png",
  });
  const okImage = createFakeImage({
    alt: "ok",
    dataset: {
      localSrc: "E:\\notes\\assets\\ok.png",
    },
    src: "asset://localhost/E:/notes/assets/ok.png",
  });
  const root = createFakeImageRoot([failedImage, okImage]);

  applyMarkdownImageFailureStates(root, new Set(["E:\\notes\\assets\\failed.png"]));

  assert.equal(failedImage.dataset.loadState, "failed");
  assert.equal(okImage.dataset.loadState, undefined);
  assert.equal(okImage.alt, "ok");
  assert.deepEqual(okImage.classList.added, []);
});

void test("duplicate markdown image failure keys reuse the current set", () => {
  const current = new Set(["E:\\notes\\assets\\missing.png"]);

  const next = addMarkdownImageFailureKey(current, "E:\\notes\\assets\\missing.png");

  assert.equal(next, current);
});

void test("new markdown image failure keys create an updated set", () => {
  const current = new Set(["E:\\notes\\assets\\missing-a.png"]);

  const next = addMarkdownImageFailureKey(current, "E:\\notes\\assets\\missing-b.png");

  assert.notEqual(next, current);
  assert.deepEqual(Array.from(next), [
    "E:\\notes\\assets\\missing-a.png",
    "E:\\notes\\assets\\missing-b.png",
  ]);
});

type FakeImage = {
  alt: string;
  currentSrc: string;
  dataset: Record<string, string>;
  src: string;
  classList: {
    added: string[];
    add(className: string): void;
  };
};

function createFakeImage({
  alt,
  currentSrc,
  dataset,
  src,
}: {
  alt: string;
  currentSrc?: string;
  dataset: Record<string, string>;
  src: string;
}): FakeImage {
  return {
    alt,
    currentSrc: currentSrc ?? src,
    dataset: { ...dataset },
    src,
    classList: {
      added: [],
      add(className: string) {
        this.added.push(className);
      },
    },
  };
}

function createFakeImageRoot(images: FakeImage[]): ParentNode {
  return {
    querySelectorAll(selector: string) {
      assert.equal(selector, "img.markdown-image");
      return images;
    },
  } as unknown as ParentNode;
}
