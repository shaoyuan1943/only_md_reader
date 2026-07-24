import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = resolve(import.meta.dirname, "..");
const qaUrl = "http://127.0.0.1:1425/tools/open-file-ui-qa.html";
const chromePath = resolve(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright",
  "chromium-1228",
  "chrome-win64",
  "chrome.exe",
);
const outputDir = resolve(repoRoot, "output", "playwright");
const scenarios = [
  { theme: "light", screenshot: "open-file-ui-light.png" },
  { theme: "dark", screenshot: "open-file-ui-dark.png" },
];

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
    const debuggingPort = await findAvailablePort(9533);
    const profileDir = resolve(
      process.env.TEMP ?? repoRoot,
      "only-md-reader-open-file-qa-chrome",
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
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const results = [];
    for (const scenario of scenarios) {
      const url = `${qaUrl}?theme=${scenario.theme}`;
      await cdp.send("Page.navigate", { url });
      await waitForDomContentLoaded(cdp);
      await waitForExpression(
        cdp,
        "Boolean(document.querySelector('.open-file-window'))",
        10_000,
      );
      await evaluate(cdp, async () => {
        await document.fonts.ready;
      });
      await waitForAnimationFrames(cdp, 2);

      const metrics = await evaluate(cdp, () => {
        const card = document.querySelector(".open-file-window");
        const shell = document.querySelector(".app-shell");
        const cardRect = card.getBoundingClientRect();
        const styles = getComputedStyle(card);
        const shellStyles = getComputedStyle(shell);
        const panelProbe = document.createElement("div");
        panelProbe.style.boxShadow = "var(--panel-shadow)";
        document.body.append(panelProbe);
        const computedPanelShadow = getComputedStyle(panelProbe).boxShadow;
        panelProbe.remove();

        return {
          effectiveTheme: document.documentElement.dataset.themeEffectiveMode,
          boxShadow: styles.boxShadow,
          panelShadow: computedPanelShadow,
          borderRadius: styles.borderRadius,
          borderWidth: styles.borderWidth,
          shellPadding: shellStyles.padding,
          insetLeft: cardRect.left,
          insetTop: cardRect.top,
          insetRight: window.innerWidth - cardRect.right,
          insetBottom: window.innerHeight - cardRect.bottom,
        };
      });

      assert.equal(metrics.effectiveTheme, scenario.theme);
      assert.equal(metrics.borderRadius, "22px");
      assert.equal(metrics.borderWidth, "1px");
      assert.equal(metrics.shellPadding, "18px");
      assert.equal(metrics.insetLeft, 17);
      assert.equal(metrics.insetTop, 17);
      assert.equal(metrics.insetRight, 17);
      assert.equal(metrics.insetBottom, 17);

      if (scenario.theme === "dark") {
        assert.match(metrics.boxShadow, /rgba?\(0, 0, 0, 0\.52\)/);
        assert.match(metrics.boxShadow, /rgba?\(0, 0, 0, 0\.34\)/);
        assert.match(metrics.boxShadow, /0px 0px 24px -8px/);
        assert.match(metrics.boxShadow, /0px 0px 8px -2px/);
      } else {
        assert.equal(metrics.boxShadow, metrics.panelShadow);
      }

      const screenshotPath = resolve(outputDir, scenario.screenshot);
      const screenshot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      results.push({
        theme: scenario.theme,
        url,
        screenshotPath,
        metrics,
      });
    }

    console.log(
      JSON.stringify(
        {
          status: "passed",
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

async function ensureViteServer() {
  if (await canFetch(qaUrl)) {
    return { startedByScript: false, process: null };
  }

  const viteChild = spawn(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "pnpm",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "1425",
      "--strictPort",
    ],
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

async function canFetch(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
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
