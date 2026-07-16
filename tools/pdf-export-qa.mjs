import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outputPdf = resolve(root, "output/playwright/pdf-export-qa.pdf");
const outputPreview = resolve(root, "output/playwright/pdf-export-qa-print-preview.png");
const qaUrl = "http://127.0.0.1:1420/tools/reader-ui-qa.html";
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
      "document.querySelector('.reader-preview-notification[data-kind=\"error\"]')?.textContent?.includes('PDF 导出只能在桌面应用中使用。') === true",
    );
    const notification = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const notification = document.querySelector('.reader-preview-notification[data-kind="error"]');
        const notificationStack = document.querySelector('.reader-preview-notifications');
        const readingDocument = document.querySelector('.markdown-rendered-document');
        const shell = document.querySelector('.reader-preview-shell');
        const style = notification ? getComputedStyle(notification) : null;
        const stackStyle = notificationStack ? getComputedStyle(notificationStack) : null;
        return {
          background: style?.backgroundColor,
          borderRadius: style?.borderRadius,
          fontFamily: style?.fontFamily,
          stackBottom: stackStyle?.bottom,
          stackLeft: stackStyle?.left,
          readingFontFamily: readingDocument ? getComputedStyle(readingDocument).fontFamily : '',
          printCalls: window.__qaPdfPrintCalls,
          shellBackground: shell ? getComputedStyle(shell).backgroundColor : '',
        };
      })()`,
      returnByValue: true,
    });
    assert.equal(interaction.result.value.shortcutPrevented, true);
    assert.equal(notification.result.value.printCalls, 0);
    assert.equal(notification.result.value.stackLeft, "24px");
    assert.equal(notification.result.value.stackBottom, "24px");
    assert.equal(notification.result.value.borderRadius, "14px");
    assert.equal(notification.result.value.background, notification.result.value.shellBackground);
    assert.equal(
      notification.result.value.fontFamily,
      notification.result.value.readingFontFamily,
    );

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
      return {
        documentOverflow: documentRoot ? getComputedStyle(documentRoot).overflow : '',
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
      documentOverflow: "visible",
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

    const preview = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(dirname(outputPreview), { recursive: true });
  writeFileSync(outputPreview, Buffer.from(preview.data, "base64"));

  const pdf = await cdp.send("Page.printToPDF", {
      landscape: false,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await cdp.send("Emulation.setEmulatedMedia", { media: "" });
    cdp.close();

    mkdirSync(dirname(outputPdf), { recursive: true });
    writeFileSync(outputPdf, Buffer.from(pdf.data, "base64"));
    assert.ok(statSync(outputPdf).size > 20_000, "PDF output is unexpectedly small");
    const pageCount = (
      readFileSync(outputPdf)
        .toString("latin1")
        .match(/\/Type\s*\/Page\b/g) ?? []
    ).length;
    assert.ok(pageCount >= 2, `expected multi-page PDF, got ${pageCount} pages`);
    console.log(
      JSON.stringify(
        { status: "passed", outputPdf, pageCount, bytes: statSync(outputPdf).size },
        null,
        2,
      ),
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
