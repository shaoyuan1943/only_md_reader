import React from "react";
import ReactDOM from "react-dom/client";
import "../src/App.css";
import "katex/dist/katex.css";
import { ReaderPreviewWindow } from "../src/features/reader/ReaderPreviewWindow.tsx";
import type {
  SaveWindowStateRequest,
  WindowStateApi,
} from "../src/features/reader/window-state-api.ts";
import type { ReaderSettings } from "../src/features/settings/reader-settings.ts";
import { defaultReaderSettings } from "../src/features/settings/reader-settings.ts";
import type { SettingsApi } from "../src/features/settings/settings-api.ts";
import { defaultAvailableFontFamilies } from "../src/features/settings/settings-api.ts";
import { applyReaderSettingsToRoot } from "../src/features/settings/apply-reader-settings.ts";
import "../src/shared/fonts/maple-mono-nf-cn.css";
import "../src/shared/theme/theme.css";
import { validateThemeTokenBundle } from "../src/shared/theme/theme-schema.ts";
import warmPaper from "../src/shared/theme/themes/warm-paper.json";

const theme = validateThemeTokenBundle(warmPaper);
let currentSettings: ReaderSettings = {
  ...defaultReaderSettings,
  bodyFontFamily: "Georgia",
  codeFontFamily: "Consolas",
  themeMode: "light",
};

declare global {
  interface Window {
    __qaReaderSettingsOpened?: number;
    __qaSavedWindowStates?: SaveWindowStateRequest[];
  }
}

window.__qaReaderSettingsOpened = 0;
window.__qaSavedWindowStates = [];

applyReaderSettingsToRoot(theme, currentSettings, document.documentElement, false);

const qaSettingsApi: SettingsApi = {
  getReaderSettings() {
    return Promise.resolve(currentSettings);
  },

  listAvailableFontFamilies() {
    return Promise.resolve(defaultAvailableFontFamilies);
  },

  updateReaderSettings(patch) {
    currentSettings = {
      ...currentSettings,
      ...patch,
      schemaVersion: 1,
    };
    applyReaderSettingsToRoot(theme, currentSettings);

    return Promise.resolve(currentSettings);
  },

  resetReaderSettings() {
    currentSettings = defaultReaderSettings;
    applyReaderSettingsToRoot(theme, currentSettings);

    return Promise.resolve(currentSettings);
  },

  openSettingsWindow() {
    window.__qaReaderSettingsOpened = (window.__qaReaderSettingsOpened ?? 0) + 1;
    return Promise.resolve();
  },

  listenForReaderSettingsChanges() {
    return Promise.resolve(() => undefined);
  },
};

const qaWindowStateApi: WindowStateApi = {
  getWindowState() {
    return Promise.resolve({
      filePath: "E:\\only_md_reader\\fixtures\\markdown\\reader-ui-qa.md",
      scrollTop: 0,
      scrollRatio: 0,
      updatedAt: new Date(0).toISOString(),
    });
  },

  saveWindowState(state) {
    window.__qaSavedWindowStates?.push(state);

    return Promise.resolve({
      filePath: state.filePath,
      scrollTop: state.scrollTop,
      scrollRatio: state.scrollRatio,
      activeHeadingId: state.activeHeadingId,
      activeHeadingOffset: state.activeHeadingOffset,
      fileModifiedAt: state.fileModifiedAt,
      fileSize: state.fileSize,
      updatedAt: new Date(0).toISOString(),
    });
  },
};

const content = [
  "# Reader QA Document",
  "",
  "Intro paragraph used for the first viewport check.",
  "",
  "这是一个普通段落。Markdown 会把连续文本合并为一个段落，段落之间使用空行分隔。",
  "",
  "## 图片",
  "",
  "| Column A | Column B | Column C | Column D | Column E |",
  "| --- | --- | --- | --- | --- |",
  "| A very long cell that should stay inside a horizontal scroller | B | C | D | E |",
  "",
  "```ts",
  "export function visibleCodeBlock() {",
  "  return 'code block remains readable';",
  "}",
  "const intentionallyLongReaderQaLine = 'this code line is deliberately long so the code scroller keeps horizontal scrolling while markdown tables wrap into the reading width';",
  "```",
  "",
  "| 方案 | 能修什么 | 代价 |",
  "| --- | --- | --- |",
  "| A. 末尾补缺（补未闭合 stop / 全空 content 补空 text） | 修不了中段交错；仅修未闭合、空 content | 极低，保持流式 |",
  "| B. 完整 SSE 规范化（缓冲+重排+重序列化） | 交错/倒序/空 content 全能修 | 破坏透传低延迟；影响全部 anthropic apikey 流量；需开关灰度 |",
  "",
  "Indented code block:",
  "",
  "    API Error: API returned an empty or malformed response (HTTP 200)",
  "    -- check for a proxy or gateway intercepting the request",
  "",
  "[Open external reader link](https://example.com/only-md-reader-link)",
  "",
  "Footnote jump source.[^reader-note]",
  "",
  "Details boundary before paragraph for collapsed cross-selection.",
  "",
  "<details>",
  "<summary>点击展开详情</summary>",
  "",
  "Details selectable text stays available after the copy bubble appears.",
  "",
  "Details hidden text must never join folded cross selection.",
  "</details>",
  "",
  "Details boundary after paragraph for collapsed cross-selection.",
  "",
  "- Copy bubble anchor line one keeps the selected text ending well before the right edge.",
  "- Copy bubble anchor line two should not send the floating button to the card edge.",
  "",
  "选区压力段落：这段文字故意写得很长，用来覆盖用户从正文首行拖到后续行右侧空白区域的自然拖选路径。阅读器必须保持浏览器原生文本选择能力，不能因为复制泡泡或阅读窗口事件处理导致选区丢失、跳到大纲，或者只选中很短的一小段文字。Selection stress paragraph keeps enough English words to wrap across multiple visual lines in the QA viewport.",
  "",
  "Bad inline math $\\notacommand{$ must stay local.",
  "",
  "![missing image](./assets/reader-ui-missing.png)",
  "",
  "# Outline Depth H1",
  "",
  "## Outline Depth H2",
  "",
  "### Outline Depth H3",
  "",
  "#### Outline Depth H4",
  "",
  "##### Outline Depth H5",
  "",
  "###### Outline Depth H6",
  "",
  "## Outline truncation sentinel heading that must be clipped with an ellipsis instead of spilling outside the outline card lane",
  "",
  "This paragraph keeps the long outline heading present in the rendered document.",
  "",
  "## Long Section",
  "",
  ...Array.from(
    { length: 70 },
    (_, index) => `Paragraph ${index + 1}: scrolling content remains readable.`,
  ),
  "",
  "[^reader-note]: Reader footnote target used to verify in-document anchor navigation and backlink behavior.",
].join("\n");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ReaderPreviewWindow
      file={{
        path: "E:\\only_md_reader\\fixtures\\markdown\\reader-ui-qa.md",
        fileName: "reader-ui-qa.md",
        content,
        openedAt: 0,
        fileSize: content.length,
        modifiedAt: "2026-07-02T00:00:00.000Z",
      }}
      settingsApi={qaSettingsApi}
      windowStateApi={qaWindowStateApi}
    />
  </React.StrictMode>,
);
