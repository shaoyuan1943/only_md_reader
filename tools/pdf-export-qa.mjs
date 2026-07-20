import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outputPdf = resolve(root, "output/playwright/pdf-export-qa.pdf");
const outputGlobalScalingPdf = resolve(
  root,
  "output/playwright/pdf-export-qa-global-scaling.pdf",
);
const outputHighDpiPdf = resolve(
  root,
  "output/playwright/pdf-export-qa-fixed-high-dpi.pdf",
);
const outputPreview = resolve(
  root,
  "output/playwright/pdf-export-qa-print-preview.png",
);
const outputNotification = resolve(
  root,
  "output/playwright/pdf-export-notification.png",
);
const outputDarkNotification = resolve(
  root,
  "output/playwright/pdf-export-notification-dark.png",
);
const qaUrl = "http://127.0.0.1:1420/tools/reader-ui-qa.html";
const qaLongPdfFileName =
  "reader-ui-qa-document-with-an-intentionally-long-export-file-name (2).pdf";
const qaLongPdfError =
  "无法写入目标 PDF 文件，请确认目标目录存在、文件未被其他程序占用且当前账户具有写入权限。";
const chromePath = resolve(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright",
  "chromium-1228",
  "chrome-win64",
  "chrome.exe",
);
const profileDir = resolve(
  process.env.TEMP ?? root,
  "only-md-reader-pdf-export-qa-chrome",
);

async function main() {
  let chromeProcess;
  let viteProcess;

  try {
    assert.ok(existsSync(chromePath), `Missing local Chromium at ${chromePath}`);
    viteProcess = await ensureViteServer();
    const debuggingPort = await findAvailablePort(9543);
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
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const page = await connectToPage(debuggingPort);
    const cdp = await CdpConnection.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send("Page.navigate", { url: qaUrl });
    await waitForExpression(
      cdp,
      "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true",
    );
    const screenLayout = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
      const exportButton = document.querySelector('.reader-preview-pdf-export-button');
      const settingsButton = document.querySelector('.reader-preview-settings-button');
      const exportRect = exportButton?.getBoundingClientRect();
      const settingsRect = settingsButton?.getBoundingClientRect();
      return {
        label: exportButton?.getAttribute('aria-label'),
        title: exportButton?.getAttribute('title'),
        exportWidth: Math.round(exportRect?.width ?? 0),
        exportHeight: Math.round(exportRect?.height ?? 0),
        verticalGap: exportRect && settingsRect ? Math.round(settingsRect.top - exportRect.bottom) : -1,
      };
    })()`,
      returnByValue: true,
    });
    assert.deepEqual(screenLayout.result.value, {
      label: "导出为PDF文档",
      title: "导出为PDF文档",
      exportWidth: 32,
      exportHeight: 32,
      verticalGap: 6,
    });
    const interaction = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
      window.__qaPdfPrintCalls = 0;
      window.print = () => { window.__qaPdfPrintCalls += 1; };
      document.querySelector('.reader-preview-pdf-export-button')?.click();
      const shortcut = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'p' });
      document.dispatchEvent(shortcut);
      return { shortcutPrevented: shortcut.defaultPrevented };
    })()`,
      returnByValue: true,
    });
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-title')?.textContent === 'PDF导出失败！' &&
       document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail')?.textContent?.includes('PDF 导出只能在桌面应用中使用。') === true`,
    );
    const notification = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const notification = document.querySelector('.reader-preview-notification[data-kind="error"]');
        const notificationStack = document.querySelector('.reader-preview-notifications');
        const readingDocument = document.querySelector('.markdown-rendered-document');
        const shell = document.querySelector('.reader-preview-shell');
        const style = notification ? getComputedStyle(notification) : null;
        const stackStyle = notificationStack ? getComputedStyle(notificationStack) : null;
        const notificationRect = notification?.getBoundingClientRect();
        const stackRect = notificationStack?.getBoundingClientRect();
        const closeButton = notification?.querySelector('.reader-preview-notification-close-button');
        const closeIcon = closeButton?.querySelector('svg');
        const closeButtonRect = closeButton?.getBoundingClientRect();
        const closeIconRect = closeIcon?.getBoundingClientRect();
        return {
          background: style?.backgroundColor,
          borderRadius: style?.borderRadius,
          closeButtonHeight: Math.round(closeButtonRect?.height ?? 0),
          closeButtonLabel: closeButton?.getAttribute('aria-label'),
          closeButtonTitle: closeButton?.getAttribute('title'),
          closeButtonWidth: Math.round(closeButtonRect?.width ?? 0),
          closeIconHeight: Math.round(closeIconRect?.height ?? 0),
          closeIconWidth: Math.round(closeIconRect?.width ?? 0),
          detail: notification?.querySelector('.reader-preview-notification-detail')?.textContent,
          fontFamily: style?.fontFamily,
          notificationWidth: Math.round(notificationRect?.width ?? 0),
          stackBottom: stackStyle?.bottom,
          stackLeft: stackStyle?.left,
          stackWidth: Math.round(stackRect?.width ?? 0),
          title: notification?.querySelector('.reader-preview-notification-title')?.textContent,
          readingFontFamily: readingDocument ? getComputedStyle(readingDocument).fontFamily : '',
          printCalls: window.__qaPdfPrintCalls,
          shellBackground: shell ? getComputedStyle(shell).backgroundColor : '',
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(interaction.result.value.shortcutPrevented, true);
    assert.equal(notification.result.value.printCalls, 0);
    assert.equal(notification.result.value.title, "PDF导出失败！");
    assert.equal(notification.result.value.detail, "PDF 导出只能在桌面应用中使用。");
    assert.equal(notification.result.value.stackLeft, "24px");
    assert.equal(notification.result.value.stackBottom, "24px");
    assert.equal(notification.result.value.stackWidth, 324);
    assert.equal(notification.result.value.notificationWidth, 324);
    assert.equal(notification.result.value.borderRadius, "14px");
    assert.equal(notification.result.value.closeButtonLabel, "关闭通知");
    assert.equal(notification.result.value.closeButtonTitle, "关闭通知");
    assert.equal(notification.result.value.closeButtonWidth, 24);
    assert.equal(notification.result.value.closeButtonHeight, 24);
    assert.equal(notification.result.value.closeIconWidth, 16);
    assert.equal(notification.result.value.closeIconHeight, 16);
    assert.equal(
      notification.result.value.background,
      notification.result.value.shellBackground,
    );
    assert.equal(
      notification.result.value.fontFamily,
      notification.result.value.readingFontFamily,
    );

    await cdp.send("Page.navigate", { url: `${qaUrl}?pdfExport=success` });
    await waitForExpression(
      cdp,
      "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true",
    );
    await cdp.send("Runtime.evaluate", {
      expression:
        "document.querySelector('.reader-preview-pdf-export-button')?.click()",
    });
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="success"] .reader-preview-notification-title')?.textContent === 'PDF文件已导出！' &&
       document.querySelector('.reader-preview-notification[data-kind="success"] .reader-preview-notification-detail')?.textContent === ${JSON.stringify(qaLongPdfFileName)}`,
    );
    const successNotification = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const success = document.querySelector('.reader-preview-notification[data-kind="success"]');
        const title = success?.querySelector('.reader-preview-notification-title');
        const detail = success?.querySelector('.reader-preview-notification-detail');
        const titleStyle = title ? getComputedStyle(title) : null;
        const detailStyle = detail ? getComputedStyle(detail) : null;
        const closeButton = success?.querySelector('.reader-preview-notification-close-button');
        const closeIcon = closeButton?.querySelector('svg');
        const closeButtonRect = closeButton?.getBoundingClientRect();
        const closeIconRect = closeIcon?.getBoundingClientRect();
        return {
          closeButtonHeight: Math.round(closeButtonRect?.height ?? 0),
          closeButtonWidth: Math.round(closeButtonRect?.width ?? 0),
          closeIconHeight: Math.round(closeIconRect?.height ?? 0),
          closeIconWidth: Math.round(closeIconRect?.width ?? 0),
          title: title?.textContent,
          detail: detail?.textContent,
          titleOverflow: titleStyle?.overflow,
          titleTextOverflow: titleStyle?.textOverflow,
          titleWhiteSpace: titleStyle?.whiteSpace,
          detailClientWidth: detail?.clientWidth ?? 0,
          detailScrollWidth: detail?.scrollWidth ?? 0,
          detailOverflow: detailStyle?.overflow,
          detailTextOverflow: detailStyle?.textOverflow,
          detailWhiteSpace: detailStyle?.whiteSpace,
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(successNotification.result.value.title, "PDF文件已导出！");
    assert.equal(successNotification.result.value.detail, qaLongPdfFileName);
    assert.equal(successNotification.result.value.closeButtonWidth, 24);
    assert.equal(successNotification.result.value.closeButtonHeight, 24);
    assert.equal(successNotification.result.value.closeIconWidth, 16);
    assert.equal(successNotification.result.value.closeIconHeight, 16);
    assert.equal(successNotification.result.value.titleOverflow, "hidden");
    assert.equal(successNotification.result.value.titleTextOverflow, "ellipsis");
    assert.equal(successNotification.result.value.titleWhiteSpace, "nowrap");
    assert.equal(successNotification.result.value.detailOverflow, "hidden");
    assert.equal(successNotification.result.value.detailTextOverflow, "ellipsis");
    assert.equal(successNotification.result.value.detailWhiteSpace, "nowrap");
    assert.ok(
      successNotification.result.value.detailScrollWidth >
        successNotification.result.value.detailClientWidth,
    );
    const notificationScreenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    mkdirSync(dirname(outputNotification), { recursive: true });
    writeFileSync(
      outputNotification,
      Buffer.from(notificationScreenshot.data, "base64"),
    );

    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="success"]') === null`,
    );
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const originalSetTimeout = window.setTimeout;
        const originalClearTimeout = window.clearTimeout;
        const scheduledTimerIds = [];
        const clearedTimerIds = [];
        window.__qaNotificationTimerRecorder = {
          clearedTimerIds,
          originalClearTimeout,
          originalSetTimeout,
          scheduledTimerIds,
        };
        window.setTimeout = function (handler, delay, ...args) {
          const timerId = Reflect.apply(originalSetTimeout, window, [handler, delay, ...args]);
          if (delay === 3000) scheduledTimerIds.push(timerId);
          return timerId;
        };
        window.clearTimeout = function (timerId) {
          if (scheduledTimerIds.includes(timerId)) clearedTimerIds.push(timerId);
          return Reflect.apply(originalClearTimeout, window, [timerId]);
        };
      })()`,
    });

    const exportButtonClick = await dispatchMouseClick(
      cdp,
      ".reader-preview-pdf-export-button",
    );
    assert.equal(exportButtonClick.width, 32);
    assert.equal(exportButtonClick.height, 32);
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="success"] .reader-preview-notification-detail')?.textContent === ${JSON.stringify(qaLongPdfFileName)}`,
    );
    const newSuccessObservedAt = Date.now();
    const timerAtCreation = await cdp.send("Runtime.evaluate", {
      expression: `(() => ({
        scheduledTimerIds: [...window.__qaNotificationTimerRecorder.scheduledTimerIds],
      }))()`,
      returnByValue: true,
    });
    assert.equal(timerAtCreation.result.value.scheduledTimerIds.length, 1);
    const [successAutoCloseTimerId] = timerAtCreation.result.value.scheduledTimerIds;

    const successCloseStartedAt = Date.now();
    const successCloseButtonClick = await dispatchMouseClick(
      cdp,
      '.reader-preview-notification[data-kind="success"] .reader-preview-notification-close-button',
    );
    assert.equal(successCloseButtonClick.width, 24);
    assert.equal(successCloseButtonClick.height, 24);
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="success"]')?.getAttribute('data-closing') === 'true'`,
    );
    const successClosingStartedInMs = Date.now() - successCloseStartedAt;
    assert.ok(
      successClosingStartedInMs <= 500,
      "coordinate click must start closing the fresh success notification within 500ms",
    );
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="success"]') === null`,
    );
    const successRemovedInMs = Date.now() - newSuccessObservedAt;
    assert.ok(
      successRemovedInMs <= 1_000,
      "fresh success notification must be removed well before its 3000ms auto-close",
    );
    const timerRecorder = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const recorder = window.__qaNotificationTimerRecorder;
        const result = {
          clearedTimerIds: [...recorder.clearedTimerIds],
          scheduledTimerIds: [...recorder.scheduledTimerIds],
        };
        window.setTimeout = recorder.originalSetTimeout;
        window.clearTimeout = recorder.originalClearTimeout;
        delete window.__qaNotificationTimerRecorder;
        return result;
      })()`,
      returnByValue: true,
    });
    assert.equal(timerRecorder.result.value.scheduledTimerIds.length, 1);
    assert.ok(
      timerRecorder.result.value.clearedTimerIds.includes(successAutoCloseTimerId),
      "manual close must clear the exact 3000ms timer created for the fresh notification",
    );

    await cdp.send("Page.navigate", { url: `${qaUrl}?pdfExport=error` });
    await waitForExpression(
      cdp,
      "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true",
    );
    await cdp.send("Runtime.evaluate", {
      expression:
        "document.querySelector('.reader-preview-pdf-export-button')?.click()",
    });
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail')?.textContent === ${JSON.stringify(qaLongPdfError)}`,
    );
    const longErrorNotification = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const notification = document.querySelector('.reader-preview-notification[data-kind="error"]');
        const detail = notification?.querySelector('.reader-preview-notification-detail');
        const closeButton = notification?.querySelector('.reader-preview-notification-close-button');
        const style = detail ? getComputedStyle(detail) : null;
        return {
          closeButtonExists: Boolean(closeButton),
          detail: detail?.textContent,
          clientWidth: detail?.clientWidth ?? 0,
          scrollWidth: detail?.scrollWidth ?? 0,
          overflow: style?.overflow,
          textOverflow: style?.textOverflow,
          whiteSpace: style?.whiteSpace,
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(longErrorNotification.result.value.detail, qaLongPdfError);
    assert.equal(longErrorNotification.result.value.closeButtonExists, true);
    assert.equal(longErrorNotification.result.value.overflow, "hidden");
    assert.equal(longErrorNotification.result.value.textOverflow, "ellipsis");
    assert.equal(longErrorNotification.result.value.whiteSpace, "nowrap");
    assert.ok(
      longErrorNotification.result.value.scrollWidth >
        longErrorNotification.result.value.clientWidth,
    );
    const errorCloseButtonClick = await dispatchMouseClick(
      cdp,
      '.reader-preview-notification[data-kind="error"] .reader-preview-notification-close-button',
    );
    assert.equal(errorCloseButtonClick.width, 24);
    assert.equal(errorCloseButtonClick.height, 24);
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"]')?.getAttribute('data-closing') === 'true'`,
    );
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"]') === null`,
    );

    await cdp.send("Page.navigate", { url: `${qaUrl}?pdfExport=error&theme=dark` });
    await waitForExpression(
      cdp,
      "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true",
    );
    await cdp.send("Runtime.evaluate", {
      expression:
        "document.querySelector('.reader-preview-pdf-export-button')?.click()",
    });
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail')?.textContent === ${JSON.stringify(qaLongPdfError)}`,
    );
    const darkNotification = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const notification = document.querySelector('.reader-preview-notification[data-kind="error"]');
        const closeButton = notification?.querySelector('.reader-preview-notification-close-button');
        const closeIcon = closeButton?.querySelector('svg');
        const title = notification?.querySelector('.reader-preview-notification-title');
        const detail = notification?.querySelector('.reader-preview-notification-detail');
        const notificationRect = notification?.getBoundingClientRect();
        const closeButtonRect = closeButton?.getBoundingClientRect();
        const closeIconRect = closeIcon?.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const detailRect = detail?.getBoundingClientRect();
        const notificationStyle = notification ? getComputedStyle(notification) : null;
        const closeButtonStyle = closeButton ? getComputedStyle(closeButton) : null;
        const closeIconStyle = closeIcon ? getComputedStyle(closeIcon) : null;
        const titleStyle = title ? getComputedStyle(title) : null;
        const detailStyle = detail ? getComputedStyle(detail) : null;
        const colorProbe = document.createElement('span');
        colorProbe.style.backgroundColor = rootStyle.getPropertyValue('--app-bg');
        document.body.append(colorProbe);
        const appBackground = getComputedStyle(colorProbe).backgroundColor;
        colorProbe.remove();
        const titleContentRight = (titleRect?.left ?? 0) + (title?.clientWidth ?? 0) - parseFloat(titleStyle?.paddingRight ?? '0');
        const detailContentRight = (detailRect?.left ?? 0) + (detail?.clientWidth ?? 0) - parseFloat(detailStyle?.paddingRight ?? '0');
        return {
          appBackground,
          background: notificationStyle?.backgroundColor,
          borderColor: notificationStyle?.borderColor,
          buttonColor: closeButtonStyle?.color,
          closeButtonHeight: Math.round(closeButtonRect?.height ?? 0),
          closeButtonTop: closeButtonStyle?.top,
          closeButtonTopInset: Math.round((closeButtonRect?.top ?? 0) - (notificationRect?.top ?? 0)),
          closeButtonRight: closeButtonStyle?.right,
          closeButtonRightInset: Math.round((notificationRect?.right ?? 0) - (closeButtonRect?.right ?? 0)),
          closeButtonWidth: Math.round(closeButtonRect?.width ?? 0),
          closeIconFill: closeIconStyle?.fill,
          closeIconHeight: Math.round(closeIconRect?.height ?? 0),
          closeIconWidth: Math.round(closeIconRect?.width ?? 0),
          detailClientWidth: detail?.clientWidth ?? 0,
          detailColor: detailStyle?.color,
          detailContentRight,
          detailOverflow: detailStyle?.overflow,
          detailScrollWidth: detail?.scrollWidth ?? 0,
          detailTextOverflow: detailStyle?.textOverflow,
          detailWhiteSpace: detailStyle?.whiteSpace,
          mode: document.documentElement.dataset.themeEffectiveMode,
          notificationColor: notificationStyle?.color,
          notificationHeight: Math.round(notificationRect?.height ?? 0),
          notificationWidth: Math.round(notificationRect?.width ?? 0),
          closeButtonLeft: closeButtonRect?.left ?? 0,
          titleColor: titleStyle?.color,
          titleContentRight,
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(darkNotification.result.value.mode, "dark");
    assert.equal(
      darkNotification.result.value.background,
      darkNotification.result.value.appBackground,
    );
    assert.notEqual(darkNotification.result.value.borderColor, "rgba(0, 0, 0, 0)");
    assert.equal(
      darkNotification.result.value.buttonColor,
      darkNotification.result.value.notificationColor,
    );
    assert.equal(
      darkNotification.result.value.closeIconFill,
      darkNotification.result.value.notificationColor,
    );
    assert.equal(
      darkNotification.result.value.titleColor,
      darkNotification.result.value.notificationColor,
    );
    assert.equal(
      darkNotification.result.value.detailColor,
      darkNotification.result.value.notificationColor,
    );
    assert.equal(darkNotification.result.value.closeButtonWidth, 24);
    assert.equal(darkNotification.result.value.closeButtonHeight, 24);
    assert.equal(darkNotification.result.value.closeIconWidth, 16);
    assert.equal(darkNotification.result.value.closeIconHeight, 16);
    assert.equal(darkNotification.result.value.closeButtonTop, "8px");
    assert.equal(darkNotification.result.value.closeButtonRight, "8px");
    assert.ok([8, 9].includes(darkNotification.result.value.closeButtonTopInset));
    assert.ok([8, 9].includes(darkNotification.result.value.closeButtonRightInset));
    assert.ok(
      darkNotification.result.value.titleContentRight <=
        darkNotification.result.value.closeButtonLeft,
    );
    assert.ok(
      darkNotification.result.value.detailContentRight <=
        darkNotification.result.value.closeButtonLeft,
    );
    assert.equal(darkNotification.result.value.detailOverflow, "hidden");
    assert.equal(darkNotification.result.value.detailTextOverflow, "ellipsis");
    assert.equal(darkNotification.result.value.detailWhiteSpace, "nowrap");
    assert.ok(
      darkNotification.result.value.detailScrollWidth >
        darkNotification.result.value.detailClientWidth,
    );
    const darkNotificationScreenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    mkdirSync(dirname(outputDarkNotification), { recursive: true });
    writeFileSync(
      outputDarkNotification,
      Buffer.from(darkNotificationScreenshot.data, "base64"),
    );
    const darkCloseButtonClick = await dispatchMouseClick(
      cdp,
      '.reader-preview-notification[data-kind="error"] .reader-preview-notification-close-button',
    );
    assert.equal(darkCloseButtonClick.width, 24);
    assert.equal(darkCloseButtonClick.height, 24);
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"]')?.getAttribute('data-closing') === 'true'`,
    );
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"]') === null`,
    );

    await cdp.send("Page.navigate", { url: `${qaUrl}?pdfExport=error` });
    await waitForExpression(
      cdp,
      "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true",
    );

    await cdp.send("Runtime.evaluate", {
      expression:
        "document.querySelector('.reader-preview-pdf-export-button')?.click()",
    });
    await waitForExpression(
      cdp,
      `document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail')?.textContent === ${JSON.stringify(qaLongPdfError)}`,
    );

    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.send("Emulation.setEmulatedMedia", { media: "print" });

    const printLayout = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
      const documentRoot = document.querySelector('.markdown-rendered-document');
      const notificationStack = document.querySelector('.reader-preview-notifications');
      const settings = document.querySelector('.reader-preview-settings-button');
      const scroller = document.querySelector('.reader-preview-scroll');
      const shell = document.querySelector('.reader-preview-shell');
      const readingCard = document.querySelector('.reader-preview-reading-card');
      const codeScroller = document.querySelector('.markdown-code-scroller');
      const codeToken = document.querySelector('.markdown-code-block .line span');
      const tableHeader = document.querySelector('.markdown-rendered-document th');
      const link = document.querySelector('.markdown-rendered-document a');
      const overflowProbe = document.createElement('p');
      overflowProbe.style.width = '420px';
      const inlineCodeChainProbe = document.createElement('p');
      inlineCodeChainProbe.style.width = '420px';
      for (const [index, value] of [
        '.inner_size(READER_WINDOW_RESTORED_WIDTH, READER_WINDOW_RESTORED_HEIGHT)',
        '.min_inner_size(READER_WINDOW_MIN_WIDTH, READER_WINDOW_MIN_HEIGHT)',
        '.resizable(false)',
        '.maximizable(true)',
        '.maximized(true)',
      ].entries()) {
        if (index > 0) inlineCodeChainProbe.append(document.createTextNode('、'));
        const code = document.createElement('code');
        code.textContent = value;
        inlineCodeChainProbe.append(code);
      }
      const normalInlineCodeProbe = document.createElement('code');
      normalInlineCodeProbe.textContent = 'src/features/export-pdf/export-pdf.ts';
      const inlineCodeProbe = document.createElement('code');
      inlineCodeProbe.textContent = 'InlineCodeWithoutNaturalBreaks'.repeat(12);
      inlineCodeProbe.setAttribute('data-pdf-wrap-overwide', 'true');
      overflowProbe.append(
        document.createTextNode('验证普通行内代码换行：'),
        normalInlineCodeProbe,
        document.createTextNode(' '),
      );
      overflowProbe.append(inlineCodeProbe);
      documentRoot?.append(overflowProbe, inlineCodeChainProbe);
      scroller?.setAttribute('data-pdf-allow-global-scaling', 'false');
      const documentStyle = documentRoot ? getComputedStyle(documentRoot) : null;
      const normalInlineCodeStyle = getComputedStyle(normalInlineCodeProbe);
      const inlineCodeStyle = getComputedStyle(inlineCodeProbe);
      const documentClientWidth = documentRoot?.clientWidth ?? 0;
      const documentScrollWidth = documentRoot?.scrollWidth ?? 0;
      const inlineCodeOverflowWrap = inlineCodeStyle.overflowWrap;
      const inlineCodeWordBreak = inlineCodeStyle.wordBreak;
      const inlineCodeChainClientWidth = inlineCodeChainProbe.clientWidth;
      const inlineCodeChainScrollWidth = inlineCodeChainProbe.scrollWidth;
      const normalInlineCodeDisplay = normalInlineCodeStyle.display;
      const normalInlineCodeOverflowWrap = normalInlineCodeStyle.overflowWrap;
      const normalInlineCodeFragmentCount = normalInlineCodeProbe.getClientRects().length;
      const normalInlineCodeWhiteSpace = normalInlineCodeStyle.whiteSpace;
      const normalInlineCodeWordBreak = normalInlineCodeStyle.wordBreak;
      overflowProbe.remove();
      inlineCodeChainProbe.remove();
      return {
        documentClientWidth,
        documentFontSize: documentStyle?.fontSize,
        documentOverflow: documentRoot ? getComputedStyle(documentRoot).overflow : '',
        documentScrollWidth,
        scalingMode: scroller?.getAttribute('data-pdf-allow-global-scaling'),
        inlineCodeOverflowWrap,
        inlineCodeWordBreak,
        inlineCodeChainClientWidth,
        inlineCodeChainScrollWidth,
        normalInlineCodeDisplay,
        normalInlineCodeOverflowWrap,
        normalInlineCodeFragmentCount,
        normalInlineCodeWhiteSpace,
        normalInlineCodeWordBreak,
        notificationDisplay: notificationStack ? getComputedStyle(notificationStack).display : '',
        settingsDisplay: settings ? getComputedStyle(settings).display : '',
        scrollerOverflow: scroller ? getComputedStyle(scroller).overflow : '',
        shellBackground: shell ? getComputedStyle(shell).backgroundColor : '',
        readingCardBackground: readingCard ? getComputedStyle(readingCard).backgroundColor : '',
        readingCardOverlay: readingCard ? getComputedStyle(readingCard, '::before').backgroundImage : '',
        codeBackground: codeScroller ? getComputedStyle(codeScroller).backgroundColor : '',
        codeTokenColor: codeToken ? getComputedStyle(codeToken).color : '',
        tableHeaderBackground: tableHeader ? getComputedStyle(tableHeader).backgroundColor : '',
        linkColor: link ? getComputedStyle(link).color : '',
      };
    })()`,
      returnByValue: true,
    });
    assert.deepEqual(printLayout.result.value, {
      documentClientWidth: printLayout.result.value.documentClientWidth,
      documentFontSize: "16px",
      documentOverflow: "visible",
      documentScrollWidth: printLayout.result.value.documentClientWidth,
      scalingMode: "false",
      inlineCodeOverflowWrap: "anywhere",
      inlineCodeWordBreak: "break-word",
      inlineCodeChainClientWidth: printLayout.result.value.inlineCodeChainClientWidth,
      inlineCodeChainScrollWidth: printLayout.result.value.inlineCodeChainScrollWidth,
      normalInlineCodeDisplay: "inline-block",
      normalInlineCodeOverflowWrap: "normal",
      normalInlineCodeFragmentCount: 1,
      normalInlineCodeWhiteSpace: "nowrap",
      normalInlineCodeWordBreak: "normal",
      notificationDisplay: "none",
      settingsDisplay: "none",
      scrollerOverflow: "visible",
      shellBackground: "rgb(255, 255, 255)",
      readingCardBackground: "rgb(255, 255, 255)",
      readingCardOverlay: "none",
      codeBackground: "rgb(255, 255, 255)",
      codeTokenColor: "rgb(0, 0, 0)",
      tableHeaderBackground: "rgb(255, 255, 255)",
      linkColor: "rgb(0, 0, 0)",
    });
    assert.ok(
      printLayout.result.value.inlineCodeChainScrollWidth <=
        printLayout.result.value.documentClientWidth,
      "inline code chains must not expand the printable document width",
    );

    const fixedOverwideLayout = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const documentRoot = document.querySelector('.markdown-rendered-document');
        const scroller = document.querySelector('.reader-preview-scroll');
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table-wrapper pdf-global-scaling-probe';
        const table = document.createElement('table');
        const row = table.insertRow();
        const cell = row.insertCell();
        cell.textContent = 'GlobalScalingProbeWithoutBreaks'.repeat(5);
        wrapper.append(table);
        documentRoot?.append(wrapper);
        scroller?.setAttribute('data-pdf-allow-global-scaling', 'false');
        return {
          documentClientWidth: documentRoot?.clientWidth ?? 0,
          documentScrollWidth: documentRoot?.scrollWidth ?? 0,
          tableWidth: Math.round(table.getBoundingClientRect().width),
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(
      fixedOverwideLayout.result.value.documentScrollWidth,
      fixedOverwideLayout.result.value.documentClientWidth,
      "fixed-size mode must keep an overwide table inside the printable width",
    );

    const preview = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    mkdirSync(dirname(outputPreview), { recursive: true });
    writeFileSync(outputPreview, Buffer.from(preview.data, "base64"));

    const pdf = await cdp.send("Page.printToPDF", {
      landscape: false,
      preferCSSPageSize: true,
      printBackground: true,
    });

    const globalScalingLayout = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const documentRoot = document.querySelector('.markdown-rendered-document');
        const scroller = document.querySelector('.reader-preview-scroll');
        const table = document.querySelector('.pdf-global-scaling-probe table');
        scroller?.setAttribute('data-pdf-allow-global-scaling', 'true');
        return {
          documentClientWidth: documentRoot?.clientWidth ?? 0,
          documentFontSize: documentRoot ? getComputedStyle(documentRoot).fontSize : '',
          documentScrollWidth: documentRoot?.scrollWidth ?? 0,
          tableFontSize: table ? getComputedStyle(table).fontSize : '',
          tableWidth: Math.round(table?.getBoundingClientRect().width ?? 0),
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(globalScalingLayout.result.value.documentFontSize, "16px");
    assert.equal(globalScalingLayout.result.value.tableFontSize, "16px");
    assert.ok(
      globalScalingLayout.result.value.documentScrollWidth >
        globalScalingLayout.result.value.documentClientWidth,
      "automatic-scaling mode must allow overwide content to expand the print layout",
    );
    assert.ok(
      globalScalingLayout.result.value.tableWidth >
        globalScalingLayout.result.value.documentClientWidth,
      "automatic-scaling mode must not locally fit the overwide table",
    );
    const globalScalingPdf = await cdp.send("Page.printToPDF", {
      landscape: false,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('.reader-preview-scroll')?.setAttribute('data-pdf-allow-global-scaling', 'false')`,
    });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1.5,
      mobile: false,
    });
    const highDpiPdf = await cdp.send("Page.printToPDF", {
      landscape: false,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.send("Emulation.setEmulatedMedia", { media: "" });
    cdp.close();

    mkdirSync(dirname(outputPdf), { recursive: true });
    writeFileSync(outputPdf, Buffer.from(pdf.data, "base64"));
    writeFileSync(outputGlobalScalingPdf, Buffer.from(globalScalingPdf.data, "base64"));
    writeFileSync(outputHighDpiPdf, Buffer.from(highDpiPdf.data, "base64"));
    assert.ok(statSync(outputPdf).size > 20_000, "PDF output is unexpectedly small");
    assert.ok(
      statSync(outputGlobalScalingPdf).size > 20_000,
      "automatic-scaling PDF output is unexpectedly small",
    );
    assert.ok(
      statSync(outputHighDpiPdf).size > 20_000,
      "high-DPI fixed-size PDF output is unexpectedly small",
    );
    const pageCount = (
      readFileSync(outputPdf)
        .toString("latin1")
        .match(/\/Type\s*\/Page\b/g) ?? []
    ).length;
    assert.ok(pageCount >= 2, `expected multi-page PDF, got ${pageCount} pages`);
    writeFileSync(
      1,
      JSON.stringify(
        {
          status: "passed",
          outputPdf,
          outputGlobalScalingPdf,
          outputHighDpiPdf,
          outputDarkNotification,
          pageCount,
          bytes: statSync(outputPdf).size,
          globalScalingBytes: statSync(outputGlobalScalingPdf).size,
          highDpiBytes: statSync(outputHighDpiPdf).size,
          fixedOverwideLayout: fixedOverwideLayout.result.value,
          globalScalingLayout: globalScalingLayout.result.value,
          notificationDismissal: {
            clearedTimerIds: timerRecorder.result.value.clearedTimerIds,
            exportButtonClick,
            successAutoCloseTimerId,
            successCloseButtonClick,
            successClosingStartedInMs,
            successRemovedInMs,
          },
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    chromeProcess?.kill();
    viteProcess?.kill();
  }
}

async function ensureViteServer() {
  if (await isServerReady()) {
    return null;
  }

  const process = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
    { cwd: root, shell: true, stdio: "pipe" },
  );
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await isServerReady()) {
      return process;
    }
    await delay(200);
  }

  process.kill();
  throw new Error("Vite QA page did not become ready");
}

async function isServerReady() {
  try {
    return (await fetch(qaUrl)).ok;
  } catch {
    return false;
  }
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error("No CDP port available");
}

async function isPortAvailable(port) {
  return await new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => resolveAvailable(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
  });
}

async function connectToPage(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find((candidate) => candidate.type === "page");
      if (page) {
        return page;
      }
    } catch {
      // Chromium is still starting.
    }
    await delay(100);
  }
  throw new Error("Could not connect to Chromium CDP page");
}

async function waitForExpression(cdp, expression) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.result.value === true) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function dispatchMouseClick(cdp, selector) {
  const center = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || rect.width === 0 || rect.height === 0) return null;
      return {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
    returnByValue: true,
  });
  assert.ok(center.result.value, `Missing clickable element: ${selector}`);

  const { x, y } = center.result.value;
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x,
    y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x,
    y,
  });

  return center.result.value;
}

class CdpConnection {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpConnection(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveResult, reject) => {
      this.pending.set(id, { resolve: resolveResult, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}
await main();
process.exit(0);
