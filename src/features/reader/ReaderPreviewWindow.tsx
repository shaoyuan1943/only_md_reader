import {
  memo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MarkdownRenderResult } from "../markdown/markdown-renderer.ts";
import {
  createMarkdownRenderError,
  renderMarkdownDocument,
} from "../markdown/markdown-renderer.ts";
import type { OpenedMarkdownFile } from "../open-file/open-file-api.ts";
import {
  addMarkdownImageFailureKey,
  applyMarkdownImageFailureStates,
  markMarkdownImageFailed,
} from "./reader-image-state.ts";
import { createReaderPreviewViewModel } from "./reader-preview.ts";
import {
  getActiveOutlineId,
  getOutlineItemIdsWithChildren,
  getScrollTopForActiveOutlineItem,
  getScrollTopForOutlineTarget,
  getVisibleOutlineItems,
  toggleCollapsedOutlineId,
} from "./reader-outline.ts";
import {
  calculateScrollChromeMetrics,
  getScrollTopForThumbDelta,
  getScrollTopForTrackPointer,
  type ScrollChromeMetrics,
} from "../../shared/ui/scroll-chrome.ts";
import { getReaderLinkNavigation } from "./reader-link-navigation.ts";
import { createSettingsApi } from "../settings/settings-api.ts";
import type { WindowState } from "./window-state.ts";
import { getRestoreTarget } from "./window-state.ts";
import type { WindowStateApi } from "./window-state-api.ts";
import { createWindowStateApi } from "./window-state-api.ts";
import { READER_READY_TO_REVEAL_EVENT } from "../../shared/window-reveal.ts";
import { startPdfExport } from "../export-pdf/export-pdf.ts";
import { waitForPdfExportReadiness } from "../export-pdf/export-readiness.ts";
import { createPdfExportApi } from "../export-pdf/pdf-export-api.ts";
import {
  addReaderNotification,
  closeReaderNotification as closeReaderNotificationState,
  removeReaderNotification,
  type ReaderNotification,
} from "./reader-notifications.ts";

const OUTLINE_VIEWPORT_OFFSET = 56;
const OUTLINE_ACTIVE_ITEM_MARGIN = 24;
const READING_POSITION_SAVE_DELAY_MS = 800;
const COPY_BUBBLE_INLINE_OFFSET_PX = 10;
const COPY_BUBBLE_BLOCK_OFFSET_PX = 8;
const SELECTION_COPY_BUTTON_SIZE_PX = 32;
const TEXT_SELECTION_DRAG_THRESHOLD_PX = 10;
const PDF_EXPORT_SUCCESS_NOTIFICATION_DURATION_MS = 3_000;
const READER_NOTIFICATION_EXIT_DURATION_MS = 220;
const pdfExportApi = createPdfExportApi();

type ReaderPreviewWindowProps = {
  file: OpenedMarkdownFile;
  initialWindowState?: WindowState | null;
  onBackToOpenFile?(this: void): void;
  windowStateApi?: WindowStateApi;
  settingsApi?: ReturnType<typeof createSettingsApi>;
};

type SelectionCopyBubbleState = {
  left: number;
  text: string;
  top: number;
};

type OutlineSelectionIntentEvent =
  | ReactMouseEvent<HTMLElement>
  | ReactPointerEvent<HTMLElement>;

type TextSelectionSurface = "markdown";

type TextPoint = {
  node: Node;
  offset: number;
};

type TextSelectionStart = {
  point: TextPoint | null;
  startX: number;
  startY: number;
  surface: TextSelectionSurface;
};

type SelectionSnapshot = {
  endOffset: number;
  startOffset: number;
  text: string;
};

type MarkdownRenderedDocumentProps = {
  codeThemeName: string;
  html: string;
  onClick(this: void, event: ReactMouseEvent<HTMLDivElement>): void;
};

const MarkdownRenderedDocument = memo(function MarkdownRenderedDocument({
  codeThemeName,
  html,
  onClick,
}: MarkdownRenderedDocumentProps) {
  return (
    <div
      className="markdown-rendered-document"
      data-code-theme={codeThemeName}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
    />
  );
});

export function ReaderPreviewWindow({
  file,
  initialWindowState = null,
  onBackToOpenFile: handleBackToOpenFile,
  settingsApi = createSettingsApi(),
  windowStateApi = createWindowStateApi(),
}: ReaderPreviewWindowProps) {
  const preview = createReaderPreviewViewModel(file);
  const currentFileSize = file.fileSize ?? file.content.length;
  const currentFileModifiedAt = file.modifiedAt;
  const [rendered, setRendered] = useState<MarkdownRenderResult>(() =>
    createMarkdownRenderError(new Error("Markdown 正在渲染"), file.content),
  );
  const [isRendering, setIsRendering] = useState(true);
  const [collapsedOutlineIds, setCollapsedOutlineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [failedImageKeys, setFailedImageKeys] = useState<Set<string>>(() => new Set());
  const [effectiveThemeMode, setEffectiveThemeMode] = useState<"light" | "dark">(() =>
    getEffectiveThemeMode(),
  );
  const [isOutlineHidden, setIsOutlineHidden] = useState(false);
  const [selectionCopyBubble, setSelectionCopyBubble] =
    useState<SelectionCopyBubbleState | null>(null);
  const [settingsOpenError, setSettingsOpenError] = useState<string | null>(null);
  const [isPdfExportPreparing, setIsPdfExportPreparing] = useState(false);
  const [readerNotifications, setReaderNotifications] = useState<ReaderNotification[]>(
    [],
  );
  const lockedOutlineJumpIdRef = useRef<string | null>(null);
  const readerNotificationIdRef = useRef(0);
  const readerNotificationExitTimersRef = useRef(new Map<string, number>());
  const readerNotificationSuccessTimersRef = useRef(new Map<string, number>());
  const outlinePointerIntentRef = useRef<{
    isSelecting: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const isMouseSelectingTextRef = useRef(false);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
  const detailsOpenStateRef = useRef<Map<number, boolean>>(new Map());
  const textSelectionStartRef = useRef<TextSelectionStart | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const outlineScrollerRef = useRef<HTMLDivElement>(null);
  const readingScrollerRef = useRef<HTMLDivElement>(null);
  const restoreStateRef = useRef<WindowState | null>(initialWindowState);
  const hasRestoredScrollRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const renderedOutlineIds = useMemo(
    () => getRenderedOutlineIds(rendered.outlineItems),
    [rendered.outlineItems],
  );

  useLayoutEffect(() => {
    if (!selectionCopyBubble) {
      return undefined;
    }

    const restoreSelection = () => {
      restoreSelectionSnapshot(selectionSnapshotRef.current);
    };

    restoreSelection();
    const animationFrame = window.requestAnimationFrame(restoreSelection);
    const restoreTimer = window.setTimeout(restoreSelection, 80);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(restoreTimer);
    };
  }, [selectionCopyBubble]);

  useLayoutEffect(() => {
    detailsOpenStateRef.current = new Map();
  }, [file.content, file.path]);

  useLayoutEffect(() => {
    restoreDetailsOpenState(detailsOpenStateRef.current);
  }, [rendered.html]);

  useEffect(() => {
    const handleDetailsToggle = (event: Event) => {
      rememberDetailsOpenState(event, detailsOpenStateRef.current);
    };

    document.addEventListener("toggle", handleDetailsToggle, true);

    return () => {
      document.removeEventListener("toggle", handleDetailsToggle, true);
    };
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      setEffectiveThemeMode(getEffectiveThemeMode());
    };

    const themeObserver = new MutationObserver(handleThemeChange);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme-effective-mode"],
      attributes: true,
    });
    handleThemeChange();

    return () => {
      themeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    setIsRendering(true);
    setFailedImageKeys(new Set());
    hasRestoredScrollRef.current = false;
    void renderMarkdownDocument({
      content: file.content,
      filePath: file.path,
      resolveImageSrc: isTauri() ? convertFileSrc : undefined,
      themeMode: effectiveThemeMode,
    }).then((result) => {
      if (isCancelled) {
        return;
      }

      setRendered(result);
      setActiveOutlineId(result.outlineItems[0]?.id ?? null);
      setIsRendering(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [effectiveThemeMode, file.content, file.path]);

  useEffect(() => {
    if (initialWindowState) {
      restoreStateRef.current = initialWindowState;
      return;
    }

    let isCancelled = false;
    void windowStateApi.getWindowState(file.path).then((state) => {
      if (!isCancelled) {
        restoreStateRef.current = state;
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [file.path, initialWindowState, windowStateApi]);

  useLayoutEffect(() => {
    const scroller = readingScrollerRef.current;
    const state = restoreStateRef.current;

    if (!scroller || isRendering || hasRestoredScrollRef.current) {
      return;
    }

    const headingIds = new Set(
      Array.from(
        scroller.querySelectorAll<HTMLElement>(
          ".markdown-rendered-document :is(h1, h2, h3, h4, h5, h6)[id]",
        ),
      ).map((heading) => heading.id),
    );
    const target = getRestoreTarget({
      state,
      availableHeadingIds: headingIds,
      currentFileModifiedAt,
      currentFileSize,
    });

    if (target.kind === "heading") {
      const heading = scroller.querySelector<HTMLElement>(`#${CSS.escape(target.id)}`);
      if (heading) {
        scroller.scrollTop = Math.max(0, heading.offsetTop + target.offset);
      }
    } else if (target.kind === "ratio") {
      scroller.scrollTop =
        (scroller.scrollHeight - scroller.clientHeight) * target.ratio;
    } else if (target.kind === "scrollTop") {
      scroller.scrollTop = target.scrollTop;
    } else {
      scroller.scrollTop = 0;
    }

    hasRestoredScrollRef.current = true;
    setActiveOutlineId(getActiveOutlineIdForScroller(scroller, renderedOutlineIds));
  }, [
    currentFileModifiedAt,
    currentFileSize,
    isRendering,
    rendered.html,
    renderedOutlineIds,
  ]);

  useLayoutEffect(() => {
    if (isRendering) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event(READER_READY_TO_REVEAL_EVENT));
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isRendering, rendered.html]);

  useEffect(() => {
    const scroller = readingScrollerRef.current;
    if (!scroller) {
      return undefined;
    }

    const handleImageError = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) {
        return;
      }

      const failedImageKey = markMarkdownImageFailed(event.target);

      if (failedImageKey) {
        setFailedImageKeys((current) =>
          addMarkdownImageFailureKey(current, failedImageKey),
        );
      }
    };

    scroller.addEventListener("error", handleImageError, true);

    return () => {
      scroller.removeEventListener("error", handleImageError, true);
    };
  }, []);

  useLayoutEffect(() => {
    const scroller = readingScrollerRef.current;

    if (!scroller || failedImageKeys.size === 0) {
      return;
    }

    applyMarkdownImageFailureStates(scroller, failedImageKeys);
  });

  const visibleOutlineItems = useMemo(
    () =>
      getVisibleOutlineItems({
        collapsedIds: collapsedOutlineIds,
        outlineItems: rendered.outlineItems,
      }),
    [collapsedOutlineIds, rendered.outlineItems],
  );
  const outlineItemIdsWithChildren = useMemo(
    () => getOutlineItemIdsWithChildren(rendered.outlineItems),
    [rendered.outlineItems],
  );
  useLayoutEffect(() => {
    if (activeOutlineId === null) {
      return;
    }

    const outlineScroller = outlineScrollerRef.current;
    if (!outlineScroller) {
      return;
    }

    scrollActiveOutlineItemIntoView(outlineScroller, activeOutlineId);
  }, [activeOutlineId, visibleOutlineItems]);

  const saveReadingPosition = useCallback(
    (scroller: HTMLDivElement) => {
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const activeHeading = activeOutlineId
        ? scroller.querySelector<HTMLElement>(`#${CSS.escape(activeOutlineId)}`)
        : null;

      void windowStateApi.saveWindowState({
        filePath: file.path,
        scrollTop: scroller.scrollTop,
        scrollRatio: maxScrollTop > 0 ? scroller.scrollTop / maxScrollTop : 0,
        activeHeadingId: activeOutlineId ?? undefined,
        activeHeadingOffset: activeHeading
          ? scroller.scrollTop - activeHeading.offsetTop
          : undefined,
        fileModifiedAt: file.modifiedAt,
        fileSize: currentFileSize,
      });
    },
    [activeOutlineId, currentFileSize, file.modifiedAt, file.path, windowStateApi],
  );

  const scheduleReadingPositionSave = useCallback(
    (scroller: HTMLDivElement) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveReadingPosition(scroller);
      }, READING_POSITION_SAVE_DELAY_MS);
    },
    [saveReadingPosition],
  );

  useEffect(() => {
    const scroller = readingScrollerRef.current;

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (scroller) {
        saveReadingPosition(scroller);
      }
    };
  }, [saveReadingPosition]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F11") {
        return;
      }

      event.preventDefault();
      setIsOutlineHidden((current) => !current);
      setSelectionCopyBubble(null);
    };

    document.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  const copyText = useCallback(async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    fallbackCopyText(text);
  }, []);

  const clearTextSelectionState = useCallback(() => {
    selectionSnapshotRef.current = null;
    textSelectionStartRef.current = null;
    isMouseSelectingTextRef.current = false;
    setSelectionCopyBubble(null);
    clearWindowSelection();

    if (shellRef.current) {
      setShellSelectionSurface(shellRef.current, null);
    }
  }, []);

  const handleSelectionChange = useCallback(() => {
    if (isMouseSelectingTextRef.current) {
      return;
    }

    const shell = shellRef.current;
    const selection = window.getSelection();

    if (!shell || !selection || selection.isCollapsed) {
      selectionSnapshotRef.current = null;
      setSelectionCopyBubble(null);
      return;
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const selectedText = range ? getVisibleSelectionText(range).trim() : "";
    const commonAncestor = range?.commonAncestorContainer ?? null;
    const commonElement = getContainingElement(commonAncestor);

    if (
      !selectedText ||
      !range ||
      !commonElement ||
      !shell.contains(commonElement) ||
      !isRangeInsideMarkdownDocument(range)
    ) {
      selectionSnapshotRef.current = null;
      setSelectionCopyBubble(null);
      return;
    }

    selectionSnapshotRef.current = createSelectionSnapshot(range, selectedText);
    const anchor = getSelectionAnchorPoint(range);

    const nextBubble = {
      left: anchor.x,
      text: selectedText,
      top: anchor.y,
    };

    setSelectionCopyBubble((current) => {
      if (
        current &&
        current.text === nextBubble.text &&
        Math.abs(current.left - nextBubble.left) < 1 &&
        Math.abs(current.top - nextBubble.top) < 1
      ) {
        return current;
      }

      return nextBubble;
    });
  }, []);

  const dismissSelectionCopyBubble = useCallback(() => {
    setSelectionCopyBubble(null);
  }, []);

  const finishTextSelection = useCallback(
    (event: MouseEvent, shell: HTMLElement | null) => {
      const selectionStart = textSelectionStartRef.current;

      if (!selectionStart) {
        isMouseSelectingTextRef.current = false;
        if (shell) {
          setShellSelectionSurface(shell, null);
        }
        return;
      }

      textSelectionStartRef.current = null;
      isMouseSelectingTextRef.current = false;
      const shouldProcessTextSelection =
        event.detail > 1 ||
        hasMeaningfulPointerDrag(selectionStart, event.clientX, event.clientY);

      window.setTimeout(() => {
        if (!shouldProcessTextSelection) {
          selectionSnapshotRef.current = null;
          setSelectionCopyBubble(null);
          clearWindowSelection();
          if (shell) {
            setShellSelectionSurface(shell, null);
          }
          return;
        }

        applySelectionFallbackIfNeeded(selectionStart, event.clientX, event.clientY);
        handleSelectionChange();

        if (shell) {
          setShellSelectionSurface(shell, null);
        }
      }, 0);
    },
    [handleSelectionChange],
  );

  const handleShellPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const selectionSurface =
        event.button === 0 ? getReaderTextSelectionSurface(event.target) : null;

      isMouseSelectingTextRef.current = selectionSurface !== null;
      setShellSelectionSurface(event.currentTarget, selectionSurface);
    },
    [],
  );

  const handleShellMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".reader-preview-selection-copy-button")
      ) {
        return;
      }

      const selectionSurface =
        event.button === 0 ? getReaderTextSelectionSurface(event.target) : null;

      isMouseSelectingTextRef.current = selectionSurface !== null;
      setShellSelectionSurface(event.currentTarget, selectionSurface);
      textSelectionStartRef.current = selectionSurface
        ? {
            point: getCaretPointFromViewportPoint(event.clientX, event.clientY),
            startX: event.clientX,
            startY: event.clientY,
            surface: selectionSurface,
          }
        : null;
      selectionSnapshotRef.current = null;
      dismissSelectionCopyBubble();
    },
    [dismissSelectionCopyBubble],
  );

  const handleShellMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          ".reader-preview-selection-copy-button, .markdown-code-copy-button",
        )
      ) {
        return;
      }

      finishTextSelection(event.nativeEvent, event.currentTarget);
    },
    [finishTextSelection],
  );

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (
        !event.altKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  const handleShellKeyUp = useCallback(() => {
    handleSelectionChange();
  }, [handleSelectionChange]);

  const handleRenderedDocumentClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const copyButton = event.target.closest<HTMLButtonElement>(
        ".markdown-code-copy-button",
      );

      if (!copyButton) {
        const link = event.target.closest<HTMLAnchorElement>(
          ".markdown-rendered-document a[href]",
        );

        if (!link) {
          return;
        }

        const navigation = getReaderLinkNavigation(link.getAttribute("href") ?? "");

        event.preventDefault();
        event.stopPropagation();
        setSelectionCopyBubble(null);

        if (navigation.kind === "internal-anchor") {
          scrollReadingAnchorIntoView(readingScrollerRef.current, navigation.id);
          return;
        }

        if (navigation.kind === "external") {
          void openExternalLink(navigation.href);
        }

        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectionCopyBubble(null);
      void copyText(decodeCopyCode(copyButton.dataset.copyCode ?? ""));
    },
    [copyText],
  );

  const handleSelectionCopy = useCallback(() => {
    const selectedText = selectionCopyBubble?.text ?? "";

    setSelectionCopyBubble(null);
    if (selectedText) {
      selectionSnapshotRef.current = null;
      void copyText(selectedText);
      clearWindowSelection();
    }
  }, [copyText, selectionCopyBubble?.text]);

  const handleFilePathCopy = useCallback(() => {
    setSelectionCopyBubble(null);
    void copyText(preview.pathLine);
  }, [copyText, preview.pathLine]);

  const handleToggleOutline = useCallback(() => {
    setIsOutlineHidden((current) => !current);
    setSelectionCopyBubble(null);
  }, []);

  useEffect(() => {
    const handleDocumentSelectionChange = () => {
      window.setTimeout(() => {
        handleSelectionChange();
      }, 0);
    };

    document.addEventListener("selectionchange", handleDocumentSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
    };
  }, [handleSelectionChange]);

  useEffect(() => {
    const handleDocumentCopy = (event: ClipboardEvent) => {
      const shell = shellRef.current;
      const selectedText = getSelectionTextInsideShell(shell);
      const textToCopy = selectedText || selectionCopyBubble?.text || "";

      if (!textToCopy.trim() || !event.clipboardData) {
        return;
      }

      event.clipboardData.setData("text/plain", textToCopy);
      event.preventDefault();
    };

    document.addEventListener("copy", handleDocumentCopy);

    return () => {
      document.removeEventListener("copy", handleDocumentCopy);
    };
  }, [selectionCopyBubble?.text]);

  useEffect(() => {
    const handleDocumentMouseUp = (event: MouseEvent) => {
      if (!textSelectionStartRef.current) {
        return;
      }

      finishTextSelection(event, shellRef.current);
    };

    document.addEventListener("mouseup", handleDocumentMouseUp);

    return () => {
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [finishTextSelection]);

  const handleReadingScroll = useCallback(
    (scroller: HTMLDivElement) => {
      const lockedOutlineJumpId = lockedOutlineJumpIdRef.current;
      if (lockedOutlineJumpId) {
        setActiveOutlineId(lockedOutlineJumpId);
        scheduleReadingPositionSave(scroller);
        return;
      }

      setActiveOutlineId(getActiveOutlineIdForScroller(scroller, renderedOutlineIds));
      scheduleReadingPositionSave(scroller);
    },
    [renderedOutlineIds, scheduleReadingPositionSave],
  );

  const handleUserScrollIntent = useCallback(() => {
    lockedOutlineJumpIdRef.current = null;
    clearTextSelectionState();
  }, [clearTextSelectionState]);

  const handleOutlineJump = (id: string) => {
    const scroller = readingScrollerRef.current;
    const target = scroller?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);

    if (!scroller || !target) {
      return;
    }

    lockedOutlineJumpIdRef.current = id;
    scroller.scrollTop = getScrollTopForOutlineTarget({
      targetTop: target.offsetTop,
      viewportOffset: OUTLINE_VIEWPORT_OFFSET,
    });
    setActiveOutlineId(id);
  };

  const handleOutlineItemPointerDown = (event: OutlineSelectionIntentEvent) => {
    if (event.button !== 0) {
      outlinePointerIntentRef.current = null;
      return;
    }

    outlinePointerIntentRef.current = {
      isSelecting: false,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handleOutlineItemPointerMove = (event: OutlineSelectionIntentEvent) => {
    const intent = outlinePointerIntentRef.current;

    if (!intent) {
      return;
    }

    const movedFarEnough =
      Math.abs(event.clientX - intent.startX) > 4 ||
      Math.abs(event.clientY - intent.startY) > 4;

    if (movedFarEnough) {
      intent.isSelecting = true;
    }
  };

  const shouldSuppressOutlineJumpForSelection = () => {
    const intent = outlinePointerIntentRef.current;
    outlinePointerIntentRef.current = null;

    if (intent?.isSelecting) {
      return true;
    }

    const selection = window.getSelection();

    return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
  };

  const closeReaderNotification = useCallback((id: string) => {
    setReaderNotifications((current) => closeReaderNotificationState(current, id));
  }, []);

  const showReaderNotification = useCallback(
    (kind: ReaderNotification["kind"], message: string) => {
      const id = `reader-notification-${Date.now()}-${readerNotificationIdRef.current}`;
      readerNotificationIdRef.current += 1;
      const notification: ReaderNotification = {
        id,
        kind,
        message,
        isClosing: false,
      };

      setReaderNotifications((current) => addReaderNotification(current, notification));

      if (kind === "success") {
        const timer = window.setTimeout(() => {
          readerNotificationSuccessTimersRef.current.delete(id);
          closeReaderNotification(id);
        }, PDF_EXPORT_SUCCESS_NOTIFICATION_DURATION_MS);
        readerNotificationSuccessTimersRef.current.set(id, timer);
      }
    },
    [closeReaderNotification],
  );

  useEffect(() => {
    for (const notification of readerNotifications) {
      if (
        !notification.isClosing ||
        readerNotificationExitTimersRef.current.has(notification.id)
      ) {
        continue;
      }

      const timer = window.setTimeout(() => {
        readerNotificationExitTimersRef.current.delete(notification.id);
        setReaderNotifications((current) =>
          removeReaderNotification(current, notification.id),
        );
      }, READER_NOTIFICATION_EXIT_DURATION_MS);
      readerNotificationExitTimersRef.current.set(notification.id, timer);
    }
  }, [readerNotifications]);

  useEffect(() => {
    const exitTimers = readerNotificationExitTimersRef.current;
    const successTimers = readerNotificationSuccessTimersRef.current;

    return () => {
      for (const timer of exitTimers.values()) {
        window.clearTimeout(timer);
      }
      for (const timer of successTimers.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  async function handlePdfExport() {
    const root = readingScrollerRef.current;

    if (!root || isRendering || isPdfExportPreparing) {
      return;
    }

    setIsPdfExportPreparing(true);

    try {
      const result = await startPdfExport({
        awaitReadiness: () =>
          waitForPdfExportReadiness({
            document,
            root,
          }),
        exportPdf: () => pdfExportApi.exportPdf(file.path),
      });

      if (result.kind === "resource-timeout") {
        showReaderNotification(
          "error",
          "图片尚未加载完成，暂未导出。请检查图片路径或网络后重试。",
        );
      } else if (result.kind === "export-failed") {
        showReaderNotification("error", result.message);
      } else {
        showReaderNotification("success", "PDF 已导出。");
      }
    } catch (error) {
      showReaderNotification("error", `无法准备 PDF 导出：${getErrorMessage(error)}`);
    } finally {
      setIsPdfExportPreparing(false);
    }
  }

  async function handleOpenSettings() {
    try {
      setSettingsOpenError(null);
      await settingsApi.openSettingsWindow();
    } catch (error) {
      setSettingsOpenError(getErrorMessage(error));
    }
  }

  return (
    <main
      className="reader-preview-shell"
      aria-label="Markdown 阅读窗口"
      onKeyUp={handleShellKeyUp}
      onMouseDown={handleShellMouseDown}
      onMouseUp={handleShellMouseUp}
      onPointerDownCapture={handleShellPointerDownCapture}
      ref={shellRef}
    >
      <div className="reader-preview-layout" data-outline-hidden={isOutlineHidden}>
        <ScrollablePanel
          as="aside"
          className="reader-preview-outline-card"
          contentClassName="reader-preview-outline-list"
          ariaLabel="大纲区域"
          hiddenFromView={isOutlineHidden}
          scrollerRef={outlineScrollerRef}
        >
          <nav className="reader-preview-outline-tree" aria-label="文档大纲">
            {handleBackToOpenFile ? (
              <button
                className="reader-preview-back"
                type="button"
                onClick={handleBackToOpenFile}
              >
                返回打开窗口
              </button>
            ) : null}
            {visibleOutlineItems.length > 0 ? (
              visibleOutlineItems.map((item) => {
                const hasChildren = outlineItemIdsWithChildren.has(item.id);

                return (
                  <div
                    className="reader-preview-outline-row"
                    data-depth={clampOutlineDepth(item.level)}
                    key={item.id}
                  >
                    {hasChildren ? (
                      <button
                        className="reader-preview-outline-toggle"
                        type="button"
                        aria-label={
                          collapsedOutlineIds.has(item.id)
                            ? `展开 ${item.label}`
                            : `折叠 ${item.label}`
                        }
                        aria-expanded={!collapsedOutlineIds.has(item.id)}
                        onClick={() => {
                          setCollapsedOutlineIds((current) =>
                            toggleCollapsedOutlineId(current, item.id),
                          );
                        }}
                      >
                        <span aria-hidden="true">›</span>
                      </button>
                    ) : (
                      <span className="reader-preview-outline-spacer" />
                    )}
                    <span
                      className="reader-preview-outline-item"
                      data-outline-item-id={item.id}
                      data-current={item.id === activeOutlineId}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (shouldSuppressOutlineJumpForSelection()) {
                          return;
                        }

                        handleOutlineJump(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }

                        event.preventDefault();
                        handleOutlineJump(item.id);
                      }}
                      onMouseDown={handleOutlineItemPointerDown}
                      onMouseMove={handleOutlineItemPointerMove}
                      onPointerDown={handleOutlineItemPointerDown}
                      onPointerMove={handleOutlineItemPointerMove}
                      title={item.label}
                    >
                      <span className="reader-preview-outline-item-text">
                        {item.label}
                      </span>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="reader-preview-outline-empty">
                {preview.outlinePlaceholder}
              </div>
            )}
          </nav>
        </ScrollablePanel>

        <ScrollablePanel
          as="section"
          className="reader-preview-reading-card"
          contentClassName="reader-preview-scroll"
          aria-labelledby="reader-preview-title"
          onContentScroll={handleReadingScroll}
          onUserScrollIntent={handleUserScrollIntent}
          scrollerRef={readingScrollerRef}
        >
          <article className="reader-preview-document">
            <div className="reader-preview-file-path-row">
              <button
                className="reader-preview-file-path-copy-button"
                type="button"
                aria-label="复制完整文件路径"
                title="复制完整文件路径"
                onClick={handleFilePathCopy}
              >
                <CopyIcon />
              </button>
              <p
                className="reader-preview-file-path"
                id="reader-preview-title"
                title={preview.pathLine}
              >
                {preview.pathLine}
              </p>
            </div>

            <section
              className="reader-preview-source-section markdown-render-surface"
              aria-label="Markdown 渲染视图"
              aria-busy={isRendering}
            >
              {isRendering ? (
                <p className="reader-preview-source-copy">Markdown 正在渲染。</p>
              ) : null}
              {rendered.error ? (
                <p className="reader-preview-render-error">{rendered.error.message}</p>
              ) : null}
              <MarkdownRenderedDocument
                codeThemeName={rendered.codeThemeName}
                html={rendered.html}
                onClick={handleRenderedDocumentClick}
              />
            </section>
          </article>

          <button
            className="reader-preview-pdf-export-button"
            type="button"
            aria-label={preview.pdfExportLabel}
            aria-busy={isPdfExportPreparing}
            title={preview.pdfExportLabel}
            disabled={isRendering || isPdfExportPreparing}
            onClick={() => void handlePdfExport()}
          >
            <PdfExportIcon />
          </button>
          <button
            className="reader-preview-settings-button"
            type="button"
            aria-label={preview.settingsLabel}
            title={preview.settingsLabel}
            onClick={() => void handleOpenSettings()}
          >
            <SettingsIcon />
          </button>
          {settingsOpenError ? (
            <p className="reader-preview-settings-error" role="alert">
              {settingsOpenError}
            </p>
          ) : null}
        </ScrollablePanel>

        <button
          className="reader-preview-outline-rail-button"
          type="button"
          aria-label={isOutlineHidden ? "显示大纲" : "隐藏大纲"}
          title={isOutlineHidden ? "显示大纲" : "隐藏大纲"}
          data-direction={isOutlineHidden ? "show" : "hide"}
          onClick={handleToggleOutline}
        >
          {isOutlineHidden ? <RightArrowIcon /> : <LeftArrowIcon />}
        </button>
      </div>
      <ReaderNotificationStack notifications={readerNotifications} />
      {selectionCopyBubble ? (
        <button
          className="reader-preview-selection-copy-button"
          type="button"
          aria-label="复制选中文字"
          title="复制选中文字"
          data-visible="true"
          onClick={handleSelectionCopy}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          style={{
            left: `${selectionCopyBubble.left}px`,
            top: `${selectionCopyBubble.top}px`,
          }}
        >
          <CopyIcon />
        </button>
      ) : null}
    </main>
  );
}

function ReaderNotificationStack({
  notifications,
}: {
  notifications: ReaderNotification[];
}) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <aside className="reader-preview-notifications" aria-label="应用通知">
      {notifications.map((notification) => (
        <p
          className="reader-preview-notification"
          data-closing={notification.isClosing}
          data-kind={notification.kind}
          key={notification.id}
          role={notification.kind === "error" ? "alert" : "status"}
        >
          {notification.message}
        </p>
      ))}
    </aside>
  );
}

type ScrollablePanelProps = {
  as: "aside" | "section";
  children: ReactNode;
  className: string;
  contentClassName: string;
  ariaLabel?: string;
  "aria-labelledby"?: string;
  hiddenFromView?: boolean;
  onContentScroll?(this: void, scroller: HTMLDivElement): void;
  onUserScrollIntent?(this: void): void;
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
};

type ScrollChromeState = ScrollChromeMetrics & {
  isDragging: boolean;
  isVisible: boolean;
};

const defaultScrollChromeState: ScrollChromeState = {
  canScroll: false,
  isDragging: false,
  isVisible: false,
  maxScrollTop: 0,
  maxThumbTop: 0,
  thumbHeight: 0,
  thumbTop: 0,
};

function ScrollablePanel({
  as: Element,
  children,
  className,
  contentClassName,
  ariaLabel,
  "aria-labelledby": ariaLabelledby,
  hiddenFromView = false,
  onContentScroll,
  onUserScrollIntent,
  scrollerRef: externalScrollerRef,
}: ScrollablePanelProps) {
  const internalScrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startScrollTop: number;
    startY: number;
  } | null>(null);
  const [chromeState, setChromeState] = useState<ScrollChromeState>(
    defaultScrollChromeState,
  );

  const getScroller = useCallback(
    () => externalScrollerRef?.current ?? internalScrollerRef.current,
    [externalScrollerRef],
  );

  const updateMetrics = useCallback(() => {
    const scroller = getScroller();
    const track = trackRef.current;

    if (!scroller || !track) {
      return;
    }

    const metrics = calculateScrollChromeMetrics({
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      trackHeight: track.clientHeight,
    });

    setChromeState((current) => ({
      ...metrics,
      isDragging: current.isDragging,
      isVisible: current.isVisible && metrics.canScroll,
    }));
  }, [getScroller]);

  useEffect(() => {
    updateMetrics();

    const scroller = getScroller();
    if (!scroller) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(scroller);
    if (scroller.firstElementChild) {
      resizeObserver.observe(scroller.firstElementChild);
    }

    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [getScroller, updateMetrics]);

  const handleScroll = () => {
    updateMetrics();
    const scroller = getScroller();

    if (scroller) {
      onContentScroll?.(scroller);
    }
  };

  const showChrome = () => {
    updateMetrics();
    setChromeState((current) => ({
      ...current,
      isVisible: current.canScroll,
    }));
  };

  const hideChrome = () => {
    setChromeState((current) => ({
      ...current,
      isVisible: current.isDragging,
    }));
  };

  const handleTrackClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    onUserScrollIntent?.();
    const scroller = getScroller();
    if (!scroller || !chromeState.canScroll) {
      return;
    }

    const trackRect = event.currentTarget.getBoundingClientRect();
    const pointerOffsetY = event.clientY - trackRect.top - chromeState.thumbHeight / 2;

    scroller.scrollTop = getScrollTopForTrackPointer({
      metrics: chromeState,
      pointerOffsetY,
    });
  };

  const handleThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = getScroller();
    if (event.button !== 0 || !scroller || !chromeState.canScroll) {
      return;
    }

    onUserScrollIntent?.();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startScrollTop: scroller.scrollTop,
      startY: event.clientY,
    };
    setChromeState((current) => ({
      ...current,
      isDragging: true,
      isVisible: true,
    }));
  };

  const handleThumbPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = getScroller();
    const dragState = dragStateRef.current;

    if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    scroller.scrollTop = getScrollTopForThumbDelta({
      deltaY: event.clientY - dragState.startY,
      dragStartScrollTop: dragState.startScrollTop,
      metrics: chromeState,
    });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setChromeState((current) => ({
      ...current,
      isDragging: false,
      isVisible: false,
    }));
  };

  const thumbStyle = {
    "--scroll-thumb-height": `${chromeState.thumbHeight}px`,
    "--scroll-thumb-top": `${chromeState.thumbTop}px`,
  } as CSSProperties;

  return (
    <Element
      className={className}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-hidden={hiddenFromView}
      data-can-scroll={chromeState.canScroll}
      data-hidden={hiddenFromView}
      data-scrollbar-visible={chromeState.isVisible}
      data-scrolled-from-top={chromeState.thumbTop > 0}
      data-dragging-scrollbar={chromeState.isDragging}
    >
      <div
        className={contentClassName}
        onKeyDown={onUserScrollIntent}
        onScroll={handleScroll}
        onWheel={onUserScrollIntent}
        ref={externalScrollerRef ?? internalScrollerRef}
      >
        {children}
      </div>
      <div
        className="reader-preview-scrollbar-hotzone"
        aria-hidden="true"
        onPointerEnter={showChrome}
        onPointerLeave={hideChrome}
      >
        <div
          className="reader-preview-scrollbar"
          onClick={handleTrackClick}
          ref={trackRef}
        >
          <div
            className="reader-preview-scrollbar-thumb"
            onPointerDown={handleThumbPointerDown}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            style={thumbStyle}
          />
        </div>
      </div>
    </Element>
  );
}

function getEffectiveThemeMode(): "light" | "dark" {
  const effectiveMode = document.documentElement.dataset.themeEffectiveMode;

  return effectiveMode === "dark" ? "dark" : "light";
}

function getRenderedOutlineIds(outlineItems: Array<{ id: string }>): Set<string> {
  return new Set(outlineItems.map((item) => item.id));
}

function clampOutlineDepth(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.min(6, Math.max(1, Math.trunc(level)));
}

function getActiveOutlineIdForScroller(
  scroller: HTMLDivElement,
  validHeadingIds: ReadonlySet<string>,
): string | null {
  const headings = Array.from(
    scroller.querySelectorAll<HTMLElement>(
      ".markdown-rendered-document :is(h1, h2, h3, h4, h5, h6)[id]",
    ),
  ).map((heading) => ({
    id: heading.id,
    top: heading.offsetTop,
  }));

  return getActiveOutlineId({
    headingPositions: headings,
    maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
    scrollTop: scroller.scrollTop,
    validHeadingIds,
    viewportHeight: scroller.clientHeight,
    viewportOffset: OUTLINE_VIEWPORT_OFFSET,
  });
}

function scrollActiveOutlineItemIntoView(
  outlineScroller: HTMLDivElement,
  activeOutlineId: string,
) {
  const activeItem = outlineScroller.querySelector<HTMLElement>(
    `[data-outline-item-id="${CSS.escape(activeOutlineId)}"]`,
  );

  if (!activeItem) {
    return;
  }

  outlineScroller.scrollTop = getScrollTopForActiveOutlineItem({
    itemHeight: activeItem.offsetHeight,
    itemOffsetTop: activeItem.offsetTop,
    margin: OUTLINE_ACTIVE_ITEM_MARGIN,
    scrollTop: outlineScroller.scrollTop,
    viewportHeight: outlineScroller.clientHeight,
  });
}

function scrollReadingAnchorIntoView(
  scroller: HTMLDivElement | null,
  targetId: string,
) {
  if (!scroller) {
    return;
  }

  const target = scroller.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`);

  if (!target) {
    return;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextScrollTop = scroller.scrollTop + targetRect.top - scrollerRect.top;

  scroller.scrollTop = Math.max(0, nextScrollTop);
  scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getUsableSelectionRect(range: Range): DOMRect {
  const rect = range.getBoundingClientRect();

  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  return range.getClientRects()[0] ?? rect;
}

function getSelectionAnchorPoint(range: Range): { x: number; y: number } {
  const textRects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  const anchorRect = textRects[textRects.length - 1] ?? getUsableSelectionRect(range);
  const maxLeft =
    window.innerWidth - SELECTION_COPY_BUTTON_SIZE_PX - COPY_BUBBLE_INLINE_OFFSET_PX;
  const maxTop =
    window.innerHeight - SELECTION_COPY_BUTTON_SIZE_PX - COPY_BUBBLE_INLINE_OFFSET_PX;

  return {
    x: clampNumber(
      anchorRect.right + COPY_BUBBLE_INLINE_OFFSET_PX,
      COPY_BUBBLE_INLINE_OFFSET_PX,
      Math.max(COPY_BUBBLE_INLINE_OFFSET_PX, maxLeft),
    ),
    y: clampNumber(
      anchorRect.bottom + COPY_BUBBLE_BLOCK_OFFSET_PX,
      COPY_BUBBLE_INLINE_OFFSET_PX,
      Math.max(COPY_BUBBLE_INLINE_OFFSET_PX, maxTop),
    ),
  };
}

function hasMeaningfulPointerDrag(
  start: TextSelectionStart,
  endX: number,
  endY: number,
): boolean {
  return (
    Math.hypot(endX - start.startX, endY - start.startY) >=
    TEXT_SELECTION_DRAG_THRESHOLD_PX
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getContainingElement(node: Node | null): Element | null {
  if (!node) {
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  const parent = node.parentNode;

  return parent instanceof Element ? parent : null;
}

function getSelectionTextInsideShell(shell: HTMLElement | null): string {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const commonElement = getContainingElement(range?.commonAncestorContainer ?? null);

  if (
    !shell ||
    !selection ||
    selection.isCollapsed ||
    !range ||
    !commonElement ||
    !shell.contains(commonElement) ||
    !isRangeInsideMarkdownDocument(range)
  ) {
    return "";
  }

  return getVisibleSelectionText(range).trim();
}

function getVisibleSelectionText(range: Range): string {
  const root = document.querySelector(".markdown-rendered-document");
  const nativeSelectionText = range.toString();

  if (!root) {
    return nativeSelectionText;
  }

  const selectedParts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let skippedHiddenText = false;
  let previousBlock: Element | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (!rangeIntersectsTextNode(range, node)) {
      continue;
    }

    if (isTextNodeHiddenByCollapsedDetails(node)) {
      skippedHiddenText = true;
      continue;
    }

    const text = node.textContent ?? "";
    const startOffset =
      node === range.startContainer
        ? clampNumber(range.startOffset, 0, text.length)
        : 0;
    const endOffset =
      node === range.endContainer
        ? clampNumber(range.endOffset, 0, text.length)
        : text.length;

    if (endOffset <= startOffset) {
      continue;
    }

    const selectedText = text.slice(startOffset, endOffset);

    if (!selectedText) {
      continue;
    }

    const currentBlock = getVisibleSelectionTextBlock(node);

    if (
      skippedHiddenText &&
      selectedText.trim() &&
      previousBlock &&
      currentBlock !== previousBlock &&
      !selectedParts[selectedParts.length - 1]?.endsWith("\n")
    ) {
      selectedParts.push("\n");
    }

    if (selectedText.trim()) {
      previousBlock = currentBlock;
    }

    selectedParts.push(selectedText);
  }

  if (!skippedHiddenText) {
    return nativeSelectionText;
  }

  return selectedParts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function rangeIntersectsTextNode(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function isTextNodeHiddenByCollapsedDetails(node: Node): boolean {
  const element = getContainingElement(node);
  const collapsedDetails = element?.closest("details:not([open])");

  if (!(collapsedDetails instanceof HTMLDetailsElement)) {
    return false;
  }

  const summary = element?.closest("summary");

  return !(summary && summary.parentElement === collapsedDetails);
}

function getVisibleSelectionTextBlock(node: Node): Element | null {
  const element = getContainingElement(node);

  return (
    element?.closest(
      "p, li, h1, h2, h3, h4, h5, h6, summary, td, th, blockquote, pre, code",
    ) ?? element
  );
}

function rememberDetailsOpenState(
  event: Event,
  detailsOpenState: Map<number, boolean>,
) {
  if (!(event.target instanceof HTMLDetailsElement)) {
    return;
  }

  const root = document.querySelector(".markdown-rendered-document");

  if (!root || !root.contains(event.target)) {
    return;
  }

  const detailsIndex = Array.from(root.querySelectorAll("details")).indexOf(
    event.target,
  );

  if (detailsIndex >= 0) {
    detailsOpenState.set(detailsIndex, event.target.open);
  }
}

function restoreDetailsOpenState(detailsOpenState: Map<number, boolean>) {
  if (detailsOpenState.size === 0) {
    return;
  }

  const root = document.querySelector(".markdown-rendered-document");

  if (!root) {
    return;
  }

  root
    .querySelectorAll<HTMLDetailsElement>("details")
    .forEach((details, detailsIndex) => {
      const isOpen = detailsOpenState.get(detailsIndex);

      if (isOpen !== undefined && details.open !== isOpen) {
        details.open = isOpen;
      }
    });
}

async function openExternalLink(href: string) {
  if (isTauri()) {
    await openUrl(href);
    return;
  }

  window.open(href, "_blank", "noopener,noreferrer");
}

function isRangeInsideMarkdownDocument(range: Range): boolean {
  const markdownDocument = document.querySelector(".markdown-rendered-document");

  return Boolean(
    markdownDocument &&
    markdownDocument.contains(range.startContainer) &&
    markdownDocument.contains(range.endContainer),
  );
}

function getReaderTextSelectionSurface(
  target: EventTarget | null,
): TextSelectionSurface | null {
  if (!(target instanceof Element)) {
    return null;
  }

  if (target.closest("button, input, textarea, select, .markdown-code-copy-button")) {
    return null;
  }

  if (target.closest(".markdown-rendered-document")) {
    return "markdown";
  }

  return null;
}

function setShellSelectionSurface(
  shell: HTMLElement,
  surface: TextSelectionSurface | null,
) {
  if (surface) {
    shell.dataset.selectingSurface = surface;
    return;
  }

  delete shell.dataset.selectingSurface;
}

function applySelectionFallbackIfNeeded(
  start: TextSelectionStart | null,
  endX: number,
  endY: number,
) {
  if (!start) {
    return;
  }

  const surfaceRoot = getSelectionSurfaceRoot(start.surface);
  const currentSelection = window.getSelection();
  const currentRange =
    currentSelection && currentSelection.rangeCount > 0
      ? currentSelection.getRangeAt(0)
      : null;
  const currentText = currentSelection?.toString().trim() ?? "";

  if (
    currentText &&
    currentRange &&
    surfaceRoot &&
    surfaceRoot.contains(currentRange.startContainer) &&
    surfaceRoot.contains(currentRange.endContainer)
  ) {
    return;
  }

  const fallbackRange = createFallbackSelectionRange(start, endX, endY);

  if (!fallbackRange || !fallbackRange.toString().trim()) {
    return;
  }

  currentSelection?.removeAllRanges();
  currentSelection?.addRange(fallbackRange);
}

function createFallbackSelectionRange(
  start: TextSelectionStart,
  endX: number,
  endY: number,
): Range | null {
  const surfaceRoot = getSelectionSurfaceRoot(start.surface);

  if (!surfaceRoot) {
    return null;
  }

  const startPoint =
    start.point && surfaceRoot.contains(start.point.node)
      ? start.point
      : getNearestTextPointInSurface(start.surface, start.startX, start.startY);

  const endPoint =
    getSurfaceCaretPointFromViewportPoint(start.surface, endX, endY) ??
    getNearestTextPointInSurface(start.surface, endX, endY);

  if (
    !startPoint ||
    !endPoint ||
    !surfaceRoot.contains(startPoint.node) ||
    !surfaceRoot.contains(endPoint.node)
  ) {
    return null;
  }

  const preciseRange = createOrderedRange(startPoint, endPoint);

  if (preciseRange?.toString().trim()) {
    return preciseRange;
  }

  const fallbackStartPoint = getNearestTextPointInSurface(
    start.surface,
    start.startX,
    start.startY,
  );
  const fallbackEndPoint = getNearestTextPointInSurface(start.surface, endX, endY);

  if (!fallbackStartPoint || !fallbackEndPoint) {
    return null;
  }

  return createOrderedRange(fallbackStartPoint, fallbackEndPoint);
}

function getSelectionSurfaceRoot(surface: TextSelectionSurface): Element | null {
  void surface;

  return document.querySelector(".markdown-rendered-document");
}

function getSurfaceCaretPointFromViewportPoint(
  surface: TextSelectionSurface,
  x: number,
  y: number,
): TextPoint | null {
  const point = getCaretPointFromViewportPoint(x, y);
  const surfaceRoot = getSelectionSurfaceRoot(surface);

  if (!point || !surfaceRoot || !surfaceRoot.contains(point.node)) {
    return null;
  }

  return point;
}

function getCaretPointFromViewportPoint(x: number, y: number): TextPoint | null {
  const caretDocument = document as Document & {
    caretPositionFromPoint?(
      x: number,
      y: number,
    ): { offset: number; offsetNode: Node } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(x, y);

  if (position) {
    return {
      node: position.offsetNode,
      offset: position.offset,
    };
  }

  const range = caretDocument.caretRangeFromPoint?.(x, y);

  if (range) {
    return {
      node: range.startContainer,
      offset: range.startOffset,
    };
  }

  return null;
}

function getNearestTextPointInSurface(
  surface: TextSelectionSurface,
  x: number,
  y: number,
): TextPoint | null {
  void surface;
  const surfaceRoot = getSelectionSurfaceRoot(surface);

  if (!surfaceRoot) {
    return null;
  }

  const candidates = Array.from(
    surfaceRoot.querySelectorAll<HTMLElement>(
      "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, code",
    ),
  ).filter((element) => (element.textContent?.trim().length ?? 0) > 0);

  const nearest = candidates
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const verticalDistance =
        y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const centerDistance = Math.abs(y - (rect.top + rect.height / 2));

      return {
        element,
        rect,
        score: verticalDistance * 1000 + centerDistance,
      };
    })
    .sort((left, right) => left.score - right.score)[0];

  if (!nearest) {
    return null;
  }

  return getElementTextBoundaryPoint(
    nearest.element,
    x >= nearest.rect.left + nearest.rect.width / 2 ? "end" : "start",
  );
}

function getElementTextBoundaryPoint(
  element: Element,
  boundary: "start" | "end",
): TextPoint | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let firstTextNode: Node | null = null;
  let lastTextNode: Node | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (!firstTextNode) {
      firstTextNode = node;
    }

    lastTextNode = node;
  }

  if (boundary === "start") {
    return firstTextNode ? { node: firstTextNode, offset: 0 } : null;
  }

  return lastTextNode
    ? {
        node: lastTextNode,
        offset: lastTextNode.textContent?.length ?? 0,
      }
    : null;
}

function createOrderedRange(startPoint: TextPoint, endPoint: TextPoint): Range | null {
  const forwardRange = document.createRange();

  try {
    forwardRange.setStart(startPoint.node, startPoint.offset);
    forwardRange.setEnd(endPoint.node, endPoint.offset);
  } catch {
    return null;
  }

  if (!forwardRange.collapsed) {
    return forwardRange;
  }

  const backwardRange = document.createRange();

  try {
    backwardRange.setStart(endPoint.node, endPoint.offset);
    backwardRange.setEnd(startPoint.node, startPoint.offset);
  } catch {
    return null;
  }

  return backwardRange.collapsed ? null : backwardRange;
}

function createSelectionSnapshot(
  range: Range,
  selectedText = range.toString(),
): SelectionSnapshot | null {
  const root = document.querySelector(".markdown-rendered-document");
  const text = selectedText;

  if (!root || !text.trim()) {
    return null;
  }

  const startOffset = getTextOffsetInRoot(
    root,
    range.startContainer,
    range.startOffset,
  );
  const endOffset = getTextOffsetInRoot(root, range.endContainer, range.endOffset);

  if (startOffset === null || endOffset === null || startOffset === endOffset) {
    return null;
  }

  return {
    endOffset: Math.max(startOffset, endOffset),
    startOffset: Math.min(startOffset, endOffset),
    text,
  };
}

function restoreSelectionSnapshot(snapshot: SelectionSnapshot | null): boolean {
  const root = document.querySelector(".markdown-rendered-document");
  const snapshotText = snapshot?.text.trim() ?? "";

  if (!root || !snapshot || !snapshotText) {
    return false;
  }

  const range = createRangeFromTextOffsets(
    root,
    snapshot.startOffset,
    snapshot.endOffset,
  );

  if (!range || range.toString().trim() !== snapshotText) {
    return false;
  }

  const selection = window.getSelection();
  const currentText = selection?.toString().trim() ?? "";

  if (currentText === snapshotText) {
    return true;
  }

  try {
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    return false;
  }

  return window.getSelection()?.toString().trim() === snapshotText;
}

function getTextOffsetInRoot(
  root: Element,
  targetNode: Node,
  targetOffset: number,
): number | null {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node === targetNode) {
      return offset + targetOffset;
    }

    offset += node.textContent?.length ?? 0;
  }

  return null;
}

function createRangeFromTextOffsets(
  root: Element,
  startOffset: number,
  endOffset: number,
): Range | null {
  const startPoint = findTextPointInRoot(root, startOffset);
  const endPoint = findTextPointInRoot(root, endOffset);

  if (!startPoint || !endPoint) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);

  return range;
}

function findTextPointInRoot(
  root: Element,
  targetOffset: number,
): { node: Node; offset: number } | null {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const textLength = node.textContent?.length ?? 0;
    const nextOffset = offset + textLength;

    if (targetOffset <= nextOffset) {
      return {
        node,
        offset: Math.max(0, Math.min(textLength, targetOffset - offset)),
      };
    }

    offset = nextOffset;
  }

  return null;
}

function clearWindowSelection() {
  window.getSelection()?.removeAllRanges();
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function decodeCopyCode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function LeftArrowIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M614.213818 71.819636a58.181818 58.181818 0 0 1 77.940364 86.318546l-3.095273 2.792727-379.880727 319.092364a34.909091 34.909091 0 0 0-4.282182 49.198545l1.861818 2.024727 1.978182 1.861819 381.021091 330.589091A58.181818 58.181818 0 0 1 616.750545 954.181818l-3.258181-2.629818L232.494545 621.032727a151.272727 151.272727 0 0 1-2.56-226.280727l4.398546-3.816727L614.213818 71.819636z"
        fill="currentColor"
      />
    </svg>
  );
}

function RightArrowIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M392.308364 71.819636a58.181818 58.181818 0 0 0-77.917091 86.318546l3.072 2.792727 379.904 319.092364a34.909091 34.909091 0 0 1 4.258909 49.198545l-1.838546 2.024727-2.001454 1.861819L316.741818 863.720727A58.181818 58.181818 0 0 0 389.818182 954.181818l3.234909-2.629818 380.997818-330.542545a151.272727 151.272727 0 0 0 2.56-226.280728l-4.375273-3.816727L392.308364 71.819636z"
        fill="currentColor"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M912 17.28H340.48a96 96 0 0 0-96 96v83.2h64v-83.2a32 32 0 0 1 32-32h571.52a32 32 0 0 1 32 32v650.88a31.36 31.36 0 0 1-32 31.36h-164.48v64h164.48a96 96 0 0 0 96-95.36V113.28a96 96 0 0 0-96-96z"
        fill="currentColor"
      />
      <path
        d="M683.52 1006.72H112a96 96 0 0 1-96-96V259.84a96 96 0 0 1 96-95.36h571.52a96 96 0 0 1 96 95.36v650.88a96 96 0 0 1-96 96zM112 228.48a31.36 31.36 0 0 0-32 31.36v650.88a32 32 0 0 0 32 32h571.52a32 32 0 0 0 32-32V259.84a32 32 0 0 0-32-31.36z"
        fill="currentColor"
      />
      <path
        d="M603.52 423.68H192a32 32 0 0 1-32-32 32 32 0 0 1 32-32h411.52a32 32 0 0 1 32 32 32 32 0 0 1-32 32zM603.52 617.6H192a32 32 0 0 1 0-64h411.52a32 32 0 0 1 0 64zM603.52 810.88H192a32 32 0 0 1-32-32 32 32 0 0 1 32-32h411.52a32 32 0 0 1 32 32 32 32 0 0 1-32 32z"
        fill="currentColor"
      />
    </svg>
  );
}

function PdfExportIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M945.347 615.848c-19.88-23.607-60.647-35.084-124.629-35.084-37.19 0-82.116 3.928-133.603 11.676C546.488 489.619 507.222 376.188 507.222 376.188s24.018-61.146 25.542-161.012c0.964-63.13-8.813-105.715-34.07-130.455-9.818-9.617-26.287-15.831-41.957-15.831-12.23 0-23.682 3.592-33.066 10.459-73.106 53.494 6.71 305.676 8.846 312.394-34.5 84.906-77.96 174.858-122.691 253.899-14.534 25.68-13.117 23.672-25.37 44.555 0 0-123.713 58.109-183.721 129.479-33.905 40.328-38.191 67.553-36.391 88.301l0.045 0.453c2.856 24.432 34.133 46.68 65.62 46.68 1.306 0 2.62-0.039 3.907-0.119 32.001-1.975 67.069-24.713 107.207-69.516 26.493-29.576 60.922-81.609 102.377-154.715 118.939-33.834 223.61-57.932 311.331-71.676 64.329 34.619 160.036 73.824 225.187 73.824 21.854 0 39.435-4.455 52.252-13.242 15.336-10.508 21.849-23.604 25.896-47.85C962.215 647.572 956.58 629.186 945.347 615.848zM806.399 645.367c57.181 0 88.141 8.314 104.046 15.289 4.905 2.152 8.473 4.227 11.005 5.961-4.483 2.863-13.298 6.479-29.23 6.479-26.418 0-61.092-9.225-103.384-27.479C794.852 645.451 800.709 645.367 806.399 645.367zM467.511 119.504c0.04-0.075 0.084-0.153 0.134-0.234 12.266 6.459 17.99 51.818 16.84 78.119-1.543 35.295-1.909 48.933-8.106 70.617C459.581 222.799 458.389 141.54 467.511 119.504zM471.997 477.314c28.844 46.842 71.622 97.577 112.835 133.801-80.44 17.002-157.675 38.313-205.733 54.898C430.612 578.049 468.615 486.032 471.997 477.314zM140.913 881.24c6.979-11.625 26.047-34.15 74.404-77.707-33.146 49.852-57.493 76.998-82.194 93.93C135.168 892.125 137.741 886.525 140.913 881.24z"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm7.4-3.5a7.8 7.8 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a8.2 8.2 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a8.2 8.2 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a8.2 8.2 0 0 0 2 1.2l.4 2.6h5l.4-2.6a8.2 8.2 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z"
      />
    </svg>
  );
}
