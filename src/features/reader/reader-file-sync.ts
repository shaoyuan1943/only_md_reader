export type LiveSyncScrollSnapshot = {
  activeHeadingId: string | null;
  activeHeadingOffset: number | null;
  scrollTop: number;
};

export type ReaderFileStatus = "available" | "missing" | "unreadable" | "recovered";

export type LiveSyncScrollTarget = {
  kind: "heading" | "scrollTop" | "top";
  scrollTop: number;
};

export function createReaderFileRequestGate() {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent(requestId: number) {
      return requestId === latestRequestId;
    },
  };
}

export function getLiveSyncScrollTarget(
  snapshot: LiveSyncScrollSnapshot,
  layout: { headingOffsetTop: number | null; newMaxScrollTop: number },
): LiveSyncScrollTarget {
  if (
    snapshot.activeHeadingId &&
    snapshot.activeHeadingOffset !== null &&
    layout.headingOffsetTop !== null
  ) {
    return {
      kind: "heading",
      scrollTop: Math.max(0, layout.headingOffsetTop + snapshot.activeHeadingOffset),
    };
  }

  if (layout.newMaxScrollTop >= snapshot.scrollTop) {
    return { kind: "scrollTop", scrollTop: snapshot.scrollTop };
  }

  return { kind: "top", scrollTop: 0 };
}
