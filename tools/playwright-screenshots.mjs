import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import playwright from "./verify/node_modules/playwright/index.js";

const { chromium } = playwright;

const repoRoot = resolve(import.meta.dirname, "..");
const outputDir = resolve(repoRoot, "output", "playwright");
const pages = [
  { name: "open-file", path: resolve(repoRoot, "docs", "ui", "open-file.html") },
  { name: "reader", path: resolve(repoRoot, "docs", "ui", "reader.html") },
  { name: "settings", path: resolve(repoRoot, "docs", "ui", "settings.html") },
];
const viewports = [
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "small-980x700", width: 980, height: 700 },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const generated = [];

try {
  for (const pageSpec of pages) {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: {
          width: viewport.width,
          height: viewport.height,
        },
        deviceScaleFactor: 2,
      });
      const url = pathToFileURL(pageSpec.path).href;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(150);

      const health = await page.evaluate(() => ({
        title: document.title,
        bodyTextLength: document.body.textContent?.length ?? 0,
        hasLight: Boolean(document.querySelector(".warm-paper-light")),
        hasDark: Boolean(document.querySelector(".warm-paper-dark")),
        hasThemeStack: Boolean(document.querySelector(".theme-stack")),
      }));

      assert.ok(health.bodyTextLength > 100, `${pageSpec.name} screenshot page is blank`);
      assert.equal(health.hasLight, true, `${pageSpec.name} should include light theme`);
      assert.equal(health.hasDark, true, `${pageSpec.name} should include dark theme`);
      assert.equal(health.hasThemeStack, true, `${pageSpec.name} should include theme stack`);

      const screenshotPath = resolve(
        outputDir,
        `${pageSpec.name}-${viewport.name}.png`,
      );
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      generated.push({
        page: pageSpec.name,
        viewport,
        screenshotPath,
        title: health.title,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      outputDir,
      generated,
    },
    null,
    2,
  ),
);
