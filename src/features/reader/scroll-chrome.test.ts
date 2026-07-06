import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScrollChromeMetrics,
  getScrollTopForThumbDelta,
  getScrollTopForTrackPointer,
} from "../../shared/ui/scroll-chrome.ts";

void test("scroll chrome disables itself and does not show a partial fake thumb when content fits", () => {
  assert.deepEqual(
    calculateScrollChromeMetrics({
      clientHeight: 640,
      scrollHeight: 640,
      scrollTop: 0,
      trackHeight: 540,
    }),
    {
      canScroll: false,
      maxScrollTop: 0,
      maxThumbTop: 0,
      thumbHeight: 540,
      thumbTop: 0,
    },
  );
});

void test("scroll chrome derives thumb height and position from real scroll geometry", () => {
  assert.deepEqual(
    calculateScrollChromeMetrics({
      clientHeight: 500,
      scrollHeight: 2000,
      scrollTop: 750,
      trackHeight: 400,
    }),
    {
      canScroll: true,
      maxScrollTop: 1500,
      maxThumbTop: 300,
      thumbHeight: 100,
      thumbTop: 150,
    },
  );
});

void test("scroll chrome maps thumb drag and track click to scrollTop", () => {
  const metrics = calculateScrollChromeMetrics({
    clientHeight: 500,
    scrollHeight: 2000,
    scrollTop: 750,
    trackHeight: 400,
  });

  assert.equal(
    getScrollTopForThumbDelta({
      deltaY: 55,
      dragStartScrollTop: 750,
      metrics,
    }),
    1025,
  );

  assert.equal(
    getScrollTopForTrackPointer({
      pointerOffsetY: 220,
      metrics,
    }),
    1100,
  );
});
