import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = resolve(import.meta.dirname, "..");
const qaUrl = "http://127.0.0.1:1420/tools/reader-ui-qa.html";
const chromePath = resolve(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright",
  "chromium-1228",
  "chrome-win64",
  "chrome.exe",
);
const outputDir = resolve(repoRoot, "output", "playwright");

const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "min-reader-hidpi", width: 1320, height: 560, deviceScaleFactor: 2 },
];

const MIN_READING_CARD_WIDTH = 880;

async function main() {
  const viteProcess = await ensureViteServer();
  let chromeProcess;
  let cdp;

  try {
    assert.ok(
      existsSync(chromePath),
      `Missing local Chromium at ${chromePath}. Install Playwright Chromium or keep the machine cache available.`,
    );

    await mkdir(outputDir, { recursive: true });
    const debuggingPort = await findAvailablePort(9433);
    const profileDir = resolve(
      process.env.TEMP ?? repoRoot,
      "only-md-reader-reader-qa-chrome",
    );
    chromeProcess = spawn(
      chromePath,
      [
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${profileDir}`,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    const page = await connectToPage(debuggingPort);
    cdp = new CdpConnection(page.webSocketDebuggerUrl);

    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");

    const results = [];
    for (const viewport of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: false,
      });
      await cdp.send("Page.navigate", { url: qaUrl });
      await waitForDomContentLoaded(cdp);
      await waitForExpression(
        cdp,
        "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true && document.querySelectorAll('.reader-preview-outline-item').length >= 2",
        20_000,
      );
      await waitForAnimationFrames(cdp, 2);

      const health = await evaluate(cdp, () => ({
        title: document.title,
        bodyTextLength: document.body.textContent?.length ?? 0,
        hasViteOverlay: Boolean(document.querySelector("vite-error-overlay")),
      }));
      assert.equal(health.title, "Only MD Reader Reader QA");
      assert.ok(health.bodyTextLength > 200, "Reader QA page rendered blank content");
      assert.equal(health.hasViteOverlay, false);

      const initialLayout = await collectLayout(cdp);
      assert.equal(initialLayout.markdownError, false);
      assert.equal(initialLayout.hasOutline, true);
      assert.equal(initialLayout.hasReadingCard, true);
      assert.equal(initialLayout.hasCodeBlock, true);
      assert.equal(initialLayout.hasMathError, true);
      assert.equal(initialLayout.hasTableScroller, true);
      assert.equal(initialLayout.hasHorizontalDocumentOverflow, false);
      assert.equal(initialLayout.outlineFitsViewport, true);
      assert.equal(initialLayout.readingFitsViewport, true);
      assert.equal(initialLayout.settingsFitsViewport, true);
      assert.equal(
        initialLayout.usesTwoColumnCards,
        true,
        "reader outline and reading cards must remain side-by-side at every QA viewport",
      );
      assert.ok(
        initialLayout.readingCardWidth >= MIN_READING_CARD_WIDTH,
        `reading card is too narrow for the approved reader layout: ${initialLayout.readingCardWidth}px`,
      );
      assert.match(initialLayout.readerBodyFontVariable, /Georgia/);
      assert.match(initialLayout.markdownFontFamily, /Georgia/);
      assert.equal(initialLayout.outlineFontFamily, initialLayout.markdownFontFamily);
      assert.equal(
        initialLayout.outlineItemFontFamily,
        initialLayout.markdownFontFamily,
      );
      assert.match(initialLayout.readerCodeFontVariable, /Consolas/);
      assert.match(initialLayout.indentedCodeFontFamily, /Consolas/);
      assert.equal(initialLayout.indentedCodeHasReaderClass, true);
      assert.equal(initialLayout.indentedCodeCopyButtonExists, true);
      assert.equal(initialLayout.longCodeScrollerHasHorizontalOverflow, true);
      assert.equal(initialLayout.tableLayoutMode, "fixed");
      assert.equal(initialLayout.tableCellWhiteSpace, "normal");
      assert.equal(initialLayout.tableCellOverflowWrap, "anywhere");
      assert.equal(initialLayout.tableCellWordBreak, "break-word");
      assert.equal(initialLayout.tableFitsWrapper, true);
      assert.equal(initialLayout.longTableCellWrapped, true);
      assert.equal(initialLayout.outlineToggleVisible, true);
      assert.equal(initialLayout.outlineToggleIconSize.width, 16);
      assert.equal(initialLayout.outlineToggleIconSize.height, 16);
      assert.equal(initialLayout.outlineToggleBackground, "rgba(0, 0, 0, 0)");
      assert.ok(
        Math.abs(initialLayout.outlineToggleCenterX - initialLayout.cardGapCenterX) <=
          1,
        `hide-outline rail button should sit in the middle of the card gap: button=${initialLayout.outlineToggleCenterX}, gap=${initialLayout.cardGapCenterX}`,
      );
      assert.equal(initialLayout.selectionCopyBubbleVisible, false);
      assert.equal(initialLayout.codeCopyButtonVisible, true);
      assert.equal(initialLayout.codeCopyButtonSize.width, 24);
      assert.equal(initialLayout.codeCopyButtonSize.height, 24);
      assert.equal(initialLayout.codeCopyIconSize.width, 18);
      assert.equal(initialLayout.codeCopyIconSize.height, 18);
      assert.equal(initialLayout.codeCopyButtonBackground, "rgba(0, 0, 0, 0)");
      assert.equal(
        initialLayout.longOutlineTextExists,
        true,
        "long outline headings need a real text element so ellipsis works inside flex rows",
      );
      assert.equal(initialLayout.longOutlineTextOverflowStyle, "hidden");
      assert.equal(initialLayout.longOutlineTextOverflowX, "hidden");
      assert.equal(initialLayout.longOutlineTextOverflowY, "hidden");
      assert.equal(initialLayout.longOutlineTextOverflowMode, "ellipsis");
      assert.equal(initialLayout.longOutlineTextWhiteSpace, "nowrap");
      assert.equal(
        initialLayout.longOutlineTextIsTruncated,
        true,
        `long outline heading should be ellipsized: ${JSON.stringify(initialLayout.longOutlineTextMetrics)}`,
      );
      assert.equal(
        initialLayout.longOutlineTextStaysInsideItem,
        true,
        `long outline heading spilled outside the selected row: ${JSON.stringify(initialLayout.longOutlineTextMetrics)}`,
      );
      assert.equal(
        initialLayout.longOutlineTextStaysInsideCard,
        true,
        `long outline heading spilled outside the outline card: ${JSON.stringify(initialLayout.longOutlineTextMetrics)}`,
      );
      assert.deepEqual(initialLayout.outlineDepthValues, [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
      ]);
      assert.equal(
        initialLayout.outlineDepthLeftEdgesIncrease,
        true,
        "outline h1-h6 rows should keep distinct increasing visual depth",
      );

      await evaluate(cdp, () => {
        const image = document.querySelector("img.markdown-image");
        image?.dispatchEvent(new Event("error", { bubbles: false }));
      });
      await waitForExpression(
        cdp,
        "document.querySelector('img.markdown-image')?.dataset.loadState === 'failed'",
        10_000,
      );

      await evaluate(cdp, () => {
        document.querySelector(".reader-preview-settings-button")?.click();
      });
      await waitForExpression(cdp, "window.__qaReaderSettingsOpened === 1", 10_000);

      await evaluate(cdp, () => {
        const scroller = document.querySelector(".reader-preview-scroll");
        scroller.scrollTop = 720;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await waitForExpression(
        cdp,
        "Array.isArray(window.__qaSavedWindowStates) && window.__qaSavedWindowStates.length > 0",
        10_000,
      );

      const interaction = await evaluate(cdp, () => {
        const image = document.querySelector("img.markdown-image");
        const latestState = window.__qaSavedWindowStates?.at(-1);

        return {
          failedImageState: image?.dataset.loadState,
          failedImageClass: image?.classList.contains("markdown-image-fallback"),
          failedImageAlt: image?.getAttribute("alt"),
          settingsOpened: window.__qaReaderSettingsOpened,
          savedState: latestState,
        };
      });

      assert.equal(interaction.failedImageState, "failed");
      assert.equal(interaction.failedImageClass, true);
      assert.match(interaction.failedImageAlt ?? "", /加载失败/);
      assert.equal(interaction.settingsOpened, 1);
      assert.ok(
        interaction.savedState?.scrollTop >= 700,
        "reader scroll should save the latest scroll position",
      );

      await evaluate(cdp, () => {
        document
          .querySelector(".markdown-rendered-document h1")
          ?.scrollIntoView({ block: "start", inline: "nearest" });
      });
      await waitForAnimationFrames(cdp, 2);
      await evaluate(cdp, () => {
        window.getSelection()?.removeAllRanges();
        const details = document.querySelector(".markdown-rendered-document details");
        if (details instanceof HTMLDetailsElement) {
          details.open = false;
        }
      });
      await waitForExpression(
        cdp,
        "!document.querySelector('.reader-preview-selection-copy-button')",
        10_000,
      );
      await evaluate(cdp, () => {
        document.querySelector(".markdown-rendered-document summary")?.click();
      });
      await waitForExpression(
        cdp,
        "document.querySelector('.markdown-rendered-document details')?.open === true",
        10_000,
      );
      await dragSelectElementText(cdp, ".markdown-rendered-document details p");
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && document.querySelector('.markdown-rendered-document details')?.open === true && window.getSelection()?.toString().includes('Details selectable text') === true",
        10_000,
      );
      const expandedDetailsSelection = await evaluate(cdp, () => ({
        detailsOpen: document.querySelector(".markdown-rendered-document details")
          ?.open,
        selectedText: window.getSelection()?.toString().trim() ?? "",
        bubbleVisible: Boolean(
          document.querySelector(".reader-preview-selection-copy-button"),
        ),
      }));
      assert.equal(expandedDetailsSelection.detailsOpen, true);
      assert.match(expandedDetailsSelection.selectedText, /Details selectable text/);
      assert.equal(expandedDetailsSelection.bubbleVisible, true);

      await evaluate(cdp, () => {
        window.getSelection()?.removeAllRanges();
        const details = document.querySelector(".markdown-rendered-document details");
        if (details instanceof HTMLDetailsElement) {
          details.open = false;
        }
      });
      await waitForExpression(
        cdp,
        "!document.querySelector('.reader-preview-selection-copy-button')",
        10_000,
      );
      await waitForAnimationFrames(cdp, 2);
      await dragSelectAcrossBlocksToRightWhitespaceByText(
        cdp,
        "Details boundary before",
        "Details boundary after",
      );
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && document.querySelector('.markdown-rendered-document details')?.open === false",
        10_000,
      );
      const collapsedDetailsSelection = await evaluate(cdp, () => ({
        detailsOpen: document.querySelector(".markdown-rendered-document details")
          ?.open,
        selectedText: window.getSelection()?.toString().trim() ?? "",
        copiedText: (() => {
          const writes = [];
          const copyEvent = new Event("copy", {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperty(copyEvent, "clipboardData", {
            value: {
              setData(type, value) {
                writes.push({ type, value });
              },
            },
          });
          document.dispatchEvent(copyEvent);

          return writes.find((write) => write.type === "text/plain")?.value ?? "";
        })(),
      }));
      assert.equal(collapsedDetailsSelection.detailsOpen, false);
      assert.match(
        collapsedDetailsSelection.selectedText,
        /Details boundary before paragraph/,
      );
      assert.match(
        collapsedDetailsSelection.selectedText,
        /Details boundary after paragraph/,
      );
      assert.doesNotMatch(
        collapsedDetailsSelection.copiedText,
        /Details hidden text must never join/,
      );
      assert.match(
        collapsedDetailsSelection.copiedText,
        /Details boundary before paragraph/,
      );
      assert.match(
        collapsedDetailsSelection.copiedText,
        /Details boundary after paragraph/,
      );

      await evaluate(cdp, () => {
        window.getSelection()?.removeAllRanges();
      });
      await waitForExpression(
        cdp,
        "!document.querySelector('.reader-preview-selection-copy-button') && (window.getSelection()?.toString().trim() ?? '') === ''",
        10_000,
      );

      await evaluate(cdp, () => {
        const scroller = document.querySelector(".reader-preview-scroll");
        const target = document.querySelector("#long-section");

        if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) {
          return;
        }

        scroller.scrollTop = Math.max(0, target.offsetTop - 52);
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-outline-item[data-current=\"true\"]')?.textContent?.trim() === 'Long Section'",
        10_000,
      );

      const activeHeadingSync = await evaluate(cdp, () => {
        const scroller = document.querySelector(".reader-preview-scroll");
        const target = document.querySelector("#long-section");

        const activeOutlineItem = document.querySelector(
          '.reader-preview-outline-item[data-current="true"]',
        );

        return {
          activeText: activeOutlineItem?.textContent?.trim(),
          scrollTop: scroller.scrollTop,
          targetTop: target.offsetTop,
        };
      });

      assert.equal(activeHeadingSync?.activeText, "Long Section");

      await evaluate(cdp, () => {
        window.__qaClipboardWrites = [];
        window.__qaOpenedExternalLinks = [];
        window.open = (url, target, features) => {
          window.__qaOpenedExternalLinks.push({
            features,
            target,
            url: String(url),
          });
          return null;
        };
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText(text) {
              window.__qaClipboardWrites.push(text);
              return Promise.resolve();
            },
          },
        });
      });

      await evaluate(cdp, () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "F11",
          }),
        );
      });
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-layout')?.dataset.outlineHidden === 'true' && document.querySelector('.reader-preview-outline-card')?.dataset.hidden === 'true' && document.querySelector('.reader-preview-outline-card')?.getBoundingClientRect().width <= 1",
        10_000,
      );

      const immersiveHidden = await collectLayout(cdp);
      assert.equal(immersiveHidden.outlineHidden, true);
      assert.equal(immersiveHidden.hasOutlineCard, true);
      assert.ok(
        immersiveHidden.outlineCardWidth <= 1,
        `hidden outline card should collapse to zero width, got ${immersiveHidden.outlineCardWidth}px`,
      );
      assert.equal(immersiveHidden.outlineToggleDirection, "show");
      assert.equal(immersiveHidden.outlineToggleVisible, true);
      assert.equal(immersiveHidden.outlineToggleBackground, "rgba(0, 0, 0, 0)");
      assert.equal(immersiveHidden.outlineToggleCenterX, 34);
      assert.equal(immersiveHidden.readingCardLeft, 18);
      assert.ok(
        immersiveHidden.readingCardWidth > initialLayout.readingCardWidth,
        "reading card should expand into the hidden outline space",
      );

      await evaluate(cdp, () => {
        document.querySelector(".reader-preview-outline-rail-button")?.click();
      });
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-layout')?.dataset.outlineHidden === 'false' && Boolean(document.querySelector('.reader-preview-outline-card'))",
        10_000,
      );
      const immersiveShown = await collectLayout(cdp);
      assert.equal(immersiveShown.outlineHidden, false);
      assert.equal(immersiveShown.hasOutlineCard, true);
      assert.equal(immersiveShown.outlineToggleDirection, "hide");
      assert.equal(immersiveShown.outlineToggleVisible, true);
      assert.equal(
        immersiveShown.outlineToggleShadow,
        "none",
        "outline rail button should not draw a square shadow background",
      );
      assert.notEqual(
        immersiveShown.outlineToggleIconFilter,
        "none",
        "outline rail arrow glyph should keep its own shadow",
      );
      assert.equal(immersiveShown.outlineItemUserSelect, "none");
      assert.ok(
        immersiveShown.currentOutlineItemHeight <= 28,
        `current outline item is too tall: ${immersiveShown.currentOutlineItemHeight}px`,
      );
      assert.ok(
        immersiveShown.currentOutlineTextCenterOffset !== null &&
          Math.abs(immersiveShown.currentOutlineTextCenterOffset) <= 1,
        `current outline text should be vertically centered in the highlight: offset=${immersiveShown.currentOutlineTextCenterOffset}`,
      );
      assert.equal(
        immersiveShown.currentOutlineItemBorderRadius,
        "8px",
        "current outline highlight should use the tighter 8px radius",
      );
      assert.equal(
        immersiveShown.currentOutlineTextTransform,
        "none",
        "current outline text should not be vertically nudged inside the highlight",
      );
      assert.equal(
        immersiveShown.settingsRightInset,
        6,
        "reader settings gear should keep a 6px right inset so radius 16px plus inset equals the 22px card radius",
      );
      assert.equal(
        immersiveShown.settingsBottomInset,
        6,
        "reader settings gear should keep a 6px bottom inset so radius 16px plus inset equals the 22px card radius",
      );
      assert.equal(
        immersiveShown.settingsRadiusPlusInsetEqualsCardRadius,
        true,
        `settings gear should satisfy radius + inset = card radius: ${JSON.stringify(immersiveShown.settingsRadiusBalance)}`,
      );

      await evaluate(cdp, () => {
        const scroller = document.querySelector(".reader-preview-scroll");
        const target = document.querySelector("#图片");

        if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) {
          return;
        }

        scroller.scrollTop = Math.max(0, target.offsetTop - 52);
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-outline-item[data-current=\"true\"]')?.textContent?.trim() === '图片'",
        10_000,
      );
      const chineseActiveHeading = await collectLayout(cdp);
      assert.ok(
        chineseActiveHeading.currentOutlineTextCenterOffset !== null &&
          Math.abs(chineseActiveHeading.currentOutlineTextCenterOffset) <= 1,
        `Chinese current outline text should be vertically centered in the highlight: offset=${chineseActiveHeading.currentOutlineTextCenterOffset}`,
      );

      const beforeLinkClickUrl = await evaluate(cdp, () => location.href);
      await evaluate(cdp, () => {
        const link = Array.from(
          document.querySelectorAll(".markdown-rendered-document a"),
        ).find((element) => element.textContent?.includes("Open external reader link"));
        link?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      await waitForExpression(
        cdp,
        "window.__qaOpenedExternalLinks?.some((entry) => entry.url === 'https://example.com/only-md-reader-link' && entry.target === '_blank') === true",
        10_000,
      );
      const linkClick = await evaluate(cdp, () => ({
        href: location.href,
        opened: window.__qaOpenedExternalLinks?.at(-1),
      }));
      assert.equal(
        linkClick.href,
        beforeLinkClickUrl,
        "markdown links should not navigate the reader WebView",
      );
      assert.deepEqual(linkClick.opened, {
        features: "noopener,noreferrer",
        target: "_blank",
        url: "https://example.com/only-md-reader-link",
      });

      await evaluate(cdp, () => {
        window.__qaOpenedExternalLinks = [];
        const scroller = document.querySelector(".reader-preview-scroll");
        if (scroller instanceof HTMLElement) {
          scroller.scrollTop = 0;
          scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
      });
      await evaluate(cdp, () => {
        document
          .querySelector('.markdown-rendered-document a[href^="#user-content-fn-"]')
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-scroll')?.scrollTop > 0",
        10_000,
      );
      const footnoteJump = await evaluate(cdp, () => {
        const scroller = document.querySelector(".reader-preview-scroll");
        const target = document.querySelector("#user-content-fn-reader-note");
        const scrollerRect = scroller?.getBoundingClientRect();
        const targetRect = target?.getBoundingClientRect();
        const maxScrollTop =
          scroller instanceof HTMLElement
            ? scroller.scrollHeight - scroller.clientHeight
            : 0;
        return {
          externalOpenCount: window.__qaOpenedExternalLinks?.length ?? 0,
          maxScrollTop,
          targetTopDelta:
            scrollerRect && targetRect ? targetRect.top - scrollerRect.top : null,
          scrollTop: scroller?.scrollTop ?? 0,
          targetOffset: target?.offsetTop ?? 0,
        };
      });
      assert.equal(
        footnoteJump.externalOpenCount,
        0,
        "footnote reference clicks should stay inside the reader document",
      );
      assert.ok(
        footnoteJump.targetTopDelta !== null &&
          (Math.abs(footnoteJump.targetTopDelta) <= 2 ||
            footnoteJump.scrollTop >= footnoteJump.maxScrollTop - 2),
        `footnote reference should scroll to footnote target: ${JSON.stringify(footnoteJump)}`,
      );

      await evaluate(cdp, () => {
        window.__qaOpenedExternalLinks = [];
        document
          .querySelector('.markdown-rendered-document a[href^="#user-content-fnref-"]')
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      await waitForExpression(
        cdp,
        "(() => { const scroller = document.querySelector('.reader-preview-scroll'); const target = document.querySelector('#user-content-fnref-reader-note'); const scrollerRect = scroller?.getBoundingClientRect(); const targetRect = target?.getBoundingClientRect(); if (!(scroller instanceof HTMLElement) || !scrollerRect || !targetRect) return false; const maxScrollTop = scroller.scrollHeight - scroller.clientHeight; return Math.abs(targetRect.top - scrollerRect.top) <= 2 || scroller.scrollTop >= maxScrollTop - 2; })()",
        10_000,
      );
      const footnoteBackJump = await evaluate(cdp, () => {
        const scroller = document.querySelector(".reader-preview-scroll");
        const target = document.querySelector("#user-content-fnref-reader-note");
        const scrollerRect = scroller?.getBoundingClientRect();
        const targetRect = target?.getBoundingClientRect();
        const maxScrollTop =
          scroller instanceof HTMLElement
            ? scroller.scrollHeight - scroller.clientHeight
            : 0;
        return {
          externalOpenCount: window.__qaOpenedExternalLinks?.length ?? 0,
          maxScrollTop,
          targetTopDelta:
            scrollerRect && targetRect ? targetRect.top - scrollerRect.top : null,
          scrollTop: scroller?.scrollTop ?? 0,
          targetOffset: target?.offsetTop ?? 0,
        };
      });
      assert.equal(
        footnoteBackJump.externalOpenCount,
        0,
        "footnote back-reference clicks should stay inside the reader document",
      );
      assert.ok(
        footnoteBackJump.targetTopDelta !== null &&
          (Math.abs(footnoteBackJump.targetTopDelta) <= 2 ||
            footnoteBackJump.scrollTop >= footnoteBackJump.maxScrollTop - 2),
        `footnote back-reference should scroll to original reference: ${JSON.stringify(footnoteBackJump)}`,
      );

      await evaluate(cdp, () => {
        document
          .querySelector('.reader-preview-outline-item[data-current="true"]')
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
      await waitForAnimationFrames(cdp, 2);
      await waitForExpression(
        cdp,
        `(() => {
          const target = document.querySelector('.reader-preview-outline-item[data-current="true"]');
          const rect = target?.getBoundingClientRect();
          if (!target || !rect) return false;
          const x = rect.left + Math.min(rect.width - 4, 260);
          const y = rect.top + rect.height / 2;
          return document.elementFromPoint(x, y) === target;
        })()`,
        10_000,
      );
      await dragSelectElementText(
        cdp,
        '.reader-preview-outline-item[data-current="true"]',
      );
      await waitForAnimationFrames(cdp, 2);
      const outlineSelection = await evaluate(cdp, () => ({
        selectedText: window.getSelection()?.toString().trim() ?? "",
        bubbleVisible: Boolean(
          document.querySelector(".reader-preview-selection-copy-button"),
        ),
      }));
      assert.equal(outlineSelection.selectedText, "");
      assert.equal(outlineSelection.bubbleVisible, false);

      await evaluate(cdp, () => {
        document
          .querySelector("#long-section")
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
      await waitForAnimationFrames(cdp, 2);
      await waitForExpression(
        cdp,
        `(() => {
          const target = document.querySelector("#long-section");
          const rect = target?.getBoundingClientRect();
          if (!target || !rect) return false;
          const x = rect.left + Math.min(rect.width - 4, 260);
          const y = rect.top + rect.height / 2;
          return document.elementFromPoint(x, y) === target;
        })()`,
        10_000,
      );
      await dragSelectElementText(cdp, "#long-section");
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && window.getSelection()?.toString().trim().length > 0",
        10_000,
      );
      const selectionBubble = await evaluate(cdp, () => {
        const bubble = document.querySelector(".reader-preview-selection-copy-button");
        const rect = bubble.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
        };
      });
      const renderedSelectionText = await evaluate(
        cdp,
        () => window.getSelection()?.toString().trim() ?? "",
      );
      assert.match(renderedSelectionText, /Long Section/);
      assert.deepEqual(
        { width: selectionBubble.width, height: selectionBubble.height },
        { width: 32, height: 32 },
      );

      await evaluate(cdp, () => {
        document.querySelector(".reader-preview-selection-copy-button")?.click();
      });
      await waitForExpression(
        cdp,
        "window.__qaClipboardWrites?.some((text) => text.includes('Long Section')) === true && !document.querySelector('.reader-preview-selection-copy-button')",
        10_000,
      );

      await evaluate(cdp, () => {
        document
          .querySelector(".markdown-rendered-document h1")
          ?.scrollIntoView({ block: "start", inline: "nearest" });
      });
      await waitForAnimationFrames(cdp, 2);
      await dragSelectElementTextByText(
        cdp,
        ".markdown-rendered-document p",
        "普通段落",
      );
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && (window.getSelection()?.toString().trim().length ?? 0) >= 8",
        10_000,
      );
      const chineseParagraphSelection = await evaluate(
        cdp,
        () => window.getSelection()?.toString().trim() ?? "",
      );
      assert.match(chineseParagraphSelection, /普通段落/);

      await evaluate(cdp, () => {
        document.querySelector(".reader-preview-selection-copy-button")?.click();
      });
      await waitForExpression(
        cdp,
        "!document.querySelector('.reader-preview-selection-copy-button')",
        10_000,
      );

      await dragSelectAcrossBlocksToRightWhitespace(
        cdp,
        ".markdown-rendered-document li:first-of-type",
        ".markdown-rendered-document li:nth-of-type(2)",
      );
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && window.getSelection()?.toString().includes('Copy bubble anchor line one') === true && window.getSelection()?.toString().includes('Copy bubble anchor line two') === true",
        10_000,
      );
      const listSelectionBubbleAnchor = await evaluate(cdp, () => {
        const bubble = document.querySelector(".reader-preview-selection-copy-button");
        const selection = window.getSelection();
        const range =
          selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const textRects = range
          ? Array.from(range.getClientRects()).filter(
              (rect) => rect.width > 0 && rect.height > 0,
            )
          : [];
        const lastTextRect = textRects.at(-1);
        const bubbleRect = bubble?.getBoundingClientRect();
        const bubbleStyle = bubble ? getComputedStyle(bubble) : null;
        const bubbleIconRect = bubble?.querySelector("svg")?.getBoundingClientRect();

        return {
          bubbleLeft: Math.round(bubbleRect?.left ?? 0),
          bubbleTop: Math.round(bubbleRect?.top ?? 0),
          lastTextRight: Math.round(lastTextRect?.right ?? 0),
          lastTextBottom: Math.round(lastTextRect?.bottom ?? 0),
          boxShadow: bubbleStyle?.boxShadow ?? "",
          iconWidth: Math.round(bubbleIconRect?.width ?? 0),
          iconHeight: Math.round(bubbleIconRect?.height ?? 0),
          viewportWidth: window.innerWidth,
        };
      });
      assert.ok(
        listSelectionBubbleAnchor.bubbleLeft > listSelectionBubbleAnchor.lastTextRight,
        `copy bubble should sit after selected text: ${JSON.stringify(listSelectionBubbleAnchor)}`,
      );
      assert.ok(
        listSelectionBubbleAnchor.bubbleLeft -
          listSelectionBubbleAnchor.lastTextRight <=
          48,
        `copy bubble followed the pointer into right whitespace instead of the selected text: ${JSON.stringify(listSelectionBubbleAnchor)}`,
      );
      assert.ok(
        Math.abs(
          listSelectionBubbleAnchor.bubbleTop -
            (listSelectionBubbleAnchor.lastTextBottom + 8),
        ) <= 2,
        `copy bubble top should sit 8px below the selected text bottom edge: ${JSON.stringify(listSelectionBubbleAnchor)}`,
      );
      assert.notEqual(
        listSelectionBubbleAnchor.boxShadow,
        "none",
        "selection copy bubble should carry a visible shadow",
      );
      assert.match(
        listSelectionBubbleAnchor.boxShadow,
        /0px 18px 44px/,
        "selection copy bubble shadow should be visibly heavier",
      );
      assert.deepEqual(
        {
          width: listSelectionBubbleAnchor.iconWidth,
          height: listSelectionBubbleAnchor.iconHeight,
        },
        { width: 18, height: 18 },
      );

      await clickTextWithMinorPointerJitter(
        cdp,
        ".markdown-rendered-document p",
        "Intro paragraph",
      );
      await waitForExpression(
        cdp,
        "!document.querySelector('.reader-preview-selection-copy-button') && (window.getSelection()?.toString().trim() ?? '') === ''",
        10_000,
      );

      await dragSelectAcrossBlocks(
        cdp,
        ".markdown-rendered-document h1",
        ".markdown-rendered-document p",
      );
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && window.getSelection()?.toString().includes('Reader QA Document') === true && window.getSelection()?.toString().includes('Intro paragraph') === true",
        10_000,
      );
      await delay(1_200);
      const delayedBlockSelection = await evaluate(
        cdp,
        () => window.getSelection()?.toString().trim() ?? "",
      );
      assert.match(delayedBlockSelection, /Reader QA Document/);
      assert.match(delayedBlockSelection, /Intro paragraph/);
      const storedSelectionCopy = await evaluate(cdp, () => {
        const writes = [];
        const copyEvent = new Event("copy", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(copyEvent, "clipboardData", {
          value: {
            setData(type, value) {
              writes.push({ type, value });
            },
          },
        });

        window.getSelection()?.removeAllRanges();
        document.dispatchEvent(copyEvent);

        return {
          defaultPrevented: copyEvent.defaultPrevented,
          writes,
        };
      });
      assert.equal(storedSelectionCopy.defaultPrevented, true);
      assert.ok(
        storedSelectionCopy.writes.some(
          (write) =>
            write.type === "text/plain" &&
            write.value.includes("Reader QA Document") &&
            write.value.includes("Intro paragraph"),
        ),
        "Ctrl+C fallback should copy the stored selected text if WebView clears the visible range",
      );

      await dragSelectTextToRightWhitespaceByText(
        cdp,
        ".markdown-rendered-document p",
        "选区压力段落",
      );
      await waitForExpression(
        cdp,
        "document.querySelector('.reader-preview-selection-copy-button')?.dataset.visible === 'true' && window.getSelection()?.toString().includes('选区压力段落') === true && window.getSelection()?.toString().includes('Selection stress paragraph') === true",
        10_000,
      );
      const whitespaceSelection = await evaluate(
        cdp,
        () => window.getSelection()?.toString().trim() ?? "",
      );
      assert.match(whitespaceSelection, /选区压力段落/);
      assert.match(whitespaceSelection, /Selection stress paragraph/);

      await dispatchWheelOver(cdp, ".reader-preview-scroll", 260);
      await waitForAnimationFrames(cdp, 2);
      const selectionAfterWheel = await evaluate(cdp, () => ({
        selectedText: window.getSelection()?.toString().trim() ?? "",
        bubbleVisible: Boolean(
          document.querySelector(".reader-preview-selection-copy-button"),
        ),
      }));
      assert.equal(selectionAfterWheel.selectedText, "");
      assert.equal(selectionAfterWheel.bubbleVisible, false);

      await evaluate(cdp, () => {
        const codeScroller = Array.from(
          document.querySelectorAll(".markdown-code-scroller"),
        ).find((scroller) => scroller.textContent?.includes("visibleCodeBlock"));
        codeScroller?.querySelector(".markdown-code-copy-button")?.click();
      });
      await waitForExpression(
        cdp,
        "window.__qaClipboardWrites?.some((text) => text.includes('visibleCodeBlock') && text.includes('code block remains readable')) === true",
        10_000,
      );

      const screenshot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      const screenshotPath = resolve(outputDir, `reader-ui-${viewport.name}.png`);
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

      results.push({
        viewport,
        screenshotPath,
        initialLayout,
        interaction,
      });
    }

    console.log(
      JSON.stringify(
        {
          status: "passed",
          url: qaUrl,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    cdp?.close();
    if (chromeProcess && !chromeProcess.killed) {
      killProcessTree(chromeProcess);
    }

    if (
      viteProcess.startedByScript &&
      viteProcess.process &&
      !viteProcess.process.killed
    ) {
      killProcessTree(viteProcess.process);
    }
  }
}

async function collectLayout(cdp) {
  return evaluate(cdp, () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const outline = document.querySelector(".reader-preview-outline-card");
    const outlineItem = document.querySelector(".reader-preview-outline-item");
    const currentOutlineItem = document.querySelector(
      '.reader-preview-outline-item[data-current="true"]',
    );
    const reading = document.querySelector(".reader-preview-reading-card");
    const layout = document.querySelector(".reader-preview-layout");
    const outlineToggle = document.querySelector(".reader-preview-outline-rail-button");
    const selectionCopyBubble = document.querySelector(
      ".reader-preview-selection-copy-button",
    );
    const codeCopyButton = document.querySelector(".markdown-code-copy-button");
    const codeCopyIcon = document.querySelector(".markdown-code-copy-icon");
    const codeScrollers = Array.from(
      document.querySelectorAll(".markdown-code-scroller"),
    );
    const indentedCodeBlock = Array.from(
      document.querySelectorAll(".markdown-code-block"),
    ).find((block) => block.textContent?.includes("API Error"));
    const indentedCodeScroller = indentedCodeBlock?.closest(".markdown-code-scroller");
    const indentedCodeCopyButton = indentedCodeScroller?.querySelector(
      ".markdown-code-copy-button",
    );
    const longCodeScroller = codeScrollers.find((scroller) =>
      scroller.textContent?.includes("visibleCodeBlock"),
    );
    const wrappingTable = Array.from(
      document.querySelectorAll(".markdown-table-wrapper table"),
    ).find((table) => table.textContent?.includes("破坏透传低延迟"));
    const wrappingTableWrapper = wrappingTable?.closest(".markdown-table-wrapper");
    const wrappingTableCell = Array.from(
      wrappingTable?.querySelectorAll("td") ?? [],
    ).find((cell) => cell.textContent?.includes("破坏透传低延迟"));
    const markdownDocument = document.querySelector(".markdown-rendered-document");
    const settings = document.querySelector(".reader-preview-settings-button");
    const documentElement = document.documentElement;
    const outlineDepthRows = Array.from(
      document.querySelectorAll(".reader-preview-outline-row"),
    ).filter((row) =>
      row
        .querySelector(".reader-preview-outline-item")
        ?.textContent?.startsWith("Outline Depth H"),
    );
    const outlineDepthLeftEdges = outlineDepthRows.map(
      (row) => row.getBoundingClientRect().left,
    );
    const outlineRect = outline?.getBoundingClientRect();
    const readingRect = reading?.getBoundingClientRect();
    const outlineToggleRect = outlineToggle?.getBoundingClientRect();
    const selectionCopyBubbleRect = selectionCopyBubble?.getBoundingClientRect();
    const codeCopyButtonRect = codeCopyButton?.getBoundingClientRect();
    const codeCopyIconRect = codeCopyIcon?.getBoundingClientRect();
    const settingsRect = settings?.getBoundingClientRect();
    const settingsStyle = settings ? getComputedStyle(settings) : null;
    const outlineToggleStyle = outlineToggle ? getComputedStyle(outlineToggle) : null;
    const codeCopyButtonStyle = codeCopyButton
      ? getComputedStyle(codeCopyButton)
      : null;
    const longOutlineItem = Array.from(
      document.querySelectorAll(".reader-preview-outline-item"),
    ).find((item) => item.textContent?.includes("Outline truncation sentinel heading"));
    const longOutlineText = longOutlineItem?.querySelector(
      ".reader-preview-outline-item-text",
    );
    const longOutlineTextStyle = longOutlineText
      ? getComputedStyle(longOutlineText)
      : null;
    const longOutlineItemRect = longOutlineItem?.getBoundingClientRect();
    const longOutlineTextRect = longOutlineText?.getBoundingClientRect();
    const longOutlineTextMetrics = {
      itemRight: Math.round(longOutlineItemRect?.right ?? 0),
      textRight: Math.round(longOutlineTextRect?.right ?? 0),
      cardRight: Math.round(outlineRect?.right ?? 0),
      clientWidth: longOutlineText?.clientWidth ?? 0,
      scrollWidth: longOutlineText?.scrollWidth ?? 0,
    };
    const wrappingTableCellTextLineCount = (() => {
      if (!wrappingTableCell) {
        return 0;
      }

      const range = document.createRange();
      range.selectNodeContents(wrappingTableCell);

      return Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      ).length;
    })();

    function fitsViewport(element) {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= viewportWidth &&
        rect.bottom <= viewportHeight
      );
    }

    function getTextCenterOffset(element) {
      if (!element) {
        return null;
      }

      const range = document.createRange();
      range.selectNodeContents(element);
      const textRect = Array.from(range.getClientRects()).find(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const elementRect = element.getBoundingClientRect();

      if (!textRect) {
        return null;
      }

      return (
        textRect.top + textRect.height / 2 - (elementRect.top + elementRect.height / 2)
      );
    }

    return {
      viewportWidth,
      viewportHeight,
      bodyTextLength: document.body.textContent?.length ?? 0,
      markdownError: Boolean(document.querySelector(".markdown-render-error")),
      hasOutline: document.querySelectorAll(".reader-preview-outline-item").length >= 2,
      hasOutlineCard: Boolean(outline),
      outlineHidden: layout?.dataset.outlineHidden === "true",
      outlineToggleDirection: outlineToggle?.getAttribute("data-direction") ?? "",
      outlineToggleVisible: Boolean(outlineToggle && fitsViewport(outlineToggle)),
      outlineToggleIconSize: {
        width: Math.round(outlineToggleRect?.width ?? 0),
        height: Math.round(outlineToggleRect?.height ?? 0),
      },
      outlineToggleBackground: outlineToggleStyle?.backgroundColor ?? "",
      outlineToggleShadow: outlineToggleStyle?.boxShadow ?? "",
      outlineToggleIconFilter: outlineToggle
        ? getComputedStyle(outlineToggle.querySelector("svg")).filter
        : "",
      outlineToggleCenterX: Math.round(
        (outlineToggleRect?.left ?? 0) + (outlineToggleRect?.width ?? 0) / 2,
      ),
      outlineDepthValues: outlineDepthRows.map((row) => row.getAttribute("data-depth")),
      outlineDepthLeftEdgesIncrease:
        outlineDepthLeftEdges.length === 6 &&
        outlineDepthLeftEdges.every(
          (left, index, edges) => index === 0 || left > edges[index - 1],
        ),
      hasReadingCard: Boolean(reading),
      hasCodeBlock: Boolean(document.querySelector(".markdown-code-block")),
      indentedCodeHasReaderClass: Boolean(indentedCodeBlock),
      indentedCodeCopyButtonExists: Boolean(indentedCodeCopyButton),
      indentedCodeFontFamily: indentedCodeBlock
        ? getComputedStyle(indentedCodeBlock).fontFamily
        : "",
      longCodeScrollerHasHorizontalOverflow: Boolean(
        longCodeScroller &&
          longCodeScroller.scrollWidth > longCodeScroller.clientWidth + 1,
      ),
      codeCopyButtonVisible: Boolean(codeCopyButton && fitsViewport(codeCopyButton)),
      codeCopyButtonSize: {
        width: Math.round(codeCopyButtonRect?.width ?? 0),
        height: Math.round(codeCopyButtonRect?.height ?? 0),
      },
      codeCopyIconSize: {
        width: Math.round(codeCopyIconRect?.width ?? 0),
        height: Math.round(codeCopyIconRect?.height ?? 0),
      },
      codeCopyButtonBackground: codeCopyButtonStyle?.backgroundColor ?? "",
      longOutlineTextExists: Boolean(longOutlineText),
      longOutlineTextOverflowStyle: longOutlineTextStyle?.overflow ?? "",
      longOutlineTextOverflowX: longOutlineTextStyle?.overflowX ?? "",
      longOutlineTextOverflowY: longOutlineTextStyle?.overflowY ?? "",
      longOutlineTextOverflowMode: longOutlineTextStyle?.textOverflow ?? "",
      longOutlineTextWhiteSpace: longOutlineTextStyle?.whiteSpace ?? "",
      longOutlineTextIsTruncated: Boolean(
        longOutlineText &&
        longOutlineText.scrollWidth > longOutlineText.clientWidth + 1,
      ),
      longOutlineTextStaysInsideItem: Boolean(
        longOutlineTextRect &&
        longOutlineItemRect &&
        longOutlineTextRect.right <= longOutlineItemRect.right + 1,
      ),
      longOutlineTextStaysInsideCard: Boolean(
        longOutlineTextRect &&
        outlineRect &&
        longOutlineTextRect.right <= outlineRect.right + 1,
      ),
      longOutlineTextMetrics,
      selectionCopyBubbleVisible: Boolean(
        selectionCopyBubble &&
        selectionCopyBubble.getAttribute("data-visible") === "true" &&
        fitsViewport(selectionCopyBubble),
      ),
      selectionCopyBubbleSize: {
        width: Math.round(selectionCopyBubbleRect?.width ?? 0),
        height: Math.round(selectionCopyBubbleRect?.height ?? 0),
      },
      hasMathError: Boolean(document.querySelector(".markdown-math-error")),
      hasTableScroller: Boolean(document.querySelector(".markdown-table-wrapper")),
      tableLayoutMode: wrappingTable ? getComputedStyle(wrappingTable).tableLayout : "",
      tableCellWhiteSpace: wrappingTableCell
        ? getComputedStyle(wrappingTableCell).whiteSpace
        : "",
      tableCellOverflowWrap: wrappingTableCell
        ? getComputedStyle(wrappingTableCell).overflowWrap
        : "",
      tableCellWordBreak: wrappingTableCell
        ? getComputedStyle(wrappingTableCell).wordBreak
        : "",
      tableFitsWrapper: Boolean(
        wrappingTable &&
          wrappingTableWrapper &&
          wrappingTable.scrollWidth <= wrappingTableWrapper.clientWidth + 1,
      ),
      longTableCellWrapped: Boolean(
        wrappingTableCellTextLineCount > 1,
      ),
      wrappingTableCellTextLineCount,
      hasHorizontalDocumentOverflow:
        documentElement.scrollWidth > documentElement.clientWidth,
      readerBodyFontVariable: getComputedStyle(documentElement)
        .getPropertyValue("--reader-body-font-family")
        .trim(),
      readerCodeFontVariable: getComputedStyle(documentElement)
        .getPropertyValue("--reader-code-font-family")
        .trim(),
      markdownFontFamily: markdownDocument
        ? getComputedStyle(markdownDocument).fontFamily
        : "",
      outlineFontFamily: outline ? getComputedStyle(outline).fontFamily : "",
      outlineItemFontFamily: outlineItem
        ? getComputedStyle(outlineItem).fontFamily
        : "",
      outlineItemUserSelect: outlineItem
        ? getComputedStyle(outlineItem).userSelect
        : "",
      currentOutlineItemHeight: currentOutlineItem
        ? Math.round(currentOutlineItem.getBoundingClientRect().height)
        : 0,
      currentOutlineTextCenterOffset: getTextCenterOffset(currentOutlineItem),
      currentOutlineItemBorderRadius: currentOutlineItem
        ? getComputedStyle(currentOutlineItem).borderTopLeftRadius
        : "",
      currentOutlineTextTransform: currentOutlineItem
        ? getComputedStyle(
            currentOutlineItem.querySelector(".reader-preview-outline-item-text"),
          ).transform
        : "",
      outlineFitsViewport: Boolean(outline && fitsViewport(outline)),
      readingFitsViewport: Boolean(reading && fitsViewport(reading)),
      settingsFitsViewport: Boolean(settings && fitsViewport(settings)),
      settingsRightInset:
        readingRect && settingsRect
          ? Math.round(readingRect.right - settingsRect.right)
          : 0,
      settingsBottomInset:
        readingRect && settingsRect
          ? Math.round(readingRect.bottom - settingsRect.bottom)
          : 0,
      settingsRadiusBalance:
        readingRect && settingsRect && settingsStyle
          ? {
              cardRadius: Number.parseFloat(
                getComputedStyle(reading).borderTopRightRadius,
              ),
              buttonRadius: Math.round(settingsRect.width / 2),
              rightInset: Math.round(readingRect.right - settingsRect.right),
              bottomInset: Math.round(readingRect.bottom - settingsRect.bottom),
              buttonWidth: Math.round(settingsRect.width),
              buttonHeight: Math.round(settingsRect.height),
              iconWidth: Math.round(
                settings.querySelector("svg")?.getBoundingClientRect().width ?? 0,
              ),
              iconHeight: Math.round(
                settings.querySelector("svg")?.getBoundingClientRect().height ?? 0,
              ),
              computedRadius: settingsStyle.borderTopLeftRadius,
            }
          : null,
      settingsRadiusPlusInsetEqualsCardRadius: Boolean(
        readingRect &&
        settingsRect &&
        Math.round(settingsRect.width / 2) +
          Math.round(readingRect.right - settingsRect.right) ===
          Number.parseFloat(getComputedStyle(reading).borderTopRightRadius) &&
        Math.round(settingsRect.height / 2) +
          Math.round(readingRect.bottom - settingsRect.bottom) ===
          Number.parseFloat(getComputedStyle(reading).borderBottomRightRadius),
      ),
      outlineCardWidth: outlineRect?.width ?? 0,
      readingCardLeft: Math.round(readingRect?.left ?? 0),
      readingCardWidth: readingRect?.width ?? 0,
      cardGap:
        outlineRect && readingRect
          ? Math.round(readingRect.left - outlineRect.right)
          : 0,
      cardGapCenterX:
        outlineRect && readingRect
          ? Math.round(outlineRect.right + (readingRect.left - outlineRect.right) / 2)
          : 0,
      usesTwoColumnCards: Boolean(
        outlineRect &&
        readingRect &&
        readingRect.left > outlineRect.right &&
        Math.abs(readingRect.top - outlineRect.top) < 2,
      ),
    };
  });
}

async function ensureViteServer() {
  if (await canFetch(qaUrl)) {
    return { startedByScript: false, process: null };
  }

  const viteChild = spawn(
    "cmd.exe",
    ["/d", "/s", "/c", "pnpm", "dev", "--host", "127.0.0.1"],
    {
      detached: true,
      cwd: repoRoot,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  viteChild.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  viteChild.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await canFetch(qaUrl)) {
      return { startedByScript: true, process: viteChild };
    }

    if (viteChild.exitCode !== null) {
      throw new Error(`Vite dev server exited early:\n${output}`);
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for Vite dev server:\n${output}`);
}

function killProcessTree(childProcess) {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(childProcess.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      return;
    }

    process.kill(-childProcess.pid);
  } catch {
    childProcess.kill();
  }
}

async function canFetch(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function findAvailablePort(startPort) {
  const { createServer } = await import("node:net");

  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(createServer, port)) {
      return port;
    }
  }

  throw new Error(`No available debugging port found from ${startPort}`);
}

function isPortAvailable(createServer, port) {
  return new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => {
      resolveAvailable(false);
    });
    server.once("listening", () => {
      server.close(() => resolveAvailable(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function connectToPage(port) {
  const versionUrl = `http://127.0.0.1:${port}/json`;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(versionUrl);
      const pages = await response.json();
      const page = pages[0];

      if (page?.webSocketDebuggerUrl) {
        return page;
      }
    } catch {
      // Chrome may not have opened the remote debugging endpoint yet.
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for Chrome debugging endpoint");
}

class CdpConnection {
  #nextId = 1;
  #pending = new Map();
  #socket;

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        return;
      }

      const pending = this.#pending.get(message.id);
      if (!pending) {
        return;
      }

      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  }

  async send(method, params = {}) {
    await this.#waitForOpen();
    const id = this.#nextId;
    this.#nextId += 1;

    const promise = new Promise((resolveMessage, rejectMessage) => {
      this.#pending.set(id, {
        reject: rejectMessage,
        resolve: resolveMessage,
      });
    });

    this.#socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.#socket.close();
  }

  #waitForOpen() {
    if (this.#socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolveOpen, rejectOpen) => {
      this.#socket.addEventListener("open", () => resolveOpen(), { once: true });
      this.#socket.addEventListener(
        "error",
        () => rejectOpen(new Error("CDP socket failed to open")),
        { once: true },
      );
    });
  }
}

async function waitForExpression(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });

    if (result.result?.value === true) {
      return;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function waitForDomContentLoaded(cdp) {
  await waitForExpression(cdp, "document.readyState !== 'loading'", 10_000);
}

async function waitForAnimationFrames(cdp, count) {
  await evaluate(
    cdp,
    async (frames) => {
      for (let index = 0; index < frames; index += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    },
    count,
  );
}

async function dragSelectElementText(cdp, selector) {
  const rect = await evaluate(
    cdp,
    (targetSelector) => {
      const target = document.querySelector(targetSelector);

      if (!target) {
        throw new Error(`Missing selectable target: ${targetSelector}`);
      }

      const targetRect = target.getBoundingClientRect();

      return {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      };
    },
    selector,
  );
  const y = rect.top + rect.height / 2;
  const startX = rect.left + 4;
  const endX = rect.left + Math.min(rect.width - 4, 260);

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: startX,
    y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: endX,
    y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: endX,
    y,
  });
}

async function dragSelectElementTextByText(cdp, selector, text) {
  const rect = await evaluate(
    cdp,
    ({ targetSelector, targetText }) => {
      const target = Array.from(document.querySelectorAll(targetSelector)).find(
        (element) => element.textContent?.includes(targetText),
      );

      if (!target) {
        throw new Error(
          `Missing selectable target containing ${targetText}: ${targetSelector}`,
        );
      }

      target.scrollIntoView({ block: "center", inline: "nearest" });
      const targetRect = target.getBoundingClientRect();

      return {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      };
    },
    { targetSelector: selector, targetText: text },
  );
  const y = rect.top + rect.height / 2;
  const startX = rect.left + 4;
  const endX = rect.left + Math.min(rect.width - 4, 520);

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: startX,
    y,
  });
  for (let index = 1; index <= 8; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: startX + ((endX - startX) * index) / 8,
      y,
    });
    await delay(40);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: endX,
    y,
  });
}

async function dragSelectTextToRightWhitespaceByText(cdp, selector, text) {
  const dragPoints = await evaluate(
    cdp,
    ({ targetSelector, targetText }) => {
      const target = Array.from(document.querySelectorAll(targetSelector)).find(
        (element) => element.textContent?.includes(targetText),
      );

      if (!target) {
        throw new Error(
          `Missing selectable target containing ${targetText}: ${targetSelector}`,
        );
      }

      target.scrollIntoView({ block: "center", inline: "nearest" });
      const fullRange = document.createRange();
      fullRange.selectNodeContents(target);
      const rects = Array.from(fullRange.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const targetRect = target.getBoundingClientRect();
      const firstRect = rects[0] ?? targetRect;
      const lastRect = rects.at(-1) ?? targetRect;

      return {
        startX: firstRect.left + 4,
        startY: firstRect.top + firstRect.height / 2,
        endX: targetRect.right - 6,
        endY: lastRect.top + lastRect.height / 2,
      };
    },
    { targetSelector: selector, targetText: text },
  );

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: dragPoints.startX,
    y: dragPoints.startY,
  });
  for (let index = 1; index <= 12; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: dragPoints.startX + ((dragPoints.endX - dragPoints.startX) * index) / 12,
      y: dragPoints.startY + ((dragPoints.endY - dragPoints.startY) * index) / 12,
    });
    await delay(35);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: dragPoints.endX,
    y: dragPoints.endY,
  });
}

async function dragSelectAcrossBlocksToRightWhitespace(
  cdp,
  startSelector,
  endSelector,
) {
  const dragPoints = await evaluate(
    cdp,
    ({ startTargetSelector, endTargetSelector }) => {
      const startTarget = document.querySelector(startTargetSelector);
      const endTarget = document.querySelector(endTargetSelector);

      if (!startTarget || !endTarget) {
        throw new Error(
          `Missing whitespace block selection target: ${startTargetSelector} -> ${endTargetSelector}`,
        );
      }

      startTarget.scrollIntoView({ block: "center", inline: "nearest" });
      const startRange = document.createRange();
      startRange.selectNodeContents(startTarget);
      const startRect =
        Array.from(startRange.getClientRects()).find(
          (rect) => rect.width > 0 && rect.height > 0,
        ) ?? startTarget.getBoundingClientRect();
      const endRect = endTarget.getBoundingClientRect();

      return {
        startX: startRect.left + 4,
        startY: startRect.top + startRect.height / 2,
        endX: endRect.right - 6,
        endY: endRect.top + endRect.height / 2,
      };
    },
    { startTargetSelector: startSelector, endTargetSelector: endSelector },
  );

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: dragPoints.startX,
    y: dragPoints.startY,
  });
  for (let index = 1; index <= 10; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: dragPoints.startX + ((dragPoints.endX - dragPoints.startX) * index) / 10,
      y: dragPoints.startY + ((dragPoints.endY - dragPoints.startY) * index) / 10,
    });
    await delay(35);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: dragPoints.endX,
    y: dragPoints.endY,
  });
}

async function dragSelectAcrossBlocksToRightWhitespaceByText(cdp, startText, endText) {
  const dragPoints = await evaluate(
    cdp,
    ({ startTargetText, endTargetText }) => {
      const root = document.querySelector(".markdown-rendered-document");
      const findBoundaryTarget = (text) => {
        const target = Array.from(root?.querySelectorAll("*") ?? []).find(
          (element) =>
            element.textContent?.includes(text) &&
            !Array.from(element.children).some((child) =>
              child.textContent?.includes(text),
            ),
        );

        if (!target) {
          const rootText = root?.textContent ?? "";
          const detailsIndex = rootText.indexOf("Details");
          throw new Error(
            `Missing details boundary text: ${text}; details snippet=${rootText.slice(
              Math.max(0, detailsIndex - 120),
              detailsIndex + 500,
            )}`,
          );
        }

        if (target.closest("details")) {
          throw new Error(`Details boundary is inside folded content: ${text}`);
        }

        return target;
      };
      const startTarget = findBoundaryTarget(startTargetText);
      const endTarget = findBoundaryTarget(endTargetText);

      startTarget.scrollIntoView({ block: "center", inline: "nearest" });
      const startRange = document.createRange();
      startRange.selectNodeContents(startTarget);
      const startRect =
        Array.from(startRange.getClientRects()).find(
          (rect) => rect.width > 0 && rect.height > 0,
        ) ?? startTarget.getBoundingClientRect();
      const endRect = endTarget.getBoundingClientRect();

      return {
        startX: startRect.left + 4,
        startY: startRect.top + startRect.height / 2,
        endX: endRect.right - 6,
        endY: endRect.top + endRect.height / 2,
      };
    },
    { startTargetText: startText, endTargetText: endText },
  );

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: dragPoints.startX,
    y: dragPoints.startY,
  });
  for (let index = 1; index <= 10; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: dragPoints.startX + ((dragPoints.endX - dragPoints.startX) * index) / 10,
      y: dragPoints.startY + ((dragPoints.endY - dragPoints.startY) * index) / 10,
    });
    await delay(35);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: dragPoints.endX,
    y: dragPoints.endY,
  });
}

async function dispatchWheelOver(cdp, selector, deltaY) {
  const point = await evaluate(
    cdp,
    (targetSelector) => {
      const target = document.querySelector(targetSelector);

      if (!target) {
        throw new Error(`Missing wheel target: ${targetSelector}`);
      }

      const rect = target.getBoundingClientRect();

      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    },
    selector,
  );

  await cdp.send("Input.dispatchMouseEvent", {
    deltaX: 0,
    deltaY,
    type: "mouseWheel",
    x: point.x,
    y: point.y,
  });
}

async function clickTextWithMinorPointerJitter(cdp, selector, text) {
  const clickPoint = await evaluate(
    cdp,
    ({ targetSelector, targetText }) => {
      const target = Array.from(document.querySelectorAll(targetSelector)).find(
        (element) => element.textContent?.includes(targetText),
      );

      if (!target) {
        throw new Error(
          `Missing click target containing ${targetText}: ${targetSelector}`,
        );
      }

      target.scrollIntoView({ block: "center", inline: "nearest" });
      const range = document.createRange();
      range.selectNodeContents(target);
      const textRect =
        Array.from(range.getClientRects()).find(
          (rect) => rect.width > 0 && rect.height > 0,
        ) ?? target.getBoundingClientRect();

      return {
        x: textRect.left + Math.min(72, textRect.width / 2),
        y: textRect.top + textRect.height / 2,
      };
    },
    { targetSelector: selector, targetText: text },
  );

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: clickPoint.x,
    y: clickPoint.y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: clickPoint.x + 8,
    y: clickPoint.y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: clickPoint.x + 8,
    y: clickPoint.y,
  });
}

async function dragSelectAcrossBlocks(cdp, startSelector, endSelector) {
  const dragPoints = await evaluate(
    cdp,
    ({ startTargetSelector, endTargetSelector }) => {
      const startTarget = document.querySelector(startTargetSelector);
      const endTarget = document.querySelector(endTargetSelector);

      if (!startTarget || !endTarget) {
        throw new Error(
          `Missing block selection target: ${startTargetSelector} -> ${endTargetSelector}`,
        );
      }

      startTarget.scrollIntoView({ block: "start", inline: "nearest" });
      const startRect =
        getTextEndpointRect(startTarget, "start") ??
        startTarget.getBoundingClientRect();
      const endRect =
        getTextEndpointRect(endTarget, "end") ?? endTarget.getBoundingClientRect();

      return {
        startX: startRect.left + 1,
        startY: startRect.top + startRect.height / 2,
        endX: endRect.right - 1,
        endY: endRect.top + endRect.height / 2,
      };

      function getTextEndpointRect(element, endpoint) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const textNodes = [];

        while (walker.nextNode()) {
          if (walker.currentNode.textContent?.trim()) {
            textNodes.push(walker.currentNode);
          }
        }

        const textNode =
          endpoint === "start" ? textNodes[0] : textNodes[textNodes.length - 1];

        if (!textNode?.textContent) {
          return null;
        }

        const textLength = textNode.textContent.length;
        const range = document.createRange();

        if (endpoint === "start") {
          range.setStart(textNode, 0);
          range.setEnd(textNode, Math.min(textLength, 1));
        } else {
          range.setStart(textNode, Math.max(0, textLength - 1));
          range.setEnd(textNode, textLength);
        }

        return (
          Array.from(range.getClientRects()).find(
            (rect) => rect.width > 0 && rect.height > 0,
          ) ?? null
        );
      }
    },
    { startTargetSelector: startSelector, endTargetSelector: endSelector },
  );

  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: dragPoints.startX,
    y: dragPoints.startY,
  });
  for (let index = 1; index <= 14; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: dragPoints.startX + ((dragPoints.endX - dragPoints.startX) * index) / 14,
      y: dragPoints.startY + ((dragPoints.endY - dragPoints.startY) * index) / 14,
    });
    await delay(35);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: dragPoints.endX,
    y: dragPoints.endY,
  });
}

async function evaluate(cdp, pageFunction, arg) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(${pageFunction})(${JSON.stringify(arg)})`,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }

  return result.result.value;
}

await main();
