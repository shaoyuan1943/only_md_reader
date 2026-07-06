export type ReaderOutlineItem = {
  id: string;
  label: string;
  level: number;
};

export type HeadingPosition = {
  id: string;
  top: number;
};

export function getVisibleOutlineItems({
  collapsedIds,
  outlineItems,
}: {
  collapsedIds: ReadonlySet<string>;
  outlineItems: ReaderOutlineItem[];
}): ReaderOutlineItem[] {
  const visibleItems: ReaderOutlineItem[] = [];
  const collapsedAncestorLevels: number[] = [];

  for (const item of outlineItems) {
    while (true) {
      const collapsedAncestorLevel =
        collapsedAncestorLevels[collapsedAncestorLevels.length - 1];

      if (collapsedAncestorLevel === undefined || item.level > collapsedAncestorLevel) {
        break;
      }

      collapsedAncestorLevels.pop();
    }

    if (collapsedAncestorLevels.length === 0) {
      visibleItems.push(item);
    }

    if (collapsedIds.has(item.id)) {
      collapsedAncestorLevels.push(item.level);
    }
  }

  return visibleItems;
}

export function getOutlineItemIdsWithChildren(
  outlineItems: ReaderOutlineItem[],
): Set<string> {
  const itemIdsWithChildren = new Set<string>();

  for (let index = 0; index < outlineItems.length; index += 1) {
    const item = outlineItems[index];
    const nextItem = outlineItems[index + 1];

    if (item && nextItem && nextItem.level > item.level) {
      itemIdsWithChildren.add(item.id);
    }
  }

  return itemIdsWithChildren;
}

export function toggleCollapsedOutlineId(
  collapsedIds: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(collapsedIds);

  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  return next;
}

export function getActiveOutlineId({
  headingPositions,
  maxScrollTop,
  scrollTop,
  validHeadingIds,
  viewportHeight,
  viewportOffset,
}: {
  headingPositions: HeadingPosition[];
  maxScrollTop?: number;
  scrollTop: number;
  validHeadingIds?: ReadonlySet<string>;
  viewportHeight?: number;
  viewportOffset: number;
}): string | null {
  const outlineHeadingPositions = validHeadingIds
    ? headingPositions.filter((heading) => validHeadingIds.has(heading.id))
    : headingPositions;

  if (outlineHeadingPositions.length === 0) {
    return null;
  }

  const isAtDocumentEnd =
    maxScrollTop !== undefined &&
    viewportHeight !== undefined &&
    maxScrollTop > 0 &&
    scrollTop >= maxScrollTop - 1;
  const anchor = isAtDocumentEnd
    ? scrollTop + Math.max(viewportOffset, viewportHeight - viewportOffset)
    : scrollTop + viewportOffset;
  let activeId = outlineHeadingPositions[0].id;

  for (const heading of outlineHeadingPositions) {
    if (heading.top <= anchor) {
      activeId = heading.id;
      continue;
    }

    break;
  }

  return activeId;
}

export function getScrollTopForOutlineTarget({
  targetTop,
  viewportOffset,
}: {
  targetTop: number;
  viewportOffset: number;
}): number {
  return Math.max(0, targetTop - viewportOffset);
}

export function getScrollTopForActiveOutlineItem({
  itemHeight,
  itemOffsetTop,
  margin,
  scrollTop,
  viewportHeight,
}: {
  itemHeight: number;
  itemOffsetTop: number;
  margin: number;
  scrollTop: number;
  viewportHeight: number;
}): number {
  const visibleTop = scrollTop + margin;
  const visibleBottom = scrollTop + viewportHeight - margin;
  const itemBottom = itemOffsetTop + itemHeight;

  if (itemOffsetTop < visibleTop) {
    return Math.max(0, itemOffsetTop - margin);
  }

  if (itemBottom > visibleBottom) {
    return Math.max(0, itemBottom - viewportHeight + margin);
  }

  return scrollTop;
}
