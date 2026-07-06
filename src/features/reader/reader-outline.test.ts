import assert from "node:assert/strict";
import test from "node:test";
import {
  getActiveOutlineId,
  getOutlineItemIdsWithChildren,
  getScrollTopForActiveOutlineItem,
  getScrollTopForOutlineTarget,
  getVisibleOutlineItems,
  toggleCollapsedOutlineId,
  type ReaderOutlineItem,
} from "./reader-outline.ts";

const outlineItems: ReaderOutlineItem[] = [
  { id: "intro", label: "Intro", level: 1 },
  { id: "install", label: "Install", level: 2 },
  { id: "windows", label: "Windows", level: 3 },
  { id: "macos", label: "macOS", level: 3 },
  { id: "usage", label: "Usage", level: 2 },
  { id: "appendix", label: "Appendix", level: 1 },
];

void test("collapsing a parent outline item hides only descendant headings", () => {
  const collapsedIds = new Set(["install"]);

  assert.deepEqual(
    getVisibleOutlineItems({ outlineItems, collapsedIds }).map((item) => item.id),
    ["intro", "install", "usage", "appendix"],
  );
});

void test("collapsing a top-level outline item hides descendants until the next peer", () => {
  const collapsedIds = new Set(["intro"]);

  assert.deepEqual(
    getVisibleOutlineItems({ outlineItems, collapsedIds }).map((item) => item.id),
    ["intro", "appendix"],
  );
});

void test("toggleCollapsedOutlineId returns a fresh set and never mutates the caller set", () => {
  const collapsedIds = new Set(["install"]);
  const expanded = toggleCollapsedOutlineId(collapsedIds, "install");
  const collapsed = toggleCollapsedOutlineId(collapsedIds, "usage");

  assert.deepEqual([...collapsedIds], ["install"]);
  assert.deepEqual([...expanded], []);
  assert.deepEqual([...collapsed].sort(), ["install", "usage"]);
});

void test("outline child ids include only headings with visible descendants", () => {
  assert.deepEqual(
    [...getOutlineItemIdsWithChildren(outlineItems)],
    ["intro", "install"],
  );
});

void test("active outline id follows the latest heading above the viewport anchor", () => {
  assert.equal(
    getActiveOutlineId({
      headingPositions: [
        { id: "intro", top: 0 },
        { id: "install", top: 280 },
        { id: "usage", top: 900 },
      ],
      scrollTop: 360,
      viewportOffset: 96,
    }),
    "install",
  );
});

void test("active outline id advances once the next heading reaches the top reading band", () => {
  assert.equal(
    getActiveOutlineId({
      headingPositions: [
        { id: "code", top: 1200 },
        { id: "quote", top: 1800 },
      ],
      scrollTop: 1748,
      viewportOffset: 56,
    }),
    "quote",
  );
});

void test("active outline id falls back to the first heading before scrolling begins", () => {
  assert.equal(
    getActiveOutlineId({
      headingPositions: [
        { id: "intro", top: 120 },
        { id: "install", top: 280 },
      ],
      scrollTop: 0,
      viewportOffset: 96,
    }),
    "intro",
  );
});

void test("active outline id advances near the document end when the target cannot reach the top anchor", () => {
  assert.equal(
    getActiveOutlineId({
      headingPositions: [
        { id: "8-outline-system", top: 1178 },
        { id: "8-2-duplicate-heading", top: 1435 },
        { id: "9-rich-content", top: 1539 },
        { id: "appendix", top: 2050 },
      ],
      maxScrollTop: 1331,
      scrollTop: 1331,
      viewportHeight: 752,
      viewportOffset: 96,
    }),
    "9-rich-content",
  );
});

void test("active outline ignores generated headings that are not in the outline", () => {
  assert.equal(
    getActiveOutlineId({
      headingPositions: [
        { id: "13-3-long-formula", top: 8200 },
        { id: "14-references", top: 8700 },
        { id: "footnote-label", top: 8950 },
      ],
      maxScrollTop: 8900,
      scrollTop: 8900,
      validHeadingIds: new Set(["13-3-long-formula", "14-references"]),
      viewportHeight: 760,
      viewportOffset: 96,
    }),
    "14-references",
  );
});

void test("outline jump places the target heading at the active viewport anchor", () => {
  assert.equal(
    getScrollTopForOutlineTarget({
      targetTop: 1539,
      viewportOffset: 96,
    }),
    1443,
  );
});

void test("outline jump never requests negative scroll top", () => {
  assert.equal(
    getScrollTopForOutlineTarget({
      targetTop: 56,
      viewportOffset: 96,
    }),
    0,
  );
});

void test("active outline item scrolls into view when it is below the outline viewport", () => {
  assert.equal(
    getScrollTopForActiveOutlineItem({
      itemOffsetTop: 780,
      itemHeight: 30,
      viewportHeight: 180,
      scrollTop: 420,
      margin: 24,
    }),
    654,
  );
});

void test("active outline item keeps current scroll when already visible", () => {
  assert.equal(
    getScrollTopForActiveOutlineItem({
      itemOffsetTop: 510,
      itemHeight: 30,
      viewportHeight: 180,
      scrollTop: 420,
      margin: 24,
    }),
    420,
  );
});

void test("active outline item scrolls upward with a margin when it is above the outline viewport", () => {
  assert.equal(
    getScrollTopForActiveOutlineItem({
      itemOffsetTop: 340,
      itemHeight: 30,
      viewportHeight: 180,
      scrollTop: 420,
      margin: 24,
    }),
    316,
  );
});
