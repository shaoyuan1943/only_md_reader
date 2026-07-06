import { toString as hastToString } from "hast-util-to-string";
import type { Element, Properties, Root } from "hast";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Root as MarkdownRoot } from "mdast";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { ThemeRegistrationAny } from "shiki";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import evaDarkBold from "../../assets/shiki-themes/eva-dark-bold.json" with { type: "json" };
import evaLightBold from "../../assets/shiki-themes/eva-light-bold.json" with { type: "json" };
import type { ThemeColorMode } from "../../shared/theme/theme-schema.ts";
import type { ReaderOutlineItem } from "../reader/reader-outline.ts";

type MarkdownRenderOptions = {
  content: string;
  filePath: string;
  resolveImageSrc?: (absolutePath: string) => string;
  themeMode: ThemeColorMode;
};

type MarkdownRenderError = {
  message: string;
};

export type MarkdownRenderResult = {
  codeThemeName: "Eva Light Bold" | "Eva Dark Bold";
  error: MarkdownRenderError | null;
  html: string;
  outlineItems: ReaderOutlineItem[];
};

type MarkdownHeadingNode = MarkdownRoot["children"][number] & {
  depth?: number;
};

const markdownSyntaxColorTokenMap = {
  bodyText: "var(--text-primary)",
  heading1: "var(--heading1)",
  heading2: "var(--heading2)",
  link: "var(--link)",
  blockquoteBackground: "var(--blockquote-bg)",
  blockquoteBorder: "var(--blockquote-border)",
  markBackground: "var(--mark-bg)",
  tableHeaderBackground: "var(--table-header-bg)",
  tableBorder: "var(--table-border)",
  codeBlockBackground: "var(--code-bg)",
  inlineCodeBackground: "var(--code-bg)",
  errorText: "var(--button-danger-bg)",
  mutedText: "var(--text-muted)",
  selectionBackground: "var(--selection-bg)",
} as const;

const codeThemeByMode = {
  light: {
    name: "Eva Light Bold",
    theme: evaLightBold as ThemeRegistrationAny,
  },
  dark: {
    name: "Eva Dark Bold",
    theme: evaDarkBold as ThemeRegistrationAny,
  },
} as const;

type ShikiCodeToHtml = (typeof import("shiki"))["codeToHtml"];

let shikiRuntimePromise: Promise<ShikiCodeToHtml> | null = null;

const katexClassNames = [
  "accent",
  "accent-body",
  "accent-full",
  "accentunder",
  "allowbreak",
  "amsrm",
  "angl",
  "anglpad",
  "arraycolsep",
  "base",
  "boldsymbol",
  "boxpad",
  "brace-center",
  "brace-left",
  "brace-right",
  "cancel-lap",
  "cancel-pad",
  "cd-arrow-pad",
  "cd-label-left",
  "cd-label-right",
  "cd-vert-arrow",
  "clap",
  "col-align-c",
  "col-align-l",
  "col-align-r",
  "com",
  "delim-size1",
  "delim-size4",
  "delimcenter",
  "delimsizing",
  "eqn-num",
  "fbox",
  "fcolorbox",
  "fix",
  "fleqn",
  "fontsize-ensurer",
  "frac-line",
  "halfarrow-left",
  "halfarrow-right",
  "hbox",
  "hdashline",
  "hide-tail",
  "hline",
  "inner",
  "katex",
  "katex-display",
  "katex-html",
  "katex-mathml",
  "katex-version",
  "large-op",
  "leqno",
  "llap",
  "mainrm",
  "mathbb",
  "mathbf",
  "mathboldfrak",
  "mathboldsf",
  "mathcal",
  "mathfrak",
  "mathit",
  "mathitsf",
  "mathnormal",
  "mathrm",
  "mathscr",
  "mathsf",
  "mathsfit",
  "mathtt",
  "mbin",
  "mclose",
  "mfrac",
  "minner",
  "mml-eqn-num",
  "mop",
  "mopen",
  "mord",
  "mover",
  "mpunct",
  "mrel",
  "mspace",
  "msupsub",
  "mtable",
  "mtr-glue",
  "mult",
  "munder",
  "newline",
  "nulldelimiter",
  "op-limits",
  "op-symbol",
  "overlay",
  "overline",
  "overline-line",
  "pstrut",
  "reset-size1",
  "reset-size10",
  "reset-size11",
  "reset-size2",
  "reset-size3",
  "reset-size4",
  "reset-size5",
  "reset-size6",
  "reset-size7",
  "reset-size8",
  "reset-size9",
  "rlap",
  "root",
  "rule",
  "size1",
  "size10",
  "size11",
  "size2",
  "size3",
  "size4",
  "size5",
  "size6",
  "size7",
  "size8",
  "size9",
  "sizing",
  "small-op",
  "smash",
  "sout",
  "sqrt",
  "stretchy",
  "strut",
  "svg-align",
  "tag",
  "text",
  "textbb",
  "textbf",
  "textboldfrak",
  "textboldsf",
  "textfrak",
  "textit",
  "textitsf",
  "textrm",
  "textscr",
  "textsf",
  "texttt",
  "thinbox",
  "underline",
  "underline-line",
  "vbox",
  "vertical-separator",
  "vlist",
  "vlist-r",
  "vlist-s",
  "vlist-t",
  "vlist-t2",
  "x-arrow",
  "x-arrow-pad",
] as const;

const allowedClassNames = [
  "contains-task-list",
  "language-*",
  "line",
  "markdown-code-copy-button",
  "markdown-code-copy-icon",
  "markdown-code-block",
  "markdown-code-scroller",
  "markdown-image",
  "markdown-image-fallback",
  "markdown-math-error",
  "markdown-table-wrapper",
  "html",
  "math",
  "math-display",
  "math-inline",
  "textstyle",
  ...katexClassNames,
] as const;

export function getMarkdownSyntaxColorTokenMap(): Record<
  keyof typeof markdownSyntaxColorTokenMap,
  string
> {
  return { ...markdownSyntaxColorTokenMap };
}

export function createSlugger() {
  const slugCounts = new Map<string, number>();

  return {
    slug(label: string): string {
      const baseSlug =
        label
          .trim()
          .toLowerCase()
          .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
          .replace(/^-+|-+$/g, "") || "heading";
      const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;

      slugCounts.set(baseSlug, nextCount);

      return nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
    },
  };
}

export async function renderMarkdownDocument(
  options: MarkdownRenderOptions,
): Promise<MarkdownRenderResult> {
  try {
    const codeTheme = codeThemeByMode[options.themeMode];
    const preprocessed = await highlightFencedCode(options.content, options.themeMode);
    const outlineItems = extractOutlineFromAst(options.content);
    const html = String(
      await createMarkdownProcessor({
        filePath: options.filePath,
        resolveImageSrc: options.resolveImageSrc,
      }).process(preprocessed),
    );

    return {
      codeThemeName: codeTheme.name,
      error: null,
      html,
      outlineItems,
    };
  } catch (error) {
    return createMarkdownRenderError(error, options.content);
  }
}

export function createMarkdownRenderError(
  error: unknown,
  source: string,
): MarkdownRenderResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    codeThemeName: "Eva Light Bold",
    error: { message },
    html: `<section class="markdown-render-error" role="alert"><h2>Markdown 渲染失败</h2><p>${escapeHtml(
      message,
    )}</p><pre><code>${escapeHtml(source)}</code></pre></section>`,
    outlineItems: [],
  };
}

function extractOutlineFromAst(content: string): ReaderOutlineItem[] {
  const tree: MarkdownRoot = unified().use(remarkParse).parse(content);
  const slugger = createSlugger();
  const outlineItems: ReaderOutlineItem[] = [];

  visit(tree, "heading", (node: MarkdownHeadingNode) => {
    const label = mdastToString(node).trim();

    if (!label) {
      return;
    }

    outlineItems.push({
      id: slugger.slug(label),
      label,
      level: node.depth ?? 1,
    });
  });

  return outlineItems;
}

function createMarkdownProcessor({
  filePath,
  resolveImageSrc,
}: {
  filePath: string;
  resolveImageSrc?: (absolutePath: string) => string;
}) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex, { throwOnError: false, strict: "ignore" } as never)
    .use(rehypeReaderEnhancements, { filePath, resolveImageSrc })
    .use(rehypeSanitize, readerSanitizeSchema as never)
    .use(rehypeStringify, { allowDangerousHtml: false });
}

function rehypeReaderEnhancements({
  filePath,
  resolveImageSrc,
}: {
  filePath: string;
  resolveImageSrc?: (absolutePath: string) => string;
}) {
  return (tree: Root) => {
    const slugger = createSlugger();

    visit(tree, "element", (node: Element, index, parent) => {
      if (!node.tagName) {
        return;
      }

      if (/^h[1-6]$/.test(node.tagName)) {
        const label = hastToString(node).trim();

        if (label) {
          node.properties = {
            ...node.properties,
            id: slugger.slug(label),
          };
        }
      }

      if (node.tagName === "table" && parent?.children && typeof index === "number") {
        parent.children[index] = {
          type: "element",
          tagName: "div",
          properties: { className: ["markdown-table-wrapper"] },
          children: [node],
        };
      }

      if (node.tagName === "img") {
        node.properties = enhanceImageProperties({
          filePath,
          properties: node.properties ?? {},
          resolveImageSrc,
        });
      }

      if (node.tagName === "span") {
        const classes = classList(node.properties?.className);

        if (classes.includes("katex-error")) {
          node.properties = {
            ...node.properties,
            className: ["markdown-math-error"],
            style: undefined,
            title: String(node.properties?.title ?? "公式渲染失败"),
          };
        }
      }
    });
  };
}

async function highlightFencedCode(
  content: string,
  themeMode: ThemeColorMode,
): Promise<string> {
  const codeTheme = codeThemeByMode[themeMode];
  const codeBlockPattern =
    /(^|\n)(`{3,}|~{3,})([^\r\n`]*)\r?\n([\s\S]*?)\r?\n\2[ \t]*(?=\r?\n|$)/g;
  const replacements: Array<{ from: string; to: string }> = [];

  for (const match of content.matchAll(codeBlockPattern)) {
    const fullMatch = match[0];
    const fenceStart = match[1] ?? "";
    const language = normalizeCodeLanguage(match[3] ?? "");
    const code = match[4] ?? "";
    const html = isPlainTextCodeLanguage(language)
      ? renderPlainTextCodeBlock({
          code,
          codeThemeName: codeTheme.name,
          language,
        })
      : await highlightCodeBlock({
          code,
          codeThemeName: codeTheme.name,
          language,
          theme: codeTheme.theme,
        });

    replacements.push({
      from: fullMatch,
      to: `${fenceStart}<div class="markdown-code-scroller"><button class="markdown-code-copy-button" type="button" aria-label="复制代码块" title="复制代码块" data-copy-code="${encodeURIComponent(
        code,
      )}"><span class="markdown-code-copy-icon" aria-hidden="true"></span></button>${html}</div>`,
    });
  }

  return replacements.reduce(
    (currentContent, replacement) =>
      currentContent.replace(replacement.from, replacement.to),
    content,
  );
}

function isPlainTextCodeLanguage(language: string): boolean {
  return (
    language === "" || language === "text" || language === "txt" || language === "plain"
  );
}

function renderPlainTextCodeBlock({
  code,
  codeThemeName,
  language,
}: {
  code: string;
  codeThemeName: "Eva Light Bold" | "Eva Dark Bold";
  language: string;
}): string {
  return `<pre class="markdown-code-block" data-language="${escapeAttribute(
    language || "text",
  )}" data-code-theme="${codeThemeName}"><code>${escapeHtml(code)}</code></pre>`;
}

async function highlightCodeBlock({
  code,
  codeThemeName,
  language,
  theme,
}: {
  code: string;
  codeThemeName: "Eva Light Bold" | "Eva Dark Bold";
  language: string;
  theme: ThemeRegistrationAny;
}): Promise<string> {
  try {
    const codeToHtml = await getShikiCodeToHtml();

    return await codeToHtml(code, {
      lang: language || "text",
      theme,
      transformers: [
        {
          pre(node) {
            node.properties = {
              ...node.properties,
              class: "markdown-code-block",
              "data-language": language || "text",
              "data-code-theme": codeThemeName,
              style: removeCodeBlockContainerStyles(
                String(node.properties?.style ?? ""),
              ),
            };
          },
        },
      ],
    });
  } catch {
    return `<pre class="markdown-code-block" data-language="${escapeAttribute(
      language || "text",
    )}" data-code-theme="${codeThemeName}"><code>${escapeHtml(code)}</code></pre>`;
  }
}

async function getShikiCodeToHtml(): Promise<ShikiCodeToHtml> {
  shikiRuntimePromise ??= loadShikiCodeToHtml();

  return shikiRuntimePromise;
}

async function loadShikiCodeToHtml(): Promise<ShikiCodeToHtml> {
  const module = await import("shiki");

  return module.codeToHtml;
}

function removeCodeBlockContainerStyles(style: string): string | undefined {
  const allowedDeclarations = style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter(
      (declaration) => !/^(?:background(?:-color)?|font-family)\s*:/i.test(declaration),
    );

  return allowedDeclarations.length > 0 ? allowedDeclarations.join(";") : undefined;
}

function normalizeCodeLanguage(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "text";
}

function enhanceImageProperties({
  filePath,
  properties,
  resolveImageSrc,
}: {
  filePath: string;
  properties: Properties;
  resolveImageSrc?: (absolutePath: string) => string;
}): Properties {
  const src = String(properties.src ?? "");

  if (!src || isAbsoluteOrDataUrl(src)) {
    return {
      ...properties,
      className: appendClass(properties.className, "markdown-image"),
    };
  }

  const localPath = resolveRelativeImagePath(src, filePath);

  return {
    ...properties,
    className: appendClass(properties.className, "markdown-image"),
    "data-local-src": localPath,
    "data-source-src": src,
    src: resolveImageSrc?.(localPath) ?? localPathToFileUrl(localPath),
  };
}

function resolveRelativeImagePath(src: string, filePath: string): string {
  const normalizedFilePath = normalizeLocalFilePath(filePath);
  const basePath = normalizedFilePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "/");
  const resolved = new URL(
    src,
    `file:///${basePath.replace(/^([A-Za-z]):\//, "$1:/")}`,
  );

  return decodeURIComponent(resolved.pathname)
    .replace(/^\/([A-Za-z]:\/)/, "$1")
    .replace(/\//g, normalizedFilePath.includes("\\") ? "\\" : "/");
}

function localPathToFileUrl(path: string): string {
  const normalizedPath = normalizeLocalFilePath(path).replace(/\\/g, "/");
  const url = `file:///${normalizedPath.replace(/^([A-Za-z]):\//, "$1:/")}`;

  return url.replace("file:////", "file:///");
}

function normalizeLocalFilePath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

function isAbsoluteOrDataUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src) || src.startsWith("#");
}

function appendClass(value: unknown, className: string): string[] {
  return [...classList(value), className];
}

function classList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => classList(item));
  }

  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean);
  }

  return [];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

const readerSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      ["className", ...allowedClassNames],
      "data*",
      "style",
      "title",
    ],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      "target",
      "rel",
      ["href", "http", "https", "mailto", "tel", "#"],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", ...allowedClassNames],
    ],
    button: [
      ...(defaultSchema.attributes?.button ?? []),
      ["className", ...allowedClassNames],
      ["type", "button"],
      "ariaLabel",
      "title",
      "data*",
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      ["className", ...allowedClassNames],
      "data*",
      ["src", "asset", "file", "http", "https", "data"],
      "alt",
      "title",
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      ["checked"],
      ["disabled"],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", ...allowedClassNames],
      "style",
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      ["className", ...allowedClassNames],
      "data*",
      "style",
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", ...allowedClassNames],
      "style",
    ],
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    h5: [...(defaultSchema.attributes?.h5 ?? []), "id"],
    h6: [...(defaultSchema.attributes?.h6 ?? []), "id"],
  },
  clobberPrefix: "",
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "tel"],
    src: ["asset", "file", "http", "https", "data"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "annotation",
    "button",
    "mark",
    "math",
    "mi",
    "mn",
    "mo",
    "msup",
    "mrow",
    "semantics",
  ],
};
