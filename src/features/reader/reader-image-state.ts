export type MarkdownImageLike = {
  alt: string;
  currentSrc?: string;
  dataset: DOMStringMap | Record<string, string | undefined>;
  src?: string;
  classList: Pick<DOMTokenList, "add">;
};

export function getMarkdownImageFailureKey(image: MarkdownImageLike): string {
  return (
    image.dataset.localSrc ??
    image.dataset.sourceSrc ??
    image.currentSrc ??
    image.src ??
    ""
  );
}

export function markMarkdownImageFailed(image: MarkdownImageLike): string {
  const key = getMarkdownImageFailureKey(image);
  const fallbackSuffix = "（加载失败）";

  image.dataset.loadState = "failed";
  image.classList.add("markdown-image-fallback");
  image.alt = image.alt.endsWith(fallbackSuffix)
    ? image.alt
    : `${image.alt || "图片"}${fallbackSuffix}`;

  return key;
}

export function addMarkdownImageFailureKey(
  current: Set<string>,
  key: string,
): Set<string> {
  if (!key || current.has(key)) {
    return current;
  }

  return new Set(current).add(key);
}

export function applyMarkdownImageFailureStates(
  root: ParentNode,
  failedImageKeys: ReadonlySet<string>,
): void {
  for (const image of root.querySelectorAll<HTMLImageElement>("img.markdown-image")) {
    const key = getMarkdownImageFailureKey(image);

    if (key && failedImageKeys.has(key)) {
      markMarkdownImageFailed(image);
    }
  }
}
