import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const rendererUrl = pathToFileURL(
  resolve(repoRoot, "src", "features", "markdown", "markdown-renderer.ts"),
);
const { renderMarkdownDocument } = await import(rendererUrl.href);

const cases = [
  { label: "1MB", targetBytes: 1 * 1024 * 1024, maxMs: 12_000 },
  { label: "5MB", targetBytes: 5 * 1024 * 1024, maxMs: 24_000 },
  { label: "10MB", targetBytes: 10 * 1024 * 1024, maxMs: 45_000 },
];

const results = [];

for (const testCase of cases) {
  const content = createLargeMarkdown(testCase.targetBytes);
  const startedAt = performance.now();
  const rendered = await renderMarkdownDocument({
    content,
    filePath: resolve(repoRoot, "fixtures", "markdown", `${testCase.label}.md`),
    themeMode: "light",
  });
  const durationMs = Math.round(performance.now() - startedAt);

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /Large Markdown Performance/);
  assert.match(rendered.html, /markdown-code-block/);
  assert.match(rendered.html, /markdown-table-wrapper/);
  assert.ok(
    durationMs <= testCase.maxMs,
    `${testCase.label} render took ${durationMs}ms, expected <= ${testCase.maxMs}ms`,
  );

  results.push({
    label: testCase.label,
    bytes: Buffer.byteLength(content, "utf8"),
    durationMs,
    maxMs: testCase.maxMs,
    htmlBytes: Buffer.byteLength(rendered.html, "utf8"),
    outlineItems: rendered.outlineItems.length,
  });
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      cases: results,
    },
    null,
    2,
  ),
);

function createLargeMarkdown(targetBytes) {
  const header = [
    "# Large Markdown Performance",
    "",
    "This generated fixture covers headings, paragraphs, tables, code, math, and images.",
    "",
    "## Baseline Rich Blocks",
    "",
    "| Column A | Column B | Column C | Column D |",
    "| --- | --- | --- | --- |",
    "| Alpha | Beta | Gamma | Delta |",
    "",
    "```ts",
    "export const performanceFixture = true;",
    "```",
    "",
    "Inline math $E = mc^2$ and a missing image ![missing](./assets/missing.png).",
    "",
  ].join("\n");
  const paragraph =
    "Repeated paragraph with Chinese text, ASCII words, and enough content to exercise wrapping without adding expensive code highlighting. ";
  const section = [
    "## Generated Section",
    "",
    paragraph.repeat(16),
    "",
  ].join("\n");
  let content = header;

  while (Buffer.byteLength(content, "utf8") < targetBytes) {
    content += section;
  }

  return content;
}
