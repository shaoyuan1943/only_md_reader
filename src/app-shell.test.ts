import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  version?: string;
};
const appIconSvgUrl = new URL("../src-tauri/icons/app-icon.svg", import.meta.url);
const appIconSvg = existsSync(appIconSvgUrl) ? readFileSync(appIconSvgUrl, "utf8") : "";
const appIconOuterPathPattern =
  /M781\.2 63\.9H243\.6c-65\.9 0-119\.5 53\.4-119\.5 119\.5v657c0 65\.9/;
const appIconContentPathPattern = /M721\.8 721H303\.7c-16\.4 0-29\.9 13\.4-29\.9 29\.9/;
const appIconLetterPathPattern = /M596\.8 482\.3V337\.5c0-13\.3 0\.7-30\.1 2-50\.4/;
const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
) as {
  version?: string;
  productName?: string;
  app?: {
    security?: {
      assetProtocol?: {
        enable?: boolean;
        scope?: string[];
      };
    };
    windows?: Array<Record<string, unknown>>;
  };
  bundle?: {
    targets?: string[];
    windows?: {
      wix?: {
        language?: string;
        template?: string;
        fragmentPaths?: string[];
        componentRefs?: string[];
      };
    };
    fileAssociations?: Array<{
      ext?: string[];
      mimeType?: string;
      name?: string;
    }>;
  };
};
const tauriCargoToml = readFileSync(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8",
);
const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const themeCss = readFileSync(
  new URL("./shared/theme/theme.css", import.meta.url),
  "utf8",
);
const mainTsx = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const openFileWindowTsx = readFileSync(
  new URL("./features/open-file/OpenFileWindow.tsx", import.meta.url),
  "utf8",
);
const openFileApiTs = readFileSync(
  new URL("./features/open-file/open-file-api.ts", import.meta.url),
  "utf8",
);
const readerWindowTsx = readFileSync(
  new URL("./features/reader/ReaderPreviewWindow.tsx", import.meta.url),
  "utf8",
);
const pdfExportCss = readFileSync(
  new URL("./features/export-pdf/pdf-export.css", import.meta.url),
  "utf8",
);
const settingsWindowTsx = readFileSync(
  new URL("./features/settings/SettingsWindow.tsx", import.meta.url),
  "utf8",
);

void test("PDF export snapshots the persisted scaling mode for each export", () => {
  assert.match(readerWindowTsx, /settingsApi\.getReaderSettings\(\)/);
  assert.match(readerWindowTsx, /pdfAllowGlobalScaling/);
  assert.match(readerWindowTsx, /preparePdfPrintLayout/);
});

void test("PDF export notifications expose a compact close control", () => {
  assert.match(readerWindowTsx, /aria-label="关闭通知"/);
  assert.match(readerWindowTsx, /title="关闭通知"/);
  assert.match(readerWindowTsx, /onClose\(notification\.id\)/);
  assert.match(
    readerWindowTsx,
    /M859\.00288 178\.741248c-188\.43648-188\.471296-495\.06304/,
  );
  assert.match(readerWindowTsx, /M571\.764736 518\.862848l154\.630144-154\.871808/);

  const notificationRule = getCssRuleBody(".reader-preview-notification");
  const closeButtonRule = getCssRuleBody(".reader-preview-notification-close-button");
  const closeIconRule = getCssRuleBody(".reader-preview-notification-close-button svg");
  const errorNotificationRule = getCssRuleBody(
    '.reader-preview-notification[data-kind="error"]',
  );
  const titleRule = getCssRuleBodyContainingSelector(
    ".reader-preview-notification-title",
    "padding-right",
  );
  const detailRule = getCssRuleBodyContainingSelector(
    ".reader-preview-notification-detail",
    "padding-right",
  );

  assert.match(notificationRule, /\bposition:\s*relative;/);
  assert.match(notificationRule, /\bborder:\s*0;/);
  assert.match(notificationRule, /\bpadding:\s*12px 15px;/);
  assert.equal(getCssPxDeclaration(closeButtonRule, "top"), 9);
  assert.equal(getCssPxDeclaration(closeButtonRule, "right"), 9);
  assert.equal(getCssPxDeclaration(closeButtonRule, "width"), 24);
  assert.equal(getCssPxDeclaration(closeButtonRule, "height"), 24);
  assert.equal(getCssPxDeclaration(closeIconRule, "width"), 16);
  assert.equal(getCssPxDeclaration(closeIconRule, "height"), 16);
  assert.equal(getCssPxDeclaration(titleRule, "padding-right"), 28);
  assert.equal(getCssPxDeclaration(detailRule, "padding-right"), 28);
  assert.match(errorNotificationRule, /\bcolor:\s*var\(--button-danger-bg\);/);
  assert.doesNotMatch(errorNotificationRule, /\bborder(?:-[a-z]+)?:/);

  const closeHandler = readerWindowTsx.match(
    /const closeReaderNotification = useCallback\(\(id: string\) => \{(?<body>[\s\S]*?)\n {2}\}, \[\]\);/,
  );
  assert.ok(
    closeHandler?.groups?.body,
    "Missing closeReaderNotification callback body",
  );

  const closeHandlerBody = closeHandler.groups.body;
  const clearTimerIndex = closeHandlerBody.indexOf("window.clearTimeout(successTimer)");
  const deleteTimerIndex = closeHandlerBody.indexOf(
    "readerNotificationSuccessTimersRef.current.delete(id)",
  );
  const closeStateIndex = closeHandlerBody.indexOf(
    "closeReaderNotificationState(current, id)",
  );

  assert.match(
    closeHandlerBody,
    /readerNotificationSuccessTimersRef\.current\.get\(id\)/,
  );
  assert.ok(clearTimerIndex >= 0, "Success timer must be cleared when closed manually");
  assert.ok(
    deleteTimerIndex > clearTimerIndex,
    "Success timer must be deleted after clear",
  );
  assert.ok(
    closeStateIndex > deleteTimerIndex,
    "Success timer cleanup must happen before closing notification state",
  );
});
const readBootWindowEntry = () => {
  const bootWindowEntryUrl = new URL("./boot-window.ts", import.meta.url);

  return existsSync(bootWindowEntryUrl) ? readFileSync(bootWindowEntryUrl, "utf8") : "";
};
const tauriLibRs = readFileSync(
  new URL("../src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);
const startupWindowRs = readFileSync(
  new URL("../src-tauri/src/startup_window.rs", import.meta.url),
  "utf8",
);
const settingsRs = readFileSync(
  new URL("../src-tauri/src/settings.rs", import.meta.url),
  "utf8",
);
const fontFamiliesRs = readFileSync(
  new URL("../src-tauri/src/font_families.rs", import.meta.url),
  "utf8",
);
const windowStateRs = readFileSync(
  new URL("../src-tauri/src/window_state.rs", import.meta.url),
  "utf8",
);
const tauriBuildRs = readFileSync(
  new URL("../src-tauri/build.rs", import.meta.url),
  "utf8",
);
const wixTemplateUrl = new URL("../src-tauri/wix/main.wxs", import.meta.url);
const wixTemplate = existsSync(wixTemplateUrl)
  ? readFileSync(wixTemplateUrl, "utf8")
  : "";
const wixMarkdownDefaultAppUrl = new URL(
  "../src-tauri/wix/markdown-default-app.wxs",
  import.meta.url,
);
const wixMarkdownDefaultApp = existsSync(wixMarkdownDefaultAppUrl)
  ? readFileSync(wixMarkdownDefaultAppUrl, "utf8")
  : "";
const defaultCapability = JSON.parse(
  readFileSync(
    new URL("../src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  ),
) as {
  windows?: string[];
  permissions?: string[];
};
const fontCss = readFileSync(
  new URL("./shared/fonts/maple-mono-nf-cn.css", import.meta.url),
  "utf8",
);

function getCssRuleBody(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = appCss.match(
    new RegExp(`${escapedSelector}\\s*{(?<body>[\\s\\S]*?)\\n}`),
  );

  assert.ok(match?.groups?.body, `Missing CSS rule for ${selector}`);
  return match.groups.body;
}

function getCssPxDeclaration(ruleBody: string, property: string): number {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = ruleBody.match(
    new RegExp(`\\b${escapedProperty}:\\s*(?<value>\\d+)px;`),
  );

  assert.ok(match?.groups?.value, `Missing ${property}: <px> declaration`);
  return Number.parseInt(match.groups.value, 10);
}

function getCssLeadingPxDeclaration(ruleBody: string, property: string): number {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = ruleBody.match(
    new RegExp(`\\b${escapedProperty}:\\s*(?<value>\\d+)px(?:\\s|;)`),
  );

  assert.ok(match?.groups?.value, `Missing ${property}: <px> declaration`);
  return Number.parseInt(match.groups.value, 10);
}

function getCssRuleBodyContainingSelector(
  selector: string,
  requiredProperty: string,
): string {
  const rulePattern = /(?<selectors>[^{}]+)\{(?<body>[^{}]*)\}/g;
  const selectorPattern = new RegExp(
    `(^|,)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(,|$)`,
  );

  for (const match of appCss.matchAll(rulePattern)) {
    const selectors = match.groups?.selectors ?? "";
    const body = match.groups?.body ?? "";

    if (selectorPattern.test(selectors) && body.includes(`${requiredProperty}:`)) {
      return body;
    }
  }

  assert.fail(`Missing CSS rule for ${selector} with ${requiredProperty}`);
}

void test("app shell exposes product metadata instead of Vite template defaults", () => {
  assert.match(indexHtml, /<title>MD极简阅读<\/title>/);
  assert.doesNotMatch(indexHtml, /vite\.svg/i);
});

void test("open file window is fixed size in the desktop app", () => {
  const [mainWindow] = tauriConfig.app?.windows ?? [];

  assert.equal(tauriConfig.productName, "MD极简阅读");
  assert.equal(mainWindow?.title, "MD极简阅读");
  assert.equal(mainWindow?.width, 800);
  assert.equal(mainWindow?.height, 600);
  assert.equal(mainWindow?.minWidth, 800);
  assert.equal(mainWindow?.maxWidth, 800);
  assert.equal(mainWindow?.minHeight, 600);
  assert.equal(mainWindow?.maxHeight, 600);
  assert.equal(mainWindow?.resizable, false);
  assert.equal(mainWindow?.maximizable, false);
});

void test("open file UI does not render a duplicate in-window product title", () => {
  assert.doesNotMatch(openFileWindowTsx, /open-file-titlebar/);
  assert.doesNotMatch(openFileWindowTsx, /<span>MD极简阅读<\/span>/);
});

void test("open file hero mark uses the app icon glyph without exe-only blue coloring", () => {
  assert.match(openFileWindowTsx, /function OpenFileMarkIcon\(\)/);
  assert.match(openFileWindowTsx, /<svg viewBox="0 0 1024 1024"/);
  assert.match(openFileWindowTsx, appIconOuterPathPattern);
  assert.match(openFileWindowTsx, appIconContentPathPattern);
  assert.match(openFileWindowTsx, appIconLetterPathPattern);
  assert.match(openFileWindowTsx, /fill="currentColor"/);
  assert.doesNotMatch(openFileWindowTsx, /#2563EB/i);
  assert.doesNotMatch(openFileWindowTsx, /M6\.5 3\.75h7\.25/);
});

void test("native window is created manually so its startup background follows app theme", () => {
  const [mainWindow] = tauriConfig.app?.windows ?? [];

  assert.equal(mainWindow?.create, false);
  assert.match(tauriLibRs, /\.setup\(/);
  assert.match(tauriLibRs, /create_main_window/);
  assert.match(startupWindowRs, /detect_system_theme/);
  assert.match(startupWindowRs, /startup_background_color/);
  assert.match(startupWindowRs, /startup_background_color_for_app/);
  assert.match(startupWindowRs, /startup_boot_theme_script/);
  assert.match(startupWindowRs, /effective_theme_for_app/);
  assert.match(startupWindowRs, /AppsUseLightTheme/);
  assert.match(startupWindowRs, /WebviewWindowBuilder::from_config/);
  assert.match(startupWindowRs, /\.background_color\(background_color\)/);
  assert.match(startupWindowRs, /\.initialization_script\(&initialization_script\)/);
  assert.match(startupWindowRs, /Theme::Dark/);
  assert.match(startupWindowRs, /Color\(21,\s*18,\s*16,\s*255\)/);
  assert.match(startupWindowRs, /Color\(237,\s*228,\s*215,\s*255\)/);
});

void test("startup transition theme follows the app theme setting in every window", () => {
  const bootWindowTs = readBootWindowEntry();
  const settingsWindowRs = readFileSync(
    new URL("../src-tauri/src/settings_window.rs", import.meta.url),
    "utf8",
  );
  const readerWindowsRs = readFileSync(
    new URL("../src-tauri/src/reader_windows.rs", import.meta.url),
    "utf8",
  );

  assert.match(startupWindowRs, /get_reader_settings/);
  assert.match(startupWindowRs, /ThemeMode::Light\s*=>\s*Some\(Theme::Light\)/);
  assert.match(startupWindowRs, /ThemeMode::Dark\s*=>\s*Some\(Theme::Dark\)/);
  assert.match(startupWindowRs, /ThemeMode::System\s*=>\s*system_theme/);
  assert.match(startupWindowRs, /__ONLY_MD_READER_BOOT_THEME__/);
  assert.match(indexHtml, /:root\[data-boot-theme="light"\]/);
  assert.match(indexHtml, /:root\[data-boot-theme="dark"\]/);
  assert.match(bootWindowTs, /__ONLY_MD_READER_BOOT_THEME__/);
  assert.match(bootWindowTs, /dataset\.bootTheme\s*=\s*bootTheme/);
  assert.match(settingsWindowRs, /startup_background_color_for_app/);
  assert.match(settingsWindowRs, /startup_boot_theme_script/);
  assert.match(readerWindowsRs, /startup_background_color_for_app/);
  assert.match(readerWindowsRs, /startup_boot_theme_script/);
});

void test("desktop window remains hidden until React reveals the committed app frame", () => {
  const [mainWindow] = tauriConfig.app?.windows ?? [];
  const bootWindowTs = readBootWindowEntry();

  assert.equal(mainWindow?.visible, false);
  assert.equal(mainWindow?.backgroundColor, "#EDE4D7");
  assert.doesNotMatch(tauriLibRs, /on_page_load/);
  assert.doesNotMatch(tauriLibRs, /PageLoadEvent::Finished/);
  assert.doesNotMatch(tauriLibRs, /window\.show\(\)/);
  assert.match(
    indexHtml,
    /<div id="boot-screen"[\s\S]*?<\/div>\s*<script type="module" src="\/src\/boot-window\.ts"><\/script>\s*<div id="root"/,
  );
  assert.doesNotMatch(bootWindowTs, /getCurrentWindow/);
  assert.doesNotMatch(bootWindowTs, /\.show\(\)/);
  assert.match(mainTsx, /getCurrentWindow/);
  assert.match(mainTsx, /\.show\(\)/);
  assert.match(bootWindowTs, /__TAURI_INTERNALS__/);
  assert.ok(defaultCapability.permissions?.includes("core:window:allow-show"));
  assert.ok(defaultCapability.permissions?.includes("core:window:allow-maximize"));
});

void test("reader windows share the desktop capability boundary", () => {
  const capability = defaultCapability;

  assert.ok(capability.windows?.includes("main"));
  assert.ok(capability.windows?.includes("reader-*"));
  assert.ok(capability.permissions?.includes("core:default"));
  assert.ok(capability.permissions?.includes("core:window:allow-show"));
  assert.ok(capability.permissions?.includes("core:window:allow-maximize"));
});

void test("entry html renders a graphic-only boot screen before React loads", () => {
  assert.match(indexHtml, /id="boot-screen"/);
  assert.match(indexHtml, /class="boot-mark"/);
  assert.match(indexHtml, /aria-hidden="true"/);
  assert.match(indexHtml, /<svg[\s\S]*?viewBox=/);
  assert.match(indexHtml, /@keyframes\s+boot-breathe/);
  assert.match(indexHtml, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(indexHtml, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(indexHtml, /\.boot-mark\s*{[\s\S]*width:\s*68px;[\s\S]*height:\s*68px;/);
  assert.match(indexHtml, /viewBox="0 0 1024 1024"/);
  assert.match(indexHtml, /class="boot-mark__app-icon"/);
  assert.match(indexHtml, appIconOuterPathPattern);
  assert.match(indexHtml, appIconContentPathPattern);
  assert.match(indexHtml, /fill="currentColor"/);
  assert.doesNotMatch(indexHtml, /M36\.571429 0v1024h950\.857142V0H36\.571429z/);
  assert.doesNotMatch(indexHtml, /M25\.2 21\.4 19 27\.6/);
  assert.match(indexHtml, /--boot-bg:\s*#ede4d7;/i);
  assert.match(indexHtml, /--boot-bg:\s*#151210;/i);
  assert.match(indexHtml, /--boot-accent:\s*#8a5a3c;/i);
  assert.match(indexHtml, /--boot-accent:\s*#c28a63;/i);
  assert.match(
    indexHtml,
    /:root\[data-boot-theme="light"\][\s\S]*--boot-bg:\s*#ede4d7;/i,
  );
  assert.match(
    indexHtml,
    /:root\[data-boot-theme="dark"\][\s\S]*--boot-bg:\s*#151210;/i,
  );
});

void test("boot screen avoids text progress and font dependencies", () => {
  const bootScreenMatch = indexHtml.match(
    /<div id="boot-screen"[\s\S]*?<\/div>\s*<script type="module" src="\/src\/boot-window\.ts"><\/script>\s*<div id="root"/,
  );

  assert.ok(bootScreenMatch, "boot screen markup should appear before the React root");

  const bootScreenHtml = bootScreenMatch[0];
  assert.doesNotMatch(bootScreenHtml, />\s*[\p{L}\p{N}%][^<]*</u);
  assert.doesNotMatch(bootScreenHtml, /progress/i);
  assert.doesNotMatch(bootScreenHtml, /spinner/i);
  assert.doesNotMatch(bootScreenHtml, /loading/i);
  assert.doesNotMatch(bootScreenHtml, /Maple Mono NF CN/i);
  assert.doesNotMatch(bootScreenHtml, /<img\b/i);
});

void test("application icon source and boot transition use the same document glyph", () => {
  assert.equal(existsSync(appIconSvgUrl), true);
  assert.match(appIconSvg, /<svg[\s\S]*viewBox="0 0 1024 1024"/);
  assert.match(appIconSvg, appIconOuterPathPattern);
  assert.match(appIconSvg, appIconContentPathPattern);
  assert.match(appIconSvg, appIconLetterPathPattern);
  assert.match(indexHtml, appIconOuterPathPattern);
  assert.match(indexHtml, appIconContentPathPattern);
  assert.match(indexHtml, appIconLetterPathPattern);
});

void test("application icon source uses a black document glyph with a blue M", () => {
  assert.match(
    appIconSvg,
    new RegExp(`${appIconOuterPathPattern.source}[\\s\\S]*fill="#000000"`),
  );
  assert.match(
    appIconSvg,
    new RegExp(`${appIconContentPathPattern.source}[\\s\\S]*fill="#000000"`),
  );
  assert.match(
    appIconSvg,
    new RegExp(`${appIconLetterPathPattern.source}[\\s\\S]*fill="#2563EB"`),
  );
  assert.doesNotMatch(appIconSvg, /fill="#8A5A3C"/i);
  assert.doesNotMatch(appIconSvg, /fill="#C28A63"/i);
});

void test("native app icon changes invalidate the Windows executable resource build", () => {
  assert.match(tauriBuildRs, /cargo:rerun-if-changed=icons\/app-icon\.svg/);
  assert.match(tauriBuildRs, /cargo:rerun-if-changed=icons\/icon\.ico/);
  assert.match(tauriBuildRs, /cargo:rerun-if-changed=icons\/icon\.icns/);
  assert.match(tauriBuildRs, /cargo:rerun-if-changed=icons\/32x32\.png/);
  assert.match(tauriBuildRs, /cargo:rerun-if-changed=icons\/128x128\.png/);
  assert.match(tauriBuildRs, /cargo:rerun-if-changed=icons\/128x128@2x\.png/);
});

void test("React entry fades out the boot screen after the first committed frame", () => {
  assert.match(mainTsx, /hideBootScreen/);
  assert.match(mainTsx, /MIN_BOOT_SCREEN_MS\s*=\s*640/);
  assert.match(mainTsx, /BOOT_SCREEN_FADE_MS\s*=\s*220/);
  assert.match(mainTsx, /__ONLY_MD_READER_BOOTSTRAP__\?\.windowKind/);
  assert.match(mainTsx, /requestAnimationFrame/);
  assert.match(mainTsx, /READER_READY_TO_REVEAL_EVENT/);
  assert.match(mainTsx, /window\.addEventListener\(\s*READER_READY_TO_REVEAL_EVENT/);
  assert.match(mainTsx, /if\s*\(\s*windowKind\s*===\s*"reader"\s*\)/);
  assert.match(mainTsx, /return;\s*}\s*queueMicrotask\(\(\)\s*=>\s*hideBootScreen/);
  assert.match(mainTsx, /},\s*revealDelayMs\)/);
  assert.match(mainTsx, /currentWindow\.show\(\)/);
  assert.match(mainTsx, /windowKind\s*===\s*"reader"[\s\S]*?\.maximize\(\)/);
  assert.match(mainTsx, /boot-screen/);
  assert.match(mainTsx, /boot-screen--leaving/);
});

void test("reader windows reveal only after markdown render has committed", () => {
  assert.match(readerWindowTsx, /READER_READY_TO_REVEAL_EVENT/);
  assert.match(readerWindowTsx, /window\.dispatchEvent/);
  assert.match(readerWindowTsx, /new Event\(READER_READY_TO_REVEAL_EVENT\)/);
  assert.match(
    readerWindowTsx,
    /if\s*\(\s*isRendering\s*\)\s*{\s*return undefined;\s*}/,
  );
  assert.match(readerWindowTsx, /requestAnimationFrame/);
});

void test("entry html has critical paint fallbacks before React loads", () => {
  assert.match(
    indexHtml,
    /<link[\s\S]*?rel="preload"[\s\S]*?MapleMono-NF-CN-Regular\.ttf[\s\S]*?>/,
  );
  assert.match(
    indexHtml,
    /<link[\s\S]*?rel="preload"[\s\S]*?MapleMono-NF-CN-Bold\.ttf[\s\S]*?>/,
  );
  assert.match(indexHtml, /<style>[\s\S]*--boot-bg:\s*#ede4d7;[\s\S]*<\/style>/i);
  assert.match(
    indexHtml,
    /body,\s*#root\s*{[\s\S]*background:\s*var\(--boot-bg\);[\s\S]*}/i,
  );
});

void test("bundled app font avoids visible fallback swapping during startup", () => {
  assert.doesNotMatch(fontCss, /font-display:\s*swap;/);
  assert.match(fontCss, /font-display:\s*fallback;/);
});

void test("open file shell suppresses document scrollbars", () => {
  assert.match(
    appCss,
    /html,\s*body,\s*#root\s*{[^}]*\bwidth:\s*100%;[^}]*\bheight:\s*100%;[^}]*\boverflow:\s*hidden;/s,
  );
  assert.match(
    appCss,
    /\.app-shell\s*{[^}]*\bheight:\s*100vh;[^}]*\boverflow:\s*hidden;/s,
  );
});

void test("open file card uses the same inset on every window edge", () => {
  assert.match(appCss, /--window-card-inset:\s*18px;/);
  assert.match(appCss, /\.app-shell\s*{[^}]*\bpadding:\s*var\(--window-card-inset\);/s);
  assert.doesNotMatch(appCss, /\.app-shell\s*{[^}]*\bpadding:\s*\d+px\s+\d+px;/s);
});

void test("open file settings and reader cards use one shared window inset", () => {
  assert.match(appCss, /--window-card-inset:\s*18px;/);
  assert.match(appCss, /\.app-shell\s*{[^}]*\bpadding:\s*var\(--window-card-inset\);/s);
  assert.match(
    appCss,
    /\.settings-window-shell\s*{[^}]*\bpadding:\s*var\(--window-card-inset\);/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-layout\s*{[^}]*\bpadding:\s*var\(--window-card-inset\);/s,
  );
  assert.doesNotMatch(appCss, /\.settings-window-frame\s*{[^}]*calc\(100vw - 48px\)/s);
  assert.doesNotMatch(appCss, /\.reader-preview-layout\s*{[^}]*\bpadding:\s*34px;/s);
});

void test("open file shell and card use ui_colors background tokens", () => {
  assert.match(appCss, /\.app-shell\s*{[^}]*\bbackground:[^}]*var\(--app-bg\);/s);
  assert.match(
    appCss,
    /\.open-file-window\s*{[^}]*\bbackground:\s*var\(--surface-bg\);/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.open-file-window\s*{[^}]*\bbackground:\s*var\(--app-bg\);/s,
  );
});

void test("settings window frame uses the same surface background as reader cards", () => {
  assert.match(
    appCss,
    /\.settings-window-shell\s*{[^}]*\bbackground:[^}]*var\(--app-bg\);/s,
  );
  assert.match(
    appCss,
    /\.settings-window-frame\s*{[^}]*\bbackground:\s*var\(--surface-bg\);/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.settings-window-frame\s*{[^}]*\bbackground:[^}]*var\(--app-bg\);/s,
  );
});

void test("primary open button shadow can diffuse without being clipped by its group", () => {
  assert.match(appCss, /\.open-file-center\s*{[^}]*\boverflow:\s*visible;/s);
  assert.match(
    appCss,
    /\.primary-open-button\s*{[^}]*\bbox-shadow:[^}]*0\s+22px\s+56px[^}]*0\s+8px\s+20px/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.primary-open-button\s*{[^}]*\bbox-shadow:[^}]*0\s+18px\s+38px/s,
  );
});

void test("React entry selects reader windows from injected bootstrap data", () => {
  const appTsx = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  assert.match(appTsx, /__ONLY_MD_READER_BOOTSTRAP__/);
  assert.match(appTsx, /windowKind:\s*"reader"/);
  assert.match(appTsx, /<ReaderPreviewWindow[\s\S]*file=\{bootstrap\.file\}/);
  assert.match(appTsx, /initialWindowState=\{bootstrap\.windowState \?\? null\}/);
  assert.match(appTsx, /windowKind:\s*"settings"/);
  assert.match(appTsx, /<SettingsWindow\s*\/>/);
  assert.match(appTsx, /<OpenFileWindow api=\{openFileApi\}/);
});

void test("desktop backend registers the single file reader window command", () => {
  const readerWindowsRs = readFileSync(
    new URL("../src-tauri/src/reader_windows.rs", import.meta.url),
    "utf8",
  );
  const startupArgIndex = tauriLibRs.indexOf(
    "open_startup_markdown_arg(app.handle())?",
  );
  const createMainIndex = tauriLibRs.indexOf("create_main_window(app)?");

  assert.match(tauriLibRs, /ReaderWindowRegistry::default\(\)/);
  assert.match(tauriLibRs, /reader_windows::open_reader_window/);
  assert.match(tauriLibRs, /reader_windows::handle_window_event/);
  assert.match(tauriLibRs, /reader_windows::open_startup_markdown_arg/);
  assert.match(tauriLibRs, /font_families::list_available_font_families/);
  assert.match(tauriLibRs, /open_startup_markdown_arg\(app\.handle\(\)\)\?/);
  assert.match(tauriLibRs, /if !opened_startup_markdown/);
  assert.match(tauriLibRs, /create_main_window\(app\)\?/);
  assert.notEqual(startupArgIndex, -1);
  assert.notEqual(createMainIndex, -1);
  assert.ok(
    startupArgIndex < createMainIndex,
    "startup markdown args must be handled before creating the open-file window",
  );
  assert.match(readerWindowsRs, /pub async fn open_reader_window/);
  assert.match(readerWindowsRs, /source_window_label:\s*Option<String>/);
  assert.match(readerWindowsRs, /close_source_window_after_open/);
  assert.match(readerWindowsRs, /file_path_to_window_label/);
  assert.match(readerWindowsRs, /get_webview_window/);
  assert.match(readerWindowsRs, /set_focus\(\)/);
  assert.match(readerWindowsRs, /WebviewWindowBuilder::new/);
  assert.doesNotMatch(readerWindowsRs, /run_on_main_thread/);
  assert.doesNotMatch(readerWindowsRs, /mpsc::channel/);
});

void test("open file window passes its source label and supports markdown drag drop", () => {
  const successfulOpenBlock = openFileWindowTsx.match(
    /const file = await api\.openMarkdownFile\(path\);[\s\S]*?handleFileOpened\?\.\(file\);/,
  )?.[0];

  assert.match(openFileApiTs, /getCurrentWindow/);
  assert.match(openFileApiTs, /sourceWindowLabel:\s*getCurrentWindow\(\)\.label/);
  assert.match(openFileWindowTsx, /onDragDropEvent/);
  assert.match(openFileWindowTsx, /event\.payload\.type !== "drop"/);
  assert.match(openFileWindowTsx, /getFirstMarkdownDropPath\(event\.payload\.paths\)/);
  assert.match(openFileWindowTsx, /请拖入 \.md 或 \.markdown 文件。/);
  assert.match(openFileWindowTsx, /await api\.openMarkdownFile\(path\)/);
  assert.match(
    openFileWindowTsx,
    /openPath\(item\.id,\s*\{\s*showLoading:\s*false\s*\}\)/,
  );
  assert.match(
    openFileWindowTsx,
    /if \(options\.showLoading\) \{\s*setLoadState\(\{ status: "loading" \}\);/s,
  );
  assert.ok(successfulOpenBlock);
  assert.doesNotMatch(
    successfulOpenBlock,
    /setRecentFiles\(await api\.listRecentFiles\(\)\)/,
  );
});

void test("desktop bundle declares markdown file associations for default app opening", () => {
  const markdownAssociation = tauriConfig.bundle?.fileAssociations?.find(
    (association) => association.ext?.includes("md"),
  );

  assert.deepEqual(markdownAssociation?.ext, ["md", "markdown"]);
  assert.equal(markdownAssociation?.mimeType, "text/markdown");
  assert.deepEqual(tauriConfig.bundle?.targets, ["msi"]);
  assert.equal(tauriConfig.bundle?.windows?.wix?.language, "zh-CN");
  assert.equal(markdownAssociation?.name, "MD极简阅读 Markdown 文档");
});

void test("Windows MSI exposes Markdown default-app registration and system settings opt-in", () => {
  const wixConfig = tauriConfig.bundle?.windows?.wix;

  assert.equal(wixConfig?.template, "wix/main.wxs");
  assert.deepEqual(wixConfig?.fragmentPaths, ["wix/markdown-default-app.wxs"]);
  assert.ok(wixConfig?.componentRefs?.includes("MarkdownDefaultAppRegistration"));

  assert.match(
    wixTemplate,
    /WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT"\s+Value="安装完成后打开 Windows 默认应用设置，设置 MD 极简阅读为 Markdown 默认打开程序"/,
  );
  assert.match(wixTemplate, /LaunchDefaultAppsSettings/);
  assert.match(wixTemplate, /LaunchDefaultAppsSettings"[^>]+Directory="TARGETDIR"/);
  assert.doesNotMatch(wixTemplate, /Directory="WindowsFolder"/);
  assert.match(
    wixTemplate,
    /ms-settings:defaultapps\?registeredAppMachine=MD%20%E6%9E%81%E7%AE%80%E9%98%85%E8%AF%BB/,
  );
  assert.doesNotMatch(wixTemplate, /Value="!\(loc\.LaunchApp\)"/);
  assert.doesNotMatch(wixTemplate, /UserChoice/);

  assert.match(wixMarkdownDefaultApp, /RegisteredApplications/);
  assert.match(wixMarkdownDefaultApp, /<\?define Win64 = "yes" \?>/);
  assert.match(wixMarkdownDefaultApp, /MD极简阅读\\Capabilities/);
  assert.match(wixMarkdownDefaultApp, /Key="FileAssociations"/);
  assert.match(wixMarkdownDefaultApp, /Applications\\only-md-reader\.exe/);
  assert.match(wixMarkdownDefaultApp, /SupportedTypes/);
  assert.match(wixMarkdownDefaultApp, /Software\\Classes\\OnlyMdReader\.Markdown/);
  assert.match(wixMarkdownDefaultApp, /shell\\open\\command/);
  assert.match(wixMarkdownDefaultApp, /&quot;\[!Path\]&quot;\s+&quot;%1&quot;/);
  assert.match(wixMarkdownDefaultApp, /\.md/);
  assert.match(wixMarkdownDefaultApp, /\.markdown/);
  assert.match(wixMarkdownDefaultApp, /text\/markdown/);
  assert.doesNotMatch(wixMarkdownDefaultApp, /UserChoice/);
});

void test("reader command hides the source open-file window before the slow open path and restores it on failure", () => {
  const readerWindowsRs = readFileSync(
    new URL("../src-tauri/src/reader_windows.rs", import.meta.url),
    "utf8",
  );
  const hideSourceIndex = readerWindowsRs.indexOf("hide_source_window_before_open");
  const openReaderIndex = readerWindowsRs.indexOf(
    "open_reader_window_for_path(&app, path)",
  );

  assert.notEqual(hideSourceIndex, -1);
  assert.notEqual(openReaderIndex, -1);
  assert.ok(
    hideSourceIndex < openReaderIndex,
    "source window must hide before reader creation/focus can repaint the open-file UI",
  );
  assert.match(readerWindowsRs, /show_source_window_after_open_failure/);
  assert.match(readerWindowsRs, /\.hide\(\)/);
  assert.match(readerWindowsRs, /\.show\(\)/);
});

void test("reader windows stay hidden until reveal, then open maximized and preserve the two-column minimum", () => {
  const readerWindowsRs = readFileSync(
    new URL("../src-tauri/src/reader_windows.rs", import.meta.url),
    "utf8",
  );
  const readerMinWidth = Number(
    readerWindowsRs.match(/const READER_WINDOW_MIN_WIDTH:\s*f64\s*=\s*(\d+)\.0/)?.[1],
  );
  const readerResponsiveBreakpoint = Number(
    appCss.match(
      /@media \(max-width:\s*(\d+)px\)\s*{\s*\.reader-preview-layout\s*{\s*grid-template-columns:\s*1fr;/,
    )?.[1],
  );

  assert.match(
    readerWindowsRs,
    /const READER_WINDOW_RESTORED_WIDTH:\s*f64\s*=\s*1320\.0/,
  );
  assert.match(
    readerWindowsRs,
    /const READER_WINDOW_RESTORED_HEIGHT:\s*f64\s*=\s*560\.0/,
  );
  assert.match(readerWindowsRs, /const READER_WINDOW_MIN_WIDTH:\s*f64\s*=\s*1320\.0/);
  assert.match(readerWindowsRs, /const READER_WINDOW_MIN_HEIGHT:\s*f64\s*=\s*560\.0/);
  assert.ok(
    readerMinWidth >= 1320 && readerMinWidth > readerResponsiveBreakpoint,
    "reader native minimum width must preserve the approved reader.html two-column window width",
  );
  assert.match(
    readerWindowsRs,
    /\.inner_size\(READER_WINDOW_RESTORED_WIDTH,\s*READER_WINDOW_RESTORED_HEIGHT\)/,
  );
  assert.match(
    readerWindowsRs,
    /\.min_inner_size\(READER_WINDOW_MIN_WIDTH,\s*READER_WINDOW_MIN_HEIGHT\)/,
  );
  assert.match(readerWindowsRs, /\.resizable\(true\)/);
  assert.match(readerWindowsRs, /\.maximizable\(true\)/);
  assert.match(readerWindowsRs, /\.visible\(false\)/);
  assert.doesNotMatch(
    readerWindowsRs,
    /\.maximized\(true\)/,
    "reader windows must not maximize during native construction because WebView2 can expose a blank loading surface before React is ready",
  );
  assert.match(mainTsx, /windowKind\s*===\s*"reader"[\s\S]*?\.maximize\(\)/);
  assert.ok(defaultCapability.permissions?.includes("core:window:allow-maximize"));
  assert.doesNotMatch(readerWindowsRs, /\.resizable\(false\)/);
  assert.doesNotMatch(readerWindowsRs, /\.max_inner_size\(/);
  assert.doesNotMatch(readerWindowsRs, /\.maximizable\(false\)/);
  assert.doesNotMatch(
    readerWindowsRs,
    /builder\s*=\s*builder\.inner_size\(\s*state\.width\.max/s,
  );
  assert.doesNotMatch(readerWindowsRs, /\.position\(x,\s*y\)/);
});

void test("reader window uses floating outline and reading cards without hard dividers", () => {
  assert.match(readerWindowTsx, /reader-preview-shell/);
  assert.doesNotMatch(readerWindowTsx, /reader-preview-window-title/);
  assert.doesNotMatch(appCss, /\.reader-preview-window-title/);
  assert.match(readerWindowTsx, /reader-preview-outline-card/);
  assert.match(readerWindowTsx, /reader-preview-reading-card/);
  assert.match(readerWindowTsx, /reader-preview-settings-button/);
  assert.doesNotMatch(readerWindowTsx, /from "\.\.\/settings\/SettingsWindow\.tsx"/);
  assert.doesNotMatch(readerWindowTsx, /<SettingsWindow/);
  assert.doesNotMatch(readerWindowTsx, /presentation="modal"/);
  assert.match(readerWindowTsx, /openSettingsWindow/);

  assert.match(
    appCss,
    /\.reader-preview-shell\s*{[^}]*\bheight:\s*100vh;[^}]*\bbackground:\s*var\(--app-bg\);/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-shell\s*{[^}]*--reader-outline-inline-padding:\s*17px;[^}]*--reader-outline-width:\s*336px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-layout\s*{[^}]*--reader-card-gap:\s*30px;[^}]*\bgrid-template-columns:\s*minmax\(300px,\s*var\(--reader-outline-width\)\)\s+minmax\(0,\s*1fr\);[^}]*\bgap:\s*var\(--reader-card-gap\);/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-card,\s*\.reader-preview-reading-card\s*{[^}]*\bbox-shadow:\s*var\(--reader-card-shadow\);/s,
  );
  assert.doesNotMatch(appCss, /--reader-outline-card-shadow:/);
  assert.doesNotMatch(appCss, /\.reader-preview-outline[^{]*{[^}]*border-right:/s);
});

void test("reader raw document is centered and leaves room for the settings gear", () => {
  assert.match(
    appCss,
    /\.reader-preview-document\s*{[^}]*\bmax-width:\s*min\(100%,\s*var\(--reader-content-max-width,\s*(8[4-9]\d|9\d\d|1\d{3})px\)\);[^}]*\bmargin:\s*0\s+auto;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-scroll\s*{[^}]*\bpadding:[^;}]*96px[^;}]*112px;/s,
  );
  assert.match(
    appCss,
    /@media\s*\(max-width:\s*980px\)\s*{[\s\S]*?\.reader-preview-scroll\s*{[^}]*\bpadding:\s*34px\s+82px\s+90px\s+18px;/,
  );
  assert.match(
    appCss,
    /\.reader-preview-settings-button\s*{[^}]*\bposition:\s*absolute;[^}]*\bright:\s*6px;[^}]*\bbottom:\s*6px;[^}]*\bwidth:\s*32px;[^}]*\bheight:\s*32px;/s,
  );
});

void test("reader scroll viewport includes its padding inside the card height", () => {
  assert.match(
    appCss,
    /\.reader-preview-scroll\s*{[^}]*\bheight:\s*100%;[^}]*\bbox-sizing:\s*border-box;[^}]*\boverflow:\s*auto;[^}]*\bpadding:\s*56px\s+96px\s+112px;/s,
  );
});

void test("reader window renders markdown without redundant document chrome", () => {
  assert.doesNotMatch(readerWindowTsx, /reader-preview-document-kicker/);
  assert.doesNotMatch(readerWindowTsx, /reader-preview-document-meta/);
  assert.doesNotMatch(readerWindowTsx, /reader-preview-document-title/);
  assert.doesNotMatch(readerWindowTsx, /documentTitle/);
  assert.doesNotMatch(readerWindowTsx, /Pure Reader/);
  assert.doesNotMatch(readerWindowTsx, /openedAtLabel/);
  assert.match(readerWindowTsx, /reader-preview-file-path/);
  assert.match(readerWindowTsx, /\{preview\.pathLine\}/);
  assert.match(readerWindowTsx, /reader-preview-source-section/);
  assert.match(readerWindowTsx, /markdown-rendered-document/);
  assert.match(readerWindowTsx, /dangerouslySetInnerHTML/);
  assert.match(readerWindowTsx, /renderMarkdownDocument/);
  assert.doesNotMatch(readerWindowTsx, /reader-preview-header/);
  assert.doesNotMatch(appCss, /\.reader-preview-document-kicker/);
  assert.doesNotMatch(appCss, /\.reader-preview-document-meta/);
  assert.doesNotMatch(appCss, /\.reader-preview-document-title/);
  assert.match(
    appCss,
    /\.reader-preview-file-path\s*{[^}]*\bcolor:\s*var\(--text-secondary\);[^}]*\bfont-size:\s*13px;[^}]*\bfont-weight:\s*520;[^}]*\bletter-spacing:\s*0;/s,
  );
  assert.match(appCss, /\.markdown-rendered-document h1\s*{/);
  assert.match(appCss, /\.markdown-code-scroller,/);
  assert.match(appCss, /\.markdown-table-wrapper,/);
});

void test("markdown syntax colors are sourced from ui_colors css variables", () => {
  assert.match(
    appCss,
    /\.markdown-rendered-document\s*{[^}]*\bcolor:\s*var\(--text-primary\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document h1\s*{[^}]*\bcolor:\s*var\(--heading1\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document h1,\s*\.markdown-rendered-document h2,\s*\.markdown-rendered-document h3,[\s\S]*?{[^}]*\bcolor:\s*var\(--heading2\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document a\s*{[^}]*\bcolor:\s*var\(--link\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document blockquote\s*{[^}]*\bborder-left:\s*4px\s+solid\s+var\(--blockquote-border\);[^}]*\bbackground:\s*var\(--blockquote-bg\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document mark\s*{[^}]*\bbackground:\s*var\(--mark-bg\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document code:not\(pre code\)\s*{[^}]*\bbackground:\s*var\(--code-bg\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-code-scroller\s*{[^}]*\bbackground:\s*var\(--code-bg\);/s,
  );
  assert.match(appCss, /\.markdown-code-block\s*{[^}]*\bbackground:\s*transparent;/s);
  assert.match(
    appCss,
    /\.markdown-rendered-document th,\s*\.markdown-rendered-document td\s*{[^}]*\bborder:\s*1px\s+solid\s+var\(--table-border\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document th\s*{[^}]*\bbackground:\s*var\(--table-header-bg\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document table\s*{[^}]*\bwidth:\s*100%;[^}]*\bmin-width:\s*0;[^}]*\btable-layout:\s*fixed;/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document th,\s*\.markdown-rendered-document td\s*{[^}]*\bwhite-space:\s*normal;[^}]*\boverflow-wrap:\s*anywhere;[^}]*\bword-break:\s*break-word;/s,
  );
  assert.doesNotMatch(appCss, /\.markdown-[^{]*{[^}]*#[0-9a-fA-F]{3,8}/s);
});

void test("reader markdown text and code use the bundled Maple font stack", () => {
  assert.match(
    appCss,
    /\.markdown-rendered-document\s*{[^}]*font-family:\s*var\([^}]*--reader-body-font-family,[^}]*"Maple Mono NF CN"/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-card\s*{[^}]*font-family:\s*var\([^}]*--reader-body-font-family,[^}]*"Maple Mono NF CN"/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document code:not\(pre code\)\s*{[^}]*font-family:\s*var\([^}]*--reader-code-font-family,[^}]*"Maple Mono NF CN"/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document code:not\(pre code\)\s*{[^}]*font-size:\s*1em;/s,
  );
  assert.match(
    appCss,
    /\.markdown-code-block\s*{[^}]*font-family:\s*var\([^}]*--reader-code-font-family,[^}]*"Maple Mono NF CN"/s,
  );
  assert.match(
    appCss,
    /\.markdown-code-block\s*{[^}]*\bcolor:\s*var\(--text-primary\);[^}]*\bfont-size:\s*var\(--reader-code-font-size,\s*16px\);[^}]*\bline-height:\s*var\(--reader-line-height,\s*1\.86\);/s,
  );
  assert.match(appCss, /\.markdown-code-block code\s*{[^}]*font-family:\s*inherit;/s);
});

void test("all app text disables font ligatures globally", () => {
  assert.match(mainTsx, /import "\.\/shared\/theme\/theme\.css"/);
  assert.match(
    themeCss,
    /:root,\s*:root \*,\s*:root \*::before,\s*:root \*::after\s*{[^}]*font-variant-ligatures:\s*none;/s,
  );
});

void test("local KaTeX and Eva theme resources are bundled through the app entry", () => {
  const markdownRendererTs = readFileSync(
    new URL("./features/markdown/markdown-renderer.ts", import.meta.url),
    "utf8",
  );

  assert.match(mainTsx, /import "katex\/dist\/katex\.css"/);
  assert.match(readerWindowTsx, /convertFileSrc/);
  assert.match(readerWindowTsx, /isTauri/);
  assert.match(readerWindowTsx, /codeThemeName=\{rendered\.codeThemeName\}/);
  assert.match(readerWindowTsx, /data-code-theme=\{codeThemeName\}/);
  assert.match(readerWindowTsx, /MutationObserver/);
  assert.match(readerWindowTsx, /data-theme-effective-mode/);
  assert.match(markdownRendererTs, /eva-dark-bold\.json[\s\S]*eva-light-bold\.json/);
});

void test("markdown renderer loads the Shiki runtime on demand instead of the app shell", () => {
  const markdownRendererTs = readFileSync(
    new URL("./features/markdown/markdown-renderer.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    markdownRendererTs,
    /import\s+\{\s*codeToHtml\s*\}\s+from\s+"shiki"/,
  );
  assert.match(markdownRendererTs, /await import\("shiki"\)/);
});

void test("desktop app enables the asset protocol for markdown image sources", () => {
  const security = tauriConfig.app?.security;

  assert.equal(security?.assetProtocol?.enable, true);
  assert.ok(security?.assetProtocol?.scope?.includes("$HOME/**"));
  assert.ok(security?.assetProtocol?.scope?.includes("$TEMP/**"));
  assert.match(
    tauriCargoToml,
    /tauri\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"protocol-asset"/s,
  );
});

void test("reader windows allow the opened markdown directory for asset image loading", () => {
  const readerWindowsRs = readFileSync(
    new URL("../src-tauri/src/reader_windows.rs", import.meta.url),
    "utf8",
  );

  assert.match(readerWindowsRs, /allow_markdown_asset_directory/);
  assert.match(readerWindowsRs, /asset_protocol_scope\(\)/);
  assert.match(readerWindowsRs, /\.allow_directory\([^,]+,\s*true\)/s);
});

void test("reader window implements formal scroll chrome and uniform card shadows", () => {
  assert.match(readerWindowTsx, /reader-preview-scrollbar-hotzone/);
  assert.match(readerWindowTsx, /reader-preview-scrollbar-thumb/);
  assert.match(readerWindowTsx, /reader-preview-outline-item/);
  assert.match(readerWindowTsx, /ScrollablePanel/);
  assert.match(readerWindowTsx, /calculateScrollChromeMetrics/);
  assert.match(readerWindowTsx, /onPointerDown/);
  assert.match(readerWindowTsx, /setPointerCapture/);
  assert.match(readerWindowTsx, /onClick/);

  assert.match(
    appCss,
    /\.reader-preview-shell\s*{[^}]*--reader-card-shadow:\s*0 0 24px -8px[^;]*,\s*0 0 8px -2px[^;]*;/s,
  );
  assert.doesNotMatch(appCss, /--reader-outline-card-shadow:/);
  assert.match(
    appCss,
    /\.reader-preview-outline-card,\s*\.reader-preview-reading-card\s*{[^}]*\bbox-shadow:\s*var\(--reader-card-shadow\);/s,
  );
  assert.match(appCss, /\.reader-preview-outline-card::before/);
  assert.match(appCss, /\.reader-preview-reading-card::before/);
  assert.match(appCss, /\.reader-preview-outline-card::after/);
  assert.match(appCss, /\.reader-preview-reading-card::after/);
  assert.match(
    appCss,
    /\.reader-preview-outline-list,\s*\.reader-preview-scroll\s*{[^}]*\bscrollbar-width:\s*none;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-scrollbar-thumb\s*{[^}]*\bheight:\s*var\(--scroll-thumb-height\);[^}]*\btransform:\s*translateY\(var\(--scroll-thumb-top\)\);/s,
  );
  assert.match(appCss, /\.reader-preview-scrollbar-hotzone:hover\s*{/);
  assert.match(
    appCss,
    /\.reader-preview-reading-card\[data-can-scroll="false"\]\s+\.reader-preview-scrollbar-hotzone/,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-card\[data-can-scroll="false"\]\s+\.reader-preview-scrollbar-hotzone/,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-card\[data-scrolled-from-top="true"\]::before/,
  );
  assert.match(
    appCss,
    /\.reader-preview-reading-card\[data-scrolled-from-top="true"\]::before/,
  );
  assert.match(
    readerWindowTsx,
    /data-has-scroll-below=\{chromeState\.hasScrollBelow\}/,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-card\[data-has-scroll-below="true"\]::after/,
  );
  assert.match(
    appCss,
    /\.reader-preview-reading-card\[data-has-scroll-below="true"\]::after/,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-card::before,\s*\.reader-preview-reading-card::before,\s*\.reader-preview-outline-card::after,\s*\.reader-preview-reading-card::after\s*{[^}]*\bopacity:\s*0;/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.reader-preview-scrollbar-thumb\s*{[^}]*\bheight:\s*42px;/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.reader-preview-reading-card:hover\s+\.reader-preview-scrollbar-hotzone/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.reader-preview-outline-card:hover\s+\.reader-preview-scrollbar-hotzone/s,
  );
  assert.match(
    pdfExportCss,
    /\.reader-preview-reading-card::before,\s*\.reader-preview-reading-card::after\s*{[^}]*\bdisplay:\s*none\s*!important;/s,
  );
});

void test("reader outline follows reader html density without top fade covering the first item", () => {
  assert.match(
    appCss,
    /\.reader-preview-outline-card\s*{[^}]*\bpadding:\s*24px\s+var\(--reader-outline-inline-padding\)\s+20px;/s,
  );
  assert.doesNotMatch(appCss, /\.reader-preview-outline-card\s*{[^}]*\bgap:\s*14px;/s);
  assert.match(
    appCss,
    /\.reader-preview-outline-list\s*{[^}]*\bbox-sizing:\s*border-box;[^}]*\bpadding:\s*0\s+22px\s+8px\s+2px;/s,
  );
  assert.match(appCss, /\.reader-preview-outline-tree\s*{[^}]*\bgap:\s*2px;/s);
  assert.doesNotMatch(
    appCss,
    /\.reader-preview-outline-tree\s*{[^}]*\bmin-height:\s*100%;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-row\s*{[^}]*\bbox-sizing:\s*border-box;[^}]*\bmax-width:\s*100%;[^}]*\bmin-height:\s*26px;[^}]*\bmargin-right:\s*4px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-item\s*{[^}]*\bmin-height:\s*26px;[^}]*\bdisplay:\s*flex;[^}]*\balign-items:\s*center;[^}]*\bborder-radius:\s*8px;[^}]*\bpadding:\s*3px\s+10px\s+1px;[^}]*\bline-height:\s*1\.28;[^}]*\buser-select:\s*none;/s,
  );
  assert.doesNotMatch(appCss, /translateY\(\d+px\)/);
  assert.doesNotMatch(
    appCss,
    /\.reader-preview-outline-item\s*{[^}]*\bdisplay:\s*block;/s,
  );
});

void test("reader outline keeps long headings inside a wider fixed visual lane", () => {
  assert.match(readerWindowTsx, /title=\{item\.label\}/);
  assert.match(readerWindowTsx, /className="reader-preview-outline-item-text"/);
  assert.match(
    appCss,
    /\.reader-preview-shell\s*{[^}]*--reader-outline-inline-padding:\s*17px;[^}]*--reader-outline-width:\s*336px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-layout\s*{[^}]*\bgrid-template-columns:\s*minmax\(300px,\s*var\(--reader-outline-width\)\)\s+minmax\(0,\s*1fr\);/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-list\s*{[^}]*\boverflow-x:\s*hidden;[^}]*\bpadding:\s*0\s+22px\s+8px\s+2px;/s,
  );
  assert.match(appCss, /\.reader-preview-outline-row\s*{[^}]*\bmax-width:\s*100%;/s);
  assert.match(
    appCss,
    /\.reader-preview-outline-item-text\s*{[^}]*\bmin-width:\s*0;[^}]*\boverflow:\s*hidden;[^}]*\btext-overflow:\s*ellipsis;[^}]*\bwhite-space:\s*nowrap;/s,
  );
});

void test("reader outline preserves visual depth for h1 through h6", () => {
  assert.doesNotMatch(readerWindowTsx, /Math\.min\(item\.level,\s*3\)/);
  assert.match(readerWindowTsx, /data-depth=\{clampOutlineDepth\(item\.level\)\}/);
  assert.match(
    appCss,
    /\.reader-preview-outline-row\[data-depth="6"\]\s*{[^}]*\bmargin-left:\s*50px;/s,
  );
});

void test("reader outline uses a near-top reading anchor for active heading sync", () => {
  assert.match(readerWindowTsx, /const OUTLINE_VIEWPORT_OFFSET = 56;/);
});

void test("reader outline scrolls the active item into the outline card viewport", () => {
  assert.match(readerWindowTsx, /outlineScrollerRef/);
  assert.match(readerWindowTsx, /scrollActiveOutlineItemIntoView/);
  assert.match(
    readerWindowTsx,
    /data-outline-item-id="\$\{CSS\.escape\(activeOutlineId\)\}"/,
  );
  assert.match(readerWindowTsx, /querySelector<HTMLElement>/);
  assert.match(readerWindowTsx, /outlineScroller\.scrollTop/);
  assert.match(readerWindowTsx, /data-outline-item-id=\{item\.id\}/);
});

void test("reader supports immersive outline toggling and copy affordances", () => {
  assert.match(readerWindowTsx, /isOutlineHidden/);
  assert.match(readerWindowTsx, /reader-preview-outline-rail-button/);
  assert.match(readerWindowTsx, /document\.addEventListener\("keydown"/);
  assert.match(readerWindowTsx, /event\.key\s*!==\s*"F11"/);
  assert.match(readerWindowTsx, /reader-preview-selection-copy-button/);
  assert.match(readerWindowTsx, /handleSelectionChange/);
  assert.match(readerWindowTsx, /openUrl\(/);
  assert.match(readerWindowTsx, /@tauri-apps\/plugin-opener/);
  assert.match(readerWindowTsx, /openExternalLink/);
  assert.match(readerWindowTsx, /\.markdown-rendered-document a\[href\]/);
  assert.match(readerWindowTsx, /onMouseDown=\{handleShellMouseDown\}/);
  assert.match(readerWindowTsx, /onMouseUp=\{handleShellMouseUp\}/);
  assert.match(readerWindowTsx, /document\.addEventListener\("selectionchange"/);
  assert.match(readerWindowTsx, /document\.addEventListener\("copy"/);
  assert.match(readerWindowTsx, /getSelectionTextInsideShell/);
  assert.match(readerWindowTsx, /requestAnimationFrame\(restoreSelection\)/);
  assert.match(readerWindowTsx, /TEXT_SELECTION_DRAG_THRESHOLD_PX/);
  assert.match(readerWindowTsx, /const COPY_BUBBLE_BLOCK_OFFSET_PX = 8;/);
  assert.match(readerWindowTsx, /getSelectionAnchorPoint/);
  assert.match(readerWindowTsx, /hasMeaningfulPointerDrag/);
  assert.match(readerWindowTsx, /markdown-code-copy-button/);
  assert.match(readerWindowTsx, /navigator\.clipboard\.writeText/);
  assert.match(readerWindowTsx, /role="button"/);
  assert.doesNotMatch(
    readerWindowTsx,
    /<button\s+className="reader-preview-outline-item"/,
  );
  assert.doesNotMatch(
    readerWindowTsx,
    /target\.closest\("\.reader-preview-outline-item"\)[\s\S]*return "outline";/,
  );
  assert.match(readerWindowTsx, /function isRangeInsideMarkdownDocument/);
  assert.match(readerWindowTsx, /isRangeInsideMarkdownDocument\(range\)/);

  assert.match(
    appCss,
    /\.reader-preview-layout\s*{[^}]*\btransition:\s*grid-template-columns\s+0\.16s\s+ease,\s*gap\s+0\.16s\s+ease;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-layout\[data-outline-hidden="true"\]\s*{[^}]*grid-template-columns:\s*0\s+minmax\(0,\s*1fr\);/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-rail-button\s*{[^}]*\bwidth:\s*16px;[^}]*\bheight:\s*16px;[^}]*\bbackground:\s*transparent;[^}]*\bbox-shadow:\s*none;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-outline-rail-button svg\s*{[^}]*\bfilter:\s*drop-shadow/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-selection-copy-button\s*{[^}]*\bwidth:\s*32px;[^}]*\bheight:\s*32px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-selection-copy-button\s*{[^}]*\bbox-shadow:[^}]*0\s+18px\s+44px/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-selection-copy-button svg\s*{[^}]*\bwidth:\s*18px;[^}]*\bheight:\s*18px;/s,
  );
  assert.match(
    appCss,
    /\.markdown-code-copy-button\s*{[^}]*\bwidth:\s*24px;[^}]*\bheight:\s*24px;[^}]*\bbackground:\s*transparent;/s,
  );
  assert.match(
    appCss,
    /\.markdown-code-copy-icon,\s*\.markdown-code-copy-button::before\s*{[^}]*\bwidth:\s*18px;[^}]*\bheight:\s*18px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-scrollbar-hotzone\s*{[^}]*\bpointer-events:\s*none;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-scrollbar-hotzone:is\(:hover,\s*:focus-within\),\s*\.reader-preview-outline-card\[data-scrollbar-visible="true"\]\s+\.reader-preview-scrollbar-hotzone,\s*\.reader-preview-reading-card\[data-scrollbar-visible="true"\]\s+\.reader-preview-scrollbar-hotzone,\s*\.reader-preview-outline-card\[data-dragging-scrollbar="true"\]\s+\.reader-preview-scrollbar-hotzone,\s*\.reader-preview-reading-card\[data-dragging-scrollbar="true"\]\s+\.reader-preview-scrollbar-hotzone\s*{[^}]*\bpointer-events:\s*auto;/s,
  );
});

void test("reader file path keeps a dedicated copy button ahead of truncated text", () => {
  assert.match(readerWindowTsx, /reader-preview-file-path-row/);
  assert.match(readerWindowTsx, /reader-preview-file-path-copy-button/);
  assert.match(readerWindowTsx, /aria-label="复制完整文件路径"/);
  assert.match(readerWindowTsx, /title="复制完整文件路径"/);
  assert.match(readerWindowTsx, /void copyText\(preview\.pathLine\)/);
  assert.match(
    readerWindowTsx,
    /reader-preview-file-path-copy-button[\s\S]*<\/button>\s*<p[\s\S]*className="reader-preview-file-path"/,
  );
  assert.match(readerWindowTsx, /title=\{preview\.pathLine\}/);

  assert.match(
    appCss,
    /\.reader-preview-file-path-row\s*{[^}]*\bdisplay:\s*flex;[^}]*\balign-items:\s*center;[^}]*\bgap:\s*10px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-file-path-copy-button\s*{[^}]*\bwidth:\s*24px;[^}]*\bheight:\s*24px;[^}]*\bbackground:\s*transparent;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-file-path-copy-button svg\s*{[^}]*\bwidth:\s*16px;[^}]*\bheight:\s*16px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-file-path\s*{[^}]*\boverflow:\s*hidden;[^}]*\btext-overflow:\s*ellipsis;[^}]*\bwhite-space:\s*nowrap;/s,
  );
});

void test("desktop backend registers settings, settings-window, and window-state commands", () => {
  const settingsWindowRs = readFileSync(
    new URL("../src-tauri/src/settings_window.rs", import.meta.url),
    "utf8",
  );

  assert.match(tauriLibRs, /mod settings;/);
  assert.match(tauriLibRs, /mod settings_window;/);
  assert.match(tauriLibRs, /mod window_state;/);
  assert.doesNotMatch(tauriLibRs, /install_app_menu/);
  assert.match(tauriLibRs, /settings::get_reader_settings/);
  assert.match(tauriLibRs, /settings::update_reader_settings/);
  assert.match(tauriLibRs, /settings::reset_reader_settings/);
  assert.match(tauriLibRs, /settings_window::open_settings_window/);
  assert.match(tauriLibRs, /window_state::get_window_state/);
  assert.match(tauriLibRs, /window_state::save_window_state/);
  assert.ok(defaultCapability.windows?.includes("settings"));

  assert.match(settingsRs, /struct ReaderSettings/);
  assert.match(settingsRs, /serde\(rename_all = "camelCase"\)/);
  assert.match(settingsRs, /settings\.json/);
  assert.match(settingsRs, /settings\.corrupt\.json/);
  assert.match(settingsRs, /with_extension\("json\.tmp"\)/);
  assert.match(settingsRs, /READER_SETTINGS_CHANGED_EVENT/);
  assert.doesNotMatch(settingsRs, /MenuItemBuilder::with_id/);
  assert.doesNotMatch(settingsRs, /SubmenuBuilder/);
  assert.doesNotMatch(settingsRs, /CmdOrCtrl\+,/);

  assert.match(settingsWindowRs, /SETTINGS_WINDOW_LABEL:\s*&str\s*=\s*"settings"/);
  assert.match(settingsWindowRs, /pub async fn open_settings_window/);
  assert.match(settingsWindowRs, /get_webview_window\(SETTINGS_WINDOW_LABEL\)/);
  assert.match(settingsWindowRs, /focus_existing_settings_window/);
  assert.match(settingsWindowRs, /unminimize\(\)/);
  assert.match(settingsWindowRs, /show\(\)/);
  assert.match(settingsWindowRs, /set_focus\(\)/);
  assert.match(settingsWindowRs, /WebviewWindowBuilder::new/);
  assert.match(settingsWindowRs, /SETTINGS_WINDOW_WIDTH:\s*f64\s*=\s*900\.0/);
  assert.match(settingsWindowRs, /SETTINGS_WINDOW_HEIGHT:\s*f64\s*=\s*500\.0/);
  assert.match(
    settingsWindowRs,
    /\.inner_size\(SETTINGS_WINDOW_WIDTH,\s*SETTINGS_WINDOW_HEIGHT\)/,
  );
  assert.match(
    settingsWindowRs,
    /\.min_inner_size\(SETTINGS_WINDOW_WIDTH,\s*SETTINGS_WINDOW_HEIGHT\)/,
  );
  assert.match(
    settingsWindowRs,
    /\.max_inner_size\(SETTINGS_WINDOW_WIDTH,\s*SETTINGS_WINDOW_HEIGHT\)/,
  );
  assert.match(settingsWindowRs, /windowKind/);
  assert.match(settingsWindowRs, /settings/);
});

void test("open file and reader gears open the native singleton settings window", () => {
  assert.match(openFileWindowTsx, /open-file-settings-button/);
  assert.match(openFileWindowTsx, /settingsApi\.openSettingsWindow/);
  assert.doesNotMatch(openFileWindowTsx, /setIsSettingsOpen/);
  assert.doesNotMatch(openFileWindowTsx, /from "\.\.\/settings\/SettingsWindow\.tsx"/);
  assert.doesNotMatch(openFileWindowTsx, /<SettingsWindow/);
  assert.doesNotMatch(openFileWindowTsx, /presentation="modal"/);
  assert.match(
    appCss,
    /\.open-file-settings-button\s*{[^}]*\bposition:\s*absolute;[^}]*\bright:\s*5px;[^}]*\bbottom:\s*5px;[^}]*\bwidth:\s*32px;[^}]*\bheight:\s*32px;/s,
  );
  assert.match(
    appCss,
    /\.open-file-settings-button svg\s*{[^}]*\bwidth:\s*16px;[^}]*\bheight:\s*16px;/s,
  );

  assert.match(readerWindowTsx, /reader-preview-settings-button/);
  assert.match(readerWindowTsx, /settingsApi\.openSettingsWindow/);
  assert.doesNotMatch(readerWindowTsx, /setIsSettingsOpen/);
  assert.doesNotMatch(readerWindowTsx, /from "\.\.\/settings\/SettingsWindow\.tsx"/);
  assert.doesNotMatch(readerWindowTsx, /<SettingsWindow/);
});

void test("window cards share a 22px radius", () => {
  const openFileCard = getCssRuleBody(".open-file-window");
  const readerCards = getCssRuleBodyContainingSelector(
    ".reader-preview-outline-card",
    "border-radius",
  );
  const settingsFrame = getCssRuleBody(".settings-window-frame");

  assert.equal(getCssPxDeclaration(openFileCard, "border-radius"), 22);
  assert.equal(getCssPxDeclaration(readerCards, "border-radius"), 22);
  assert.equal(getCssPxDeclaration(settingsFrame, "border-radius"), 22);
});

void test("primary open button does not render a leading icon", () => {
  const primaryOpenButtonMarkup = openFileWindowTsx.match(
    /<button\s+className="primary-open-button"[\s\S]*?<\/button>/,
  )?.[0];

  assert.ok(primaryOpenButtonMarkup, "Missing primary open button markup");
  assert.match(primaryOpenButtonMarkup, /<span>打开 Markdown 文件<\/span>/);
  assert.doesNotMatch(primaryOpenButtonMarkup, /<FolderIcon\s*\/>/);
  assert.doesNotMatch(openFileWindowTsx, /function FolderIcon\(\)/);
});

void test("settings gears use radius plus padding balance against their cards", () => {
  const openFileCard = getCssRuleBody(".open-file-window");
  const openFileGear = getCssRuleBody(".open-file-settings-button");
  const readerCard = getCssRuleBodyContainingSelector(
    ".reader-preview-reading-card",
    "border-radius",
  );
  const readerGear = getCssRuleBody(".reader-preview-settings-button");

  const openFileCardRadius = getCssPxDeclaration(openFileCard, "border-radius");
  const openFileCardBorderWidth = getCssLeadingPxDeclaration(openFileCard, "border");
  const openFileGearRadius = getCssPxDeclaration(openFileGear, "width") / 2;
  const openFileGearRight = getCssPxDeclaration(openFileGear, "right");
  const openFileGearBottom = getCssPxDeclaration(openFileGear, "bottom");
  const readerCardRadius = getCssPxDeclaration(readerCard, "border-radius");
  const readerGearRadius = getCssPxDeclaration(readerGear, "width") / 2;
  const readerGearRight = getCssPxDeclaration(readerGear, "right");
  const readerGearBottom = getCssPxDeclaration(readerGear, "bottom");

  assert.match(openFileGear, /\bbox-sizing:\s*border-box;/);
  assert.match(openFileGear, /\bpadding:\s*0;/);
  assert.match(readerGear, /\bbox-sizing:\s*border-box;/);
  assert.match(readerGear, /\bpadding:\s*0;/);
  assert.equal(openFileGearRadius, 16);
  assert.equal(readerGearRadius, 16);
  assert.equal(
    openFileGearRadius + openFileGearRight + openFileCardBorderWidth,
    openFileCardRadius,
  );
  assert.equal(
    openFileGearRadius + openFileGearBottom + openFileCardBorderWidth,
    openFileCardRadius,
  );
  assert.equal(readerGearRadius + readerGearRight, readerCardRadius);
  assert.equal(readerGearRadius + readerGearBottom, readerCardRadius);
});

void test("open file hero icon and settings title match the current visual size", () => {
  assert.match(
    appCss,
    /\.open-file-mark svg\s*{[^}]*\bwidth:\s*72px;[^}]*\bheight:\s*72px;/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.open-file-mark svg\s*{[^}]*\bwidth:\s*80px;[^}]*\bheight:\s*80px;/s,
  );
  assert.doesNotMatch(
    appCss,
    /\.open-file-mark svg\s*{[^}]*\bwidth:\s*96px;[^}]*\bheight:\s*96px;/s,
  );
  assert.match(appCss, /\.settings-window-title\s*{[^}]*\bfont-size:\s*18px;/s);
});

void test("settings UI follows docs/ui/settings.html and preserves save failure rollback", () => {
  const settingsRowBlock =
    appCss.match(/\.settings-row\s*{(?<body>[\s\S]*?)\n}/)?.groups?.body ?? "";
  const settingsPanelBlock =
    appCss.match(/\.settings-panel\s*{(?<body>[\s\S]*?)\n}/)?.groups?.body ?? "";

  assert.match(settingsWindowTsx, /settings-window-shell/);
  assert.doesNotMatch(settingsWindowTsx, /settings-modal-backdrop/);
  assert.doesNotMatch(settingsWindowTsx, /settings-modal-close/);
  assert.doesNotMatch(settingsWindowTsx, /aria-modal/);
  assert.match(settingsWindowTsx, /settings-window-title/);
  assert.match(settingsWindowTsx, /settings-panel/);
  assert.match(settingsWindowTsx, /custom-select/);
  assert.match(settingsWindowTsx, /select-trigger/);
  assert.match(settingsWindowTsx, /select-menu/);
  assert.match(
    settingsWindowTsx,
    /id="bodyFontFamily"[\s\S]*?id="codeFontFamily"[\s\S]*?dropUp/,
  );
  assert.match(settingsWindowTsx, /settings-version/);
  assert.doesNotMatch(settingsWindowTsx, /settings-sidebar/);
  assert.doesNotMatch(settingsWindowTsx, /settings-content/);
  assert.doesNotMatch(settingsWindowTsx, /settings-nav-item/);
  assert.match(settingsWindowTsx, /lastSavedSettings/);
  assert.match(settingsWindowTsx, /setSettings\(lastSavedSettings\)/);
  assert.match(settingsWindowTsx, /role="alert"/);
  assert.match(
    appCss,
    /\.settings-window-frame\s*{[^}]*\bwidth:\s*100%;[^}]*\bheight:\s*100%;[^}]*\boverflow:\s*visible;/s,
  );
  assert.match(
    appCss,
    /\.settings-window-frame,\s*\.settings-window-frame \*\s*{[^}]*box-sizing:\s*border-box;/s,
  );
  assert.match(
    settingsPanelBlock,
    /\bleft:\s*calc\(50% - min\(360px,\s*50% - 24px\)\);/,
  );
  assert.match(
    settingsPanelBlock,
    /\bright:\s*calc\(50% - min\(360px,\s*50% - 24px\)\);/,
  );
  assert.match(
    settingsPanelBlock,
    /\bbottom:\s*calc\(var\(--window-card-inset\) \+ 8px\);/,
  );
  assert.match(settingsPanelBlock, /\boverflow:\s*visible;/);
  assert.doesNotMatch(settingsPanelBlock, /background:/);
  assert.doesNotMatch(settingsPanelBlock, /box-shadow:/);
  assert.doesNotMatch(settingsPanelBlock, /border-radius:/);
  assert.match(
    appCss,
    /\.settings-row\s*{[^}]*grid-template-columns:\s*138px\s+minmax\(0,\s*1fr\);/s,
  );
  assert.doesNotMatch(settingsRowBlock, /background:/);
  assert.doesNotMatch(settingsRowBlock, /box-shadow:/);
  assert.doesNotMatch(settingsRowBlock, /padding:/);
  assert.match(
    appCss,
    /\.select-menu\s*{[^}]*--select-menu-max-height:\s*clamp\(168px,\s*calc\(100vh - 318px\),\s*196px\);[^}]*\bmax-height:\s*var\(--select-menu-max-height\);[^}]*\boverflow:\s*hidden;/s,
  );
  assert.match(
    appCss,
    /\.select-menu-scroll\s*{[^}]*\bmax-height:\s*var\(--select-menu-max-height\);[^}]*\boverflow-y:\s*auto;/s,
  );
  assert.doesNotMatch(appCss, /\.select-menu\s*{[^}]*\bpadding:\s*7px;/s);
  assert.doesNotMatch(appCss, /\.select-menu-scroll\s*{[^}]*\bgap:\s*3px;/s);
  assert.doesNotMatch(appCss, /\.select-menu-scroll\s*{[^}]*\bpadding-right:\s*17px;/s);
  assert.match(
    appCss,
    /\.select-option\s*{[^}]*\bborder-radius:\s*0;[^}]*\bpadding:\s*0\s+42px\s+0\s+18px;/s,
  );
  assert.match(
    appCss,
    /\.select-menu-scroll\s*{[^}]*\bscrollbar-width:\s*none;[^}]*-ms-overflow-style:\s*none;/s,
  );
  assert.match(
    appCss,
    /\.select-menu-scroll::-webkit-scrollbar\s*{[^}]*\bdisplay:\s*none;/s,
  );
  assert.match(settingsWindowTsx, /select-menu-scrollbar-hotzone/);
  assert.match(settingsWindowTsx, /select-menu-scrollbar-thumb/);
  assert.match(settingsWindowTsx, /onLostPointerCapture=\{stopMenuDragging\}/);
  assert.match(
    settingsWindowTsx,
    /window\.addEventListener\("pointerup",\s*stopWindowMenuDragging,\s*true\)/,
  );
  assert.match(
    settingsWindowTsx,
    /window\.addEventListener\("pointercancel",\s*stopWindowMenuDragging,\s*true\)/,
  );
  assert.match(settingsWindowTsx, /listAvailableFontFamilies/);
  assert.match(settingsWindowTsx, /defaultAvailableFontFamilies/);
  assert.match(fontFamiliesRs, /Windows NT\\CurrentVersion\\Fonts/);
  assert.match(fontFamiliesRs, /Microsoft YaHei & Microsoft YaHei UI/);
  assert.match(
    appCss,
    /\.select-menu-scrollbar-hotzone\s*{[^}]*\bopacity:\s*0;[^}]*\bpointer-events:\s*auto;/s,
  );
  assert.match(
    appCss,
    /\.select-menu-scrollbar-hotzone:hover,\s*\.select-menu-scrollbar-hotzone:focus-within,\s*\.select-menu\[data-dragging-scrollbar="true"\]\s+\.select-menu-scrollbar-hotzone\s*{[^}]*\bopacity:\s*1;/s,
  );
  assert.match(
    appCss,
    /\.custom-select\.drop-down\s+\.select-menu\s*{[^}]*top:\s*calc\(100% \+ 6px\);/s,
  );
  assert.match(
    appCss,
    /\.custom-select\.drop-up\s+\.select-menu\s*{[^}]*bottom:\s*calc\(100% \+ 6px\);/s,
  );
  assert.match(settingsWindowTsx, /openSelectDirection/);
  assert.match(settingsWindowTsx, /getBoundingClientRect/);
  assert.match(settingsWindowTsx, /spaceBelow >= menuHeight/);
  assert.doesNotMatch(settingsWindowTsx, /localStorage/);
  assert.doesNotMatch(
    readFileSync(new URL("./main.tsx", import.meta.url), "utf8"),
    /localStorage/,
  );
});

void test("settings window displays the package version", () => {
  assert.equal(packageJson.version, "0.1.7");
  assert.equal(tauriConfig.version, packageJson.version);
  assert.match(
    settingsWindowTsx,
    new RegExp(`settings-version">MD极简阅读 · v${packageJson.version}<`),
  );
});

void test("native settings window keeps the settings.html window shape at its native width", () => {
  const readerResponsiveBlockStart = appCss.indexOf("@media (max-width: 980px)");
  const settingsResponsiveBlockStart = appCss.indexOf("@media (max-width: 560px)");

  assert.notEqual(readerResponsiveBlockStart, -1);
  assert.notEqual(settingsResponsiveBlockStart, -1);
  assert.ok(settingsResponsiveBlockStart > readerResponsiveBlockStart);

  const readerResponsiveBlock = appCss.slice(
    readerResponsiveBlockStart,
    settingsResponsiveBlockStart,
  );
  const settingsResponsiveBlock = appCss.slice(settingsResponsiveBlockStart);

  assert.doesNotMatch(appCss, /\.settings-modal-surface/);
  assert.doesNotMatch(readerResponsiveBlock, /\.settings-window-frame/);
  assert.doesNotMatch(
    appCss,
    /\.settings-window-frame\s*{[^}]*grid-template-columns:\s*210px/s,
  );
  assert.doesNotMatch(settingsResponsiveBlock, /\.settings-sidebar/);
  assert.match(appCss, /\.settings-window-shell\s*{[^}]*\bheight:\s*100vh;/s);
  assert.match(
    appCss,
    /\.settings-window-frame\s*{[^}]*\bwidth:\s*100%;[^}]*\bheight:\s*100%;/s,
  );
});

void test("settings UI QA has a stable local browser entrypoint", () => {
  const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const settingsUiQaScript = readFileSync(
    new URL("../tools/settings-ui-qa.mjs", import.meta.url),
    "utf8",
  );

  assert.match(packageJson, /"qa:settings-ui":\s*"node tools\/settings-ui-qa\.mjs"/);
  assert.match(settingsUiQaScript, /domcontentloaded/);
  assert.doesNotMatch(settingsUiQaScript, /networkidle/);
  assert.match(settingsUiQaScript, /chromium-1228/);
  assert.match(settingsUiQaScript, /chrome-win64/);
  assert.match(settingsUiQaScript, /chrome\.exe/);
  assert.match(settingsUiQaScript, /__qaSettingsPatches/);
  assert.match(settingsUiQaScript, /select-menu-scrollbar-thumb/);
});

void test("reader settings are loaded from Rust and synchronized across every app window", () => {
  const mainEntry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
  const applyReaderSettings = readFileSync(
    new URL("./features/settings/apply-reader-settings.ts", import.meta.url),
    "utf8",
  );

  assert.match(mainEntry, /createSettingsApi/);
  assert.match(mainEntry, /getReaderSettings/);
  assert.match(mainEntry, /listenForReaderSettingsChanges/);
  assert.match(mainEntry, /applyReaderSettingsToRoot/);
  assert.match(settingsRs, /emit_reader_settings_changed/);
  assert.match(settingsRs, /\.emit\(READER_SETTINGS_CHANGED_EVENT/);
  assert.doesNotMatch(settingsRs, /emit_to/);
  assert.match(applyReaderSettings, /--reader-content-max-width/);
  assert.match(applyReaderSettings, /--reader-body-font-size/);
  assert.match(applyReaderSettings, /--reader-code-font-size/);
  assert.match(applyReaderSettings, /--reader-line-height/);
  assert.match(
    appCss,
    /\.reader-preview-document\s*{[^}]*max-width:\s*min\(100%,\s*var\(--reader-content-max-width,\s*860px\)\);/s,
  );
  assert.match(
    appCss,
    /\.markdown-rendered-document\s*{[^}]*font-size:\s*var\(--reader-body-font-size,\s*16px\);[^}]*line-height:\s*var\(--reader-line-height,\s*1\.86\);/s,
  );
});

void test("reader windows receive and persist window state separately from settings", () => {
  const readerWindowsRs = readFileSync(
    new URL("../src-tauri/src/reader_windows.rs", import.meta.url),
    "utf8",
  );

  assert.match(windowStateRs, /window-state\.json/);
  assert.match(windowStateRs, /struct WindowStateStore/);
  assert.match(windowStateRs, /serde\(rename_all = "camelCase"\)/);
  assert.match(windowStateRs, /window_state_store_key/);
  assert.doesNotMatch(windowStateRs, /inner_size\(\)/);
  assert.doesNotMatch(windowStateRs, /outer_position\(\)/);
  assert.doesNotMatch(windowStateRs, /is_window_state_visible_on_any_monitor/);
  assert.doesNotMatch(windowStateRs, /MonitorRect/);
  assert.doesNotMatch(
    readerWindowsRs,
    /builder\s*=\s*builder\.inner_size\(\s*state\.width/s,
  );
  assert.doesNotMatch(readerWindowsRs, /\.position\(x,\s*y\)/);

  assert.match(readerWindowTsx, /READING_POSITION_SAVE_DELAY_MS\s*=\s*800/);
  assert.match(readerWindowTsx, /saveWindowState/);
  assert.match(readerWindowTsx, /getRestoreTarget/);
  assert.match(readerWindowTsx, /const currentFileModifiedAt = file\.modifiedAt/);
  assert.match(readerWindowTsx, /currentFileModifiedAt,/);
  assert.match(readerWindowTsx, /fileModifiedAt:\s*file\.modifiedAt/);
  assert.match(
    readerWindowTsx,
    /const currentFileSize = file\.fileSize\s*\?\?\s*file\.content\.length/,
  );
  assert.match(readerWindowTsx, /fileSize:\s*currentFileSize/);
  assert.match(readerWindowTsx, /initialWindowState/);
  assert.doesNotMatch(readerWindowTsx, /presentation="modal"/);
  assert.match(readerWindowTsx, /settingsApi\.openSettingsWindow/);
  assert.doesNotMatch(settingsRs, /scrollTop/);
});
