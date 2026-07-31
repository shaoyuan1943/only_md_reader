import assert from "node:assert/strict";
import test from "node:test";

import {
  createReaderFileRequestGate,
  getLiveSyncScrollTarget,
} from "./reader-file-sync.ts";

void test("newer successful reads win over older completions", () => {
  const gate = createReaderFileRequestGate();
  const first = gate.begin();
  const second = gate.begin();

  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

void test("live sync restores a current heading before pixel scroll and top fallback", () => {
  const snapshot = {
    activeHeadingId: "current-heading",
    activeHeadingOffset: -12,
    scrollTop: 400,
  };

  assert.deepEqual(
    getLiveSyncScrollTarget(snapshot, {
      headingOffsetTop: 400,
      newMaxScrollTop: 100,
    }),
    { kind: "heading", scrollTop: 388 },
  );
  assert.deepEqual(
    getLiveSyncScrollTarget(snapshot, {
      headingOffsetTop: null,
      newMaxScrollTop: 900,
    }),
    { kind: "scrollTop", scrollTop: 400 },
  );
  assert.deepEqual(
    getLiveSyncScrollTarget(snapshot, {
      headingOffsetTop: null,
      newMaxScrollTop: 399,
    }),
    { kind: "top", scrollTop: 0 },
  );
});
