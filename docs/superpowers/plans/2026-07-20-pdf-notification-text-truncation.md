# PDF Notification Text Truncation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PDF 成功与失败通知中的任何超宽文本保持单行，并在通知框边界内显示省略号。

**Architecture:** 保留 `ReaderNotification.title` 与 `ReaderNotification.detail` 的完整字符串和现有 DOM 结构，只在两个文本元素上应用 CSS 单行省略。仓库 PDF QA 使用真实成功与失败导出分支注入超长内容，并同时验证完整 DOM 文本、计算样式、实际溢出和截图。

**Tech Stack:** React、TypeScript、CSS、Node.js、Chromium CDP、Tauri 2

---

## 文件结构

- Modify: `tools/reader-ui-qa.tsx` — 为 PDF QA 提供超长成功文件名和超长失败原因。
- Modify: `tools/pdf-export-qa.mjs` — 验证成功与失败通知的单行省略、完整 DOM 文本和无横向溢出。
- Modify: `src/App.css` — 对通知标题与详情应用 CSS 单行省略。
- Modify: `docs/implementation-worklist.md` — 记录实际验证结果、截图、测试 EXE 和 SHA-256。

### Task 1: 建立超长成功与失败通知的失败 QA

**Files:**

- Modify: `tools/reader-ui-qa.tsx`
- Modify: `tools/pdf-export-qa.mjs`

- [ ] **Step 1: 为 QA 页面提供超长成功文件名与失败原因**

在 `tools/reader-ui-qa.tsx` 的 `qaPdfExportMode` 附近加入固定测试文本，并让 `pdfExport=error` 走真实的拒绝分支：

```ts
const qaLongPdfFileName =
  "reader-ui-qa-document-with-an-intentionally-long-export-file-name (2).pdf";
const qaLongPdfError =
  "无法写入目标 PDF 文件，请确认目标目录存在、文件未被其他程序占用且当前账户具有写入权限。";
const qaPdfExportMode = new URLSearchParams(window.location.search).get("pdfExport");
const qaPdfExportApi: PdfExportApi | undefined =
  qaPdfExportMode === "success"
    ? {
        exportPdf: () =>
          Promise.resolve({
            outputPath: `E:\\notes\\${qaLongPdfFileName}`,
          }),
      }
    : qaPdfExportMode === "error"
      ? {
          exportPdf: () => Promise.reject(new Error(qaLongPdfError)),
        }
      : undefined;
```

- [ ] **Step 2: 将成功通知 QA 改为验证完整文本和实际单行溢出**

在 `tools/pdf-export-qa.mjs` 顶部加入与页面一致的测试常量：

```js
const qaLongPdfFileName =
  "reader-ui-qa-document-with-an-intentionally-long-export-file-name (2).pdf";
const qaLongPdfError =
  "无法写入目标 PDF 文件，请确认目标目录存在、文件未被其他程序占用且当前账户具有写入权限。";
```

将成功通知的等待条件改为完整长文件名，并从详情元素读取文本和布局：

```js
const title = success?.querySelector(".reader-preview-notification-title");
const detail = success?.querySelector(".reader-preview-notification-detail");
const titleStyle = title ? getComputedStyle(title) : null;
const detailStyle = detail ? getComputedStyle(detail) : null;
return {
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
```

断言完整 DOM 文本未被 JavaScript 改写，并且内容确实超宽：

```js
assert.equal(successNotification.result.value.title, "PDF文件已导出！");
assert.equal(successNotification.result.value.detail, qaLongPdfFileName);
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
```

- [ ] **Step 3: 增加超长失败原因 QA**

在成功通知截图之后导航到错误模式，点击导出并验证失败详情：

```js
await cdp.send("Page.navigate", { url: `${qaUrl}?pdfExport=error` });
await waitForExpression(
  cdp,
  "document.querySelector('.markdown-rendered-document h1')?.textContent?.includes('Reader QA Document') === true",
);
await cdp.send("Runtime.evaluate", {
  expression: "document.querySelector('.reader-preview-pdf-export-button')?.click()",
});
await waitForExpression(
  cdp,
  `document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail')?.textContent === ${JSON.stringify(qaLongPdfError)}`,
);
const longErrorNotification = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const detail = document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail');
    const style = detail ? getComputedStyle(detail) : null;
    return {
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
assert.equal(longErrorNotification.result.value.overflow, "hidden");
assert.equal(longErrorNotification.result.value.textOverflow, "ellipsis");
assert.equal(longErrorNotification.result.value.whiteSpace, "nowrap");
assert.ok(
  longErrorNotification.result.value.scrollWidth >
    longErrorNotification.result.value.clientWidth,
);
```

- [ ] **Step 4: 运行 PDF QA 并确认红灯**

Run:

```powershell
pnpm qa:pdf-export
```

Expected: FAIL；现有样式返回 `whiteSpace: "normal"` 或 `textOverflow: "clip"`，证明测试因缺少单行省略而失败，而不是因页面加载或测试语法失败。

### Task 2: 应用最小 CSS 单行省略并验证绿灯

**Files:**

- Modify: `src/App.css`
- Test: `tools/pdf-export-qa.mjs`

- [ ] **Step 1: 对通知标题与详情应用单行省略**

从 `.reader-preview-notification` 删除不再需要的父级声明：

```css
overflow-wrap: anywhere;
```

把两个通知文本元素的规则改为：

```css
.reader-preview-notification-title,
.reader-preview-notification-detail {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

不修改 `notification.title`、`notification.detail`、文件名提取函数、通知宽度、内边距或通知生命周期。

- [ ] **Step 2: 运行 PDF QA 并确认绿灯**

Run:

```powershell
pnpm qa:pdf-export
```

Expected: PASS；超长成功文件名和超长失败原因的 DOM 文本完整，`scrollWidth > clientWidth`，计算样式为 `overflow: hidden`、`text-overflow: ellipsis`、`white-space: nowrap`。

- [ ] **Step 3: 人工检查成功通知截图**

使用本地图片查看工具打开：

```text
E:\only_md_reader\.worktrees\pdf-export-notification\output\playwright\pdf-export-notification.png
```

Expected: 第二行保持单行，在右侧边界前显示省略号；通知框宽度、左/右/底 `6px` 间距和标题样式不变。

- [ ] **Step 4: 提交实现与 QA**

```powershell
git add -- src/App.css tools/reader-ui-qa.tsx tools/pdf-export-qa.mjs
git commit -m "fix: truncate overflowing PDF notification text"
```

### Task 3: 完整回归、测试构建和执行记录

**Files:**

- Modify: `docs/implementation-worklist.md`

- [ ] **Step 1: 运行完整验证链路**

Run:

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm qa:pdf-export
pnpm qa:reader-ui
pnpm build
pnpm tauri build --no-bundle --ci
```

Expected: 所有命令退出码为 `0`；`pnpm test` 无失败；PDF QA 验证成功与失败通知的超长文本省略；Tauri 生成新的 release 测试 EXE，不生成安装包。

- [ ] **Step 2: 记录新测试 EXE 的文件信息**

Run:

```powershell
$artifact = Get-Item -LiteralPath 'src-tauri\target\release\only-md-reader.exe'
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $artifact.FullName
[PSCustomObject]@{
  FullName = $artifact.FullName
  Length = $artifact.Length
  LastWriteTime = $artifact.LastWriteTime
  SHA256 = $hash.Hash
} | Format-List
```

Expected: 输出本次构建 EXE 的绝对路径、非零大小、最新修改时间和 SHA-256。

- [ ] **Step 3: 更新工作列表验证记录**

在 `docs/implementation-worklist.md` 的 PDF 通知修正记录中追加：所有超宽标题、成功文件名和失败原因均单行省略，DOM 保留完整原文；写入实际通过的测试数量、QA 命令、测试 EXE 路径、大小和 SHA-256。只记录已实际完成的结果。

- [ ] **Step 4: 验证文档与工作树并提交**

Run:

```powershell
pnpm exec prettier --check docs/implementation-worklist.md docs/superpowers/specs/2026-07-20-pdf-export-notification-design.md docs/superpowers/plans/2026-07-20-pdf-notification-text-truncation.md
git diff --check
git status --short
```

Expected: 格式检查和 `git diff --check` 通过；状态中只有本任务计划内的工作列表修改，用户未跟踪文件不进入提交。

Commit:

```powershell
git add -- docs/implementation-worklist.md
git commit -m "docs: record notification truncation validation"
```
