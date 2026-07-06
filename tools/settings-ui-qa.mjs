import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = resolve(import.meta.dirname, "..");
const qaUrl = "http://127.0.0.1:1420/tools/settings-ui-qa.html";
const chromePath = resolve(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright",
  "chromium-1228",
  "chrome-win64",
  "chrome.exe",
);
const screenshotPath = resolve(
  process.env.TEMP ?? repoRoot,
  "only-md-reader-settings-ui-qa.png",
);

async function main() {
  const viteProcess = await ensureViteServer();
  let chromeProcess;
  let cdp;

  try {
    assert.ok(
      existsSync(chromePath),
      `Missing local Chromium at ${chromePath}. Install Playwright Chromium or set up this machine cache.`,
    );

    const debuggingPort = await findAvailablePort(9333);
    const profileDir = resolve(
      process.env.TEMP ?? repoRoot,
      "only-md-reader-qa-chrome",
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
        qaUrl,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    const page = await connectToPage(debuggingPort, qaUrl);
    cdp = new CdpConnection(page.webSocketDebuggerUrl);

    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 856,
      height: 430,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send("Page.navigate", { url: qaUrl });
    await waitForDomContentLoaded(cdp);
    await waitForExpression(
      cdp,
      "document.querySelectorAll('.custom-select').length === 2",
      10_000,
    );

    const health = await evaluate(cdp, () => ({
      title: document.title,
      bodyText: document.body.textContent ?? "",
      hasViteOverlay: Boolean(document.querySelector("vite-error-overlay")),
      consoleErrors: window.__qaConsoleErrors ?? [],
    }));

    assert.equal(health.title, "Only MD Reader Settings QA");
    assert.ok(health.bodyText.length > 0, "Settings QA page rendered blank content");
    assert.equal(health.hasViteOverlay, false);
    assert.deepEqual(health.consoleErrors, []);

    const scrollCheck = await evaluate(cdp, async () => {
      function openSelect(index) {
        const details = document.querySelectorAll(".custom-select")[index];
        details.open = true;
        details.dispatchEvent(new ToggleEvent("toggle"));
      }

      openSelect(0);
      await new Promise((resolveDelay) => requestAnimationFrame(resolveDelay));
      await new Promise((resolveDelay) => requestAnimationFrame(resolveDelay));

      const menu = document.querySelector(".select-menu");
      const scroller = document.querySelector(".select-menu-scroll");
      const hotzone = document.querySelector(".select-menu-scrollbar-hotzone");
      const track = document.querySelector(".select-menu-scrollbar");
      const thumb = document.querySelector(".select-menu-scrollbar-thumb");
      const firstOption = document.querySelector(".select-option");
      const selectedOption = document.querySelector(
        '.select-option[data-selected="true"]',
      );
      const menuRect = menu.getBoundingClientRect();
      const hotzoneRect = hotzone.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      const optionRect = firstOption.getBoundingClientRect();
      const styles = getComputedStyle(scroller);
      const menuStyles = getComputedStyle(menu);
      const scrollerStyles = getComputedStyle(scroller);
      const hotzoneStyles = getComputedStyle(hotzone);
      const optionStyles = getComputedStyle(firstOption);
      const selectedOptionStyles = getComputedStyle(selectedOption);
      const thumbStyles = getComputedStyle(thumb);

      return {
        canScroll: menu?.getAttribute("data-can-scroll"),
        scrollHeight: scroller?.scrollHeight,
        clientHeight: scroller?.clientHeight,
        menuPadding: menuStyles.padding,
        optionInsetLeft: optionRect.left - menuRect.left,
        optionInsetRight: menuRect.right - optionRect.right,
        optionPadding: optionStyles.padding,
        scrollerPaddingRight: scrollerStyles.paddingRight,
        selectedOptionBackground: selectedOptionStyles.backgroundColor,
        scrollbarWidth: styles.scrollbarWidth,
        hotzoneOpacity: hotzoneStyles.opacity,
        thumbHeight: thumbStyles.height,
        hasThumb: Boolean(thumb),
        points: {
          hotzoneX: hotzoneRect.left + hotzoneRect.width / 2,
          hotzoneY: hotzoneRect.top + hotzoneRect.height / 2,
          trackClickX: trackRect.left + trackRect.width / 2,
          trackClickY: trackRect.top + trackRect.height * 0.68,
          thumbX: thumbRect.left + thumbRect.width / 2,
          thumbY: thumbRect.top + thumbRect.height / 2,
        },
      };
    });

    assert.equal(scrollCheck.hasThumb, true);
    assert.equal(scrollCheck.canScroll, "true");
    assert.ok(scrollCheck.scrollHeight > scrollCheck.clientHeight);
    assert.equal(scrollCheck.menuPadding, "0px");
    assert.ok(Math.abs(scrollCheck.optionInsetLeft) < 1);
    assert.ok(Math.abs(scrollCheck.optionInsetRight) < 1);
    assert.equal(scrollCheck.optionPadding, "0px 42px 0px 18px");
    assert.equal(scrollCheck.scrollerPaddingRight, "0px");
    assert.notEqual(scrollCheck.selectedOptionBackground, "rgba(0, 0, 0, 0)");
    assert.equal(scrollCheck.scrollbarWidth, "none");
    assert.equal(scrollCheck.hotzoneOpacity, "0");
    assert.notEqual(scrollCheck.thumbHeight, "0px");

    await dispatchMouse(cdp, "mouseMoved", {
      x: scrollCheck.points.hotzoneX,
      y: scrollCheck.points.hotzoneY,
    });
    await delay(180);

    const hoverCheck = await evaluate(cdp, () => ({
      hotzoneOpacity: Number.parseFloat(
        getComputedStyle(document.querySelector(".select-menu-scrollbar-hotzone"))
          .opacity,
      ),
    }));

    assert.ok(hoverCheck.hotzoneOpacity > 0.9);

    const trackClickCheck = await evaluate(cdp, () => {
      const scroller = document.querySelector(".select-menu-scroll");
      return {
        beforeScrollTop: scroller.scrollTop,
      };
    });

    await dispatchMouse(cdp, "mousePressed", {
      x: scrollCheck.points.trackClickX,
      y: scrollCheck.points.trackClickY,
    });
    await dispatchMouse(cdp, "mouseReleased", {
      x: scrollCheck.points.trackClickX,
      y: scrollCheck.points.trackClickY,
    });
    await delay(80);

    Object.assign(
      trackClickCheck,
      await evaluate(cdp, () => {
        const scroller = document.querySelector(".select-menu-scroll");
        const thumb = document.querySelector(".select-menu-scrollbar-thumb");
        const thumbRect = thumb.getBoundingClientRect();

        return {
          afterScrollTop: scroller.scrollTop,
          thumbX: thumbRect.left + thumbRect.width / 2,
          thumbY: thumbRect.top + thumbRect.height / 2,
        };
      }),
    );

    assert.ok(trackClickCheck.afterScrollTop > trackClickCheck.beforeScrollTop);

    await dispatchMouse(cdp, "mousePressed", {
      x: trackClickCheck.thumbX,
      y: trackClickCheck.thumbY,
    });
    await delay(40);

    const dragPressCheck = await evaluate(cdp, () => ({
      isDragging:
        document
          .querySelector(".select-menu")
          ?.getAttribute("data-dragging-scrollbar") === "true",
      hotzoneOpacity: Number.parseFloat(
        getComputedStyle(document.querySelector(".select-menu-scrollbar-hotzone"))
          .opacity,
      ),
    }));

    assert.equal(dragPressCheck.isDragging, true);
    assert.ok(dragPressCheck.hotzoneOpacity > 0.9);

    await dispatchMouse(cdp, "mouseMoved", {
      buttons: 1,
      x: trackClickCheck.thumbX,
      y: trackClickCheck.thumbY - 44,
    });
    await dispatchMouse(cdp, "mouseReleased", {
      x: trackClickCheck.thumbX,
      y: trackClickCheck.thumbY - 44,
    });
    await delay(80);

    const dragCheck = await evaluate(cdp, () => {
      const scroller = document.querySelector(".select-menu-scroll");

      return {
        isDragging:
          document
            .querySelector(".select-menu")
            ?.getAttribute("data-dragging-scrollbar") === "true",
        scrollTop: scroller.scrollTop,
      };
    });

    assert.equal(dragCheck.isDragging, false);
    assert.ok(dragCheck.scrollTop < trackClickCheck.afterScrollTop);

    const roundtrip = await evaluate(cdp, async () => {
      const clickOption = async (selectIndex, text) => {
        const details = document.querySelectorAll(".custom-select")[selectIndex];
        details.open = true;
        details.dispatchEvent(new ToggleEvent("toggle"));
        await new Promise((resolveDelay) => requestAnimationFrame(resolveDelay));
        const option = [...details.querySelectorAll(".select-option")].find(
          (button) => button.textContent?.trim() === text,
        );
        option?.click();
        await new Promise((resolveDelay) => requestAnimationFrame(resolveDelay));
        await new Promise((resolveDelay) => requestAnimationFrame(resolveDelay));
      };

      await clickOption(0, "Microsoft YaHei UI");
      await clickOption(0, "Maple Mono NF CN");
      await clickOption(1, "Cascadia Code");
      await clickOption(1, "Maple Mono NF CN");

      return {
        patches: window.__qaSettingsPatches,
        bodyLabel: document
          .querySelectorAll(".custom-select summary")[0]
          ?.textContent?.trim(),
        codeLabel: document
          .querySelectorAll(".custom-select summary")[1]
          ?.textContent?.trim(),
      };
    });

    assert.deepEqual(roundtrip.patches, [
      { bodyFontFamily: "Microsoft YaHei UI" },
      { bodyFontFamily: null },
      { codeFontFamily: "Cascadia Code" },
      { codeFontFamily: null },
    ]);
    assert.equal(roundtrip.bodyLabel, "Maple Mono NF CN");
    assert.equal(roundtrip.codeLabel, "Maple Mono NF CN");

    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    await mkdir(dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    console.log(
      JSON.stringify(
        {
          status: "passed",
          url: qaUrl,
          screenshotPath,
          scrollCheck,
          hoverCheck,
          trackClickCheck,
          dragPressCheck,
          dragCheck,
          patches: roundtrip.patches,
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

async function dispatchMouse(cdp, type, point) {
  await cdp.send("Input.dispatchMouseEvent", {
    button: type === "mouseMoved" ? "none" : (point.button ?? "left"),
    buttons: point.buttons ?? (type === "mousePressed" ? 1 : 0),
    clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0,
    type,
    x: point.x,
    y: point.y,
  });
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

async function connectToPage(port, expectedUrl) {
  const versionUrl = `http://127.0.0.1:${port}/json`;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(versionUrl);
      const pages = await response.json();
      const page = pages.find((candidate) => candidate.url === expectedUrl) ?? pages[0];

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
  const domcontentloaded = "document.readyState !== 'loading'";

  await waitForExpression(cdp, domcontentloaded, 10_000);
}

async function evaluate(cdp, pageFunction) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(${pageFunction})()`,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }

  return result.result.value;
}

await main();
