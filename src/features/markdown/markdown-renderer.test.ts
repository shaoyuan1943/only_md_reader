import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createMarkdownRenderError,
  createSlugger,
  getMarkdownSyntaxColorTokenMap,
  renderMarkdownDocument,
} from "./markdown-renderer.ts";

const fixturesDir = resolve(process.cwd(), "fixtures", "markdown");

void test("renders CommonMark and GFM features through the markdown pipeline", async () => {
  const content = await readFixture("gfm-table-task-list.md");

  const rendered = await renderMarkdownDocument({
    content,
    filePath: resolve(fixturesDir, "gfm-table-task-list.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /<table>/);
  assert.match(rendered.html, /<del>removed text<\/del>/);
  assert.match(rendered.html, /task-list-item/);
  assert.match(
    rendered.html,
    /<a href="https:\/\/example\.com\/docs\/markdown-reader"/,
  );
});

void test("sanitizes unsafe markdown html while keeping the document readable", async () => {
  const content = await readFixture("malicious-html.md");

  const rendered = await renderMarkdownDocument({
    content,
    filePath: resolve(fixturesDir, "malicious-html.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.doesNotMatch(rendered.html, /<script/i);
  assert.doesNotMatch(rendered.html, /onerror/i);
  assert.doesNotMatch(rendered.html, /javascript:/i);
  assert.match(rendered.html, /dangerous link/);
});

void test("sanitizes mixed unsafe html without dropping surrounding trusted markdown", async () => {
  const rendered = await renderMarkdownDocument({
    content:
      '# Safe title\n\nBefore unsafe HTML.\n\n<div onclick="window.bad = true">kept text</div>\n\n<a href="vbscript:msgbox(1)">unsafe scheme</a>\n\n<script>alert(\'x\')</script>\n\nAfter unsafe HTML.',
    filePath: resolve(fixturesDir, "malicious-html.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /Safe title/);
  assert.match(rendered.html, /Before unsafe HTML/);
  assert.match(rendered.html, /kept text/);
  assert.match(rendered.html, /unsafe scheme/);
  assert.match(rendered.html, /After unsafe HTML/);
  assert.doesNotMatch(rendered.html, /<script/i);
  assert.doesNotMatch(rendered.html, /onclick/i);
  assert.doesNotMatch(rendered.html, /vbscript:/i);
});

void test("keeps safe inline mark elements for token-colored highlights", async () => {
  const rendered = await renderMarkdownDocument({
    content: "Important <mark>highlighted text</mark> stays visible.",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /<mark>highlighted text<\/mark>/);
});

void test("resolves relative image paths against the markdown file directory", async () => {
  const content = await readFixture("relative-image.md");

  const rendered = await renderMarkdownDocument({
    content,
    filePath: resolve(fixturesDir, "relative-image.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /src="file:\/\//);
  assert.match(rendered.html, /data-local-src="[^"]*assets[\\/]relative-image\.svg"/);
  assert.match(rendered.html, /data-source-src="\.\/assets\/relative-image\.svg"/);
});

void test("resolves relative image paths from Windows extended-length file paths", async () => {
  const content = await readFixture("relative-image.md");

  const rendered = await renderMarkdownDocument({
    content,
    filePath: String.raw`\\?\E:\only_md_reader\fixtures\markdown\relative-image.md`,
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(
    rendered.html,
    /data-local-src="E:\\only_md_reader\\fixtures\\markdown\\assets\\relative-image\.svg"/,
  );
  assert.match(rendered.html, /data-source-src="\.\/assets\/relative-image\.svg"/);
});

void test("can route resolved image paths through the desktop asset protocol", async () => {
  const content = await readFixture("relative-image.md");
  const resolvedPaths: string[] = [];

  const rendered = await renderMarkdownDocument({
    content,
    filePath: resolve(fixturesDir, "relative-image.md"),
    resolveImageSrc: (absolutePath) => {
      resolvedPaths.push(absolutePath);
      return `asset://localhost/${absolutePath.replace(/\\/g, "/")}`;
    },
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.equal(resolvedPaths.length, 1);
  assert.match(resolvedPaths[0], /assets[\\/]relative-image\.svg$/);
  assert.match(rendered.html, /src="asset:\/\/localhost\//);
});

void test("extracts headings from the markdown AST with stable duplicate slugs", async () => {
  const rendered = await renderMarkdownDocument({
    content: "# Title\n\n## Intro\n\n### Detail\n\n## Intro",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.deepEqual(rendered.outlineItems, [
    { id: "title", label: "Title", level: 1 },
    { id: "intro", label: "Intro", level: 2 },
    { id: "detail", label: "Detail", level: 3 },
    { id: "intro-2", label: "Intro", level: 2 },
  ]);
  assert.match(rendered.html, /<h1 id="title">Title<\/h1>/);
  assert.match(rendered.html, /<h2 id="intro-2">Intro<\/h2>/);
});

void test("renders KaTeX math without turning a bad formula into a blank document", async () => {
  const rendered = await renderMarkdownDocument({
    content: "Inline $E = mc^2$.\n\nBad $\\notacommand{$ formula.\n\nAfter math.",
    filePath: resolve(fixturesDir, "math.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /katex/);
  assert.match(rendered.html, /markdown-math-error/);
  assert.match(rendered.html, /After math/);
  assert.doesNotMatch(rendered.html, /#cc0000/i);
  assert.doesNotMatch(rendered.html, /style="[^"]*color:/i);
});

void test("keeps KaTeX layout classes after sanitizing rendered math", async () => {
  const rendered = await renderMarkdownDocument({
    content: "Inline $E = mc^2$.",
    filePath: resolve(fixturesDir, "math.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /class="katex-mathml"/);
  assert.match(rendered.html, /class="katex-html"/);
  assert.match(rendered.html, /class="mord mathnormal"/);
});

void test("keeps the KaTeX display wrapper for block formula scrolling", async () => {
  const rendered = await renderMarkdownDocument({
    content: "$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$",
    filePath: resolve(fixturesDir, "math.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /katex-display/);
});

void test("renders highlighted code with bundled Eva theme names per theme mode", async () => {
  const content = await readFixture("long-code-wide-table.md");

  const light = await renderMarkdownDocument({
    content,
    filePath: resolve(fixturesDir, "long-code-wide-table.md"),
    themeMode: "light",
  });
  const dark = await renderMarkdownDocument({
    content,
    filePath: resolve(fixturesDir, "long-code-wide-table.md"),
    themeMode: "dark",
  });

  assert.equal(light.codeThemeName, "Eva Light Bold");
  assert.equal(dark.codeThemeName, "Eva Dark Bold");
  assert.match(light.html, /data-code-theme="Eva Light Bold"/);
  assert.match(dark.html, /data-code-theme="Eva Dark Bold"/);
  assert.match(light.html, /class="line"/);
});

void test("highlighted code blocks do not inline a background over the Warm Paper code token", async () => {
  const rendered = await renderMarkdownDocument({
    content: "```ts\nconst theme = 'warm-paper';\n```",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "dark",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /class="markdown-code-block"/);
  assert.doesNotMatch(rendered.html, /<pre[^>]*style="[^"]*background/i);
  assert.doesNotMatch(rendered.html, /<pre[^>]*style="[^"]*font-family/i);
});

void test("fenced code blocks expose a copy button with the original code text", async () => {
  const rendered = await renderMarkdownDocument({
    content: [
      "```ts",
      "const angle = '<copy-safe>';",
      "console.log(angle);",
      "```",
    ].join("\n"),
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /markdown-code-copy-button/);
  assert.match(rendered.html, /aria-label="复制代码块"/);
  assert.match(
    rendered.html,
    /data-copy-code="const%20angle%20%3D%20&#x27;%3Ccopy-safe%3E&#x27;%3B%0Aconsole\.log\(angle\)%3B"/,
  );
  assert.match(rendered.html, /data-language="ts"/);
});

void test("unknown code languages render as plain text instead of failing", async () => {
  const rendered = await renderMarkdownDocument({
    content: "```unknown-reader-lang\nconst x = 1;\n```",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /data-language="unknown-reader-lang"/);
  assert.match(rendered.html, /const x = 1;/);
});

void test("isolates bad code, math, and image blocks so later content still renders", async () => {
  const rendered = await renderMarkdownDocument({
    content: [
      "# Error isolation",
      "",
      "```definitely-not-a-shiki-language",
      "const stillVisible = true;",
      "```",
      "",
      "Bad math $\\notacommand{$ stays local.",
      "",
      "![missing local asset](./assets/not-found.png)",
      "",
      "Paragraph after all failing blocks.",
    ].join("\n"),
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /Error isolation/);
  assert.match(rendered.html, /data-language="definitely-not-a-shiki-language"/);
  assert.match(rendered.html, /const stillVisible = true;/);
  assert.match(rendered.html, /markdown-math-error/);
  assert.match(rendered.html, /markdown-image/);
  assert.match(rendered.html, /data-local-src="[^"]*assets[\\/]not-found\.png"/);
  assert.match(rendered.html, /Paragraph after all failing blocks/);
  assert.doesNotMatch(rendered.html, /markdown-render-error/);
});

void test("text and unlabeled fenced code blocks render as body-colored plain text", async () => {
  const textRendered = await renderMarkdownDocument({
    content: "```text\nPlain text line\n```",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });
  const unlabeledRendered = await renderMarkdownDocument({
    content: "```\nPlain text line\n```",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "dark",
  });

  assert.equal(textRendered.error, null);
  assert.equal(unlabeledRendered.error, null);
  assert.match(textRendered.html, /data-language="text"/);
  assert.match(unlabeledRendered.html, /data-language="text"/);
  assert.match(textRendered.html, /Plain text line/);
  assert.match(unlabeledRendered.html, /Plain text line/);
  assert.doesNotMatch(textRendered.html, /<pre[^>]*style=/);
  assert.doesNotMatch(unlabeledRendered.html, /<pre[^>]*style=/);
  assert.doesNotMatch(textRendered.html, /<span[^>]*style=/);
  assert.doesNotMatch(unlabeledRendered.html, /<span[^>]*style=/);
});

void test("enhances CRLF unlabeled fenced code blocks with the reader code wrapper", async () => {
  const rendered = await renderMarkdownDocument({
    content: ["# CRLF Code", "", "```", "", "alpha # comment", "```", ""].join("\r\n"),
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /markdown-code-scroller/);
  assert.match(rendered.html, /class="markdown-code-block"/);
  assert.match(rendered.html, /data-language="text"/);
  assert.match(rendered.html, /alpha # comment/);
});

void test("enhances CommonMark indented code blocks with the reader code wrapper", async () => {
  const rendered = await renderMarkdownDocument({
    content: [
      "# Indented Code",
      "",
      "Before.",
      "",
      "    API Error: API returned an empty or malformed response (HTTP 200)",
      "    -- check for a proxy or gateway intercepting the request",
      "",
      "After.",
    ].join("\n"),
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "light",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /markdown-code-scroller/);
  assert.match(rendered.html, /class="markdown-code-block"/);
  assert.match(rendered.html, /data-language="text"/);
  assert.match(
    rendered.html,
    /data-copy-code="API%20Error%3A%20API%20returned%20an%20empty%20or%20malformed%20response%20\(HTTP%20200\)%0A--%20check%20for%20a%20proxy%20or%20gateway%20intercepting%20the%20request"/,
  );
  assert.match(rendered.html, /API Error: API returned an empty or malformed response/);
  assert.match(rendered.html, /After\./);
});

void test("indented code blocks inherit the active code theme", async () => {
  const rendered = await renderMarkdownDocument({
    content: "    plain indented code",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "dark",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /data-code-theme="Eva Dark Bold"/);
});

void test("render errors produce a readable fallback document", () => {
  const rendered = createMarkdownRenderError(new Error("boom"), "# Title");

  assert.equal(rendered.error?.message, "boom");
  assert.match(rendered.html, /markdown-render-error/);
  assert.match(rendered.html, /# Title/);
});

void test("slugger is stable for punctuation, unicode, and duplicates", () => {
  const slugger = createSlugger();

  assert.equal(slugger.slug("Hello, World!"), "hello-world");
  assert.equal(slugger.slug("Hello World"), "hello-world-2");
  assert.equal(slugger.slug("中文 标题"), "中文-标题");
});

void test("markdown syntax color map only references theme css variables", () => {
  const colorMap = getMarkdownSyntaxColorTokenMap();

  assert.equal(colorMap.heading1, "var(--heading1)");
  assert.equal(colorMap.link, "var(--link)");
  assert.equal(colorMap.tableBorder, "var(--table-border)");
  assert.equal(colorMap.codeBlockBackground, "var(--code-bg)");

  for (const value of Object.values(colorMap)) {
    assert.match(value, /^var\(--[a-z0-9-]+\)$/);
  }
});

async function readFixture(name: string): Promise<string> {
  return readFile(resolve(fixturesDir, name), "utf8");
}

void test("PDF printing can select the bundled light Shiki tokens", async () => {
  const rendered = await renderMarkdownDocument({
    content: "```ts\nconst printed = true;\n```",
    filePath: resolve(fixturesDir, "basic-syntax.md"),
    themeMode: "dark",
  });

  assert.equal(rendered.error, null);
  assert.match(rendered.html, /--shiki-light:/);
  assert.match(rendered.html, /--shiki-dark:/);
});
