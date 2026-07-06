export type ScrollChromeMetricsInput = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  trackHeight: number;
  minThumbHeight?: number;
};

export type ScrollChromeMetrics = {
  canScroll: boolean;
  maxScrollTop: number;
  maxThumbTop: number;
  thumbHeight: number;
  thumbTop: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function calculateScrollChromeMetrics({
  clientHeight,
  scrollHeight,
  scrollTop,
  trackHeight,
  minThumbHeight = 40,
}: ScrollChromeMetricsInput): ScrollChromeMetrics {
  const safeClientHeight = Math.max(0, clientHeight);
  const safeScrollHeight = Math.max(0, scrollHeight);
  const safeTrackHeight = Math.max(0, trackHeight);
  const maxScrollTop = Math.max(0, safeScrollHeight - safeClientHeight);
  const canScroll = maxScrollTop > 0 && safeTrackHeight > 0;

  if (!canScroll) {
    return {
      canScroll: false,
      maxScrollTop: 0,
      maxThumbTop: 0,
      thumbHeight: safeTrackHeight,
      thumbTop: 0,
    };
  }

  const rawThumbHeight = (safeClientHeight / safeScrollHeight) * safeTrackHeight;
  const thumbHeight = Math.min(
    safeTrackHeight,
    Math.max(minThumbHeight, Math.round(rawThumbHeight)),
  );
  const maxThumbTop = Math.max(0, safeTrackHeight - thumbHeight);
  const safeScrollTop = clamp(scrollTop, 0, maxScrollTop);
  const thumbTop =
    maxScrollTop > 0 ? Math.round((safeScrollTop / maxScrollTop) * maxThumbTop) : 0;

  return {
    canScroll: true,
    maxScrollTop,
    maxThumbTop,
    thumbHeight,
    thumbTop,
  };
}

export function getScrollTopForThumbDelta({
  deltaY,
  dragStartScrollTop,
  metrics,
}: {
  deltaY: number;
  dragStartScrollTop: number;
  metrics: ScrollChromeMetrics;
}) {
  if (!metrics.canScroll || metrics.maxThumbTop <= 0) {
    return 0;
  }

  return Math.round(
    clamp(
      dragStartScrollTop + (deltaY / metrics.maxThumbTop) * metrics.maxScrollTop,
      0,
      metrics.maxScrollTop,
    ),
  );
}

export function getScrollTopForTrackPointer({
  pointerOffsetY,
  metrics,
}: {
  pointerOffsetY: number;
  metrics: ScrollChromeMetrics;
}) {
  if (!metrics.canScroll || metrics.maxThumbTop <= 0) {
    return 0;
  }

  return Math.round(
    (clamp(pointerOffsetY, 0, metrics.maxThumbTop) / metrics.maxThumbTop) *
      metrics.maxScrollTop,
  );
}
