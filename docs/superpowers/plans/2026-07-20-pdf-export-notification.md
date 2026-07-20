# PDF Export Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 PDF 导出通知调整为与大纲卡片内容区同宽的两行结构，成功时显示导出的 PDF 文件名，失败时显示具体原因。

**Architecture:** 保留现有 `startPdfExport` 与 Rust `outputPath` 契约，在前端导出模块增加跨平台文件名提取纯函数；通知状态改为结构化 `title + detail`，组件分别渲染两行。通过可注入的 `PdfExportApi` 让仓库 QA 同时驱动成功与失败分支，CSS 使用共享变量将通知宽度绑定到大纲卡片内容宽度。

**Tech Stack:** React 19、TypeScript、CSS custom properties、Node test runner、仓库内 Chromium/CDP QA、Tauri 2。

---

## 文件结构

- `src/features/export-pdf/export-pdf.ts`：保留导出状态机并提供从 `outputPath` 提取文件名的纯函数。
- `src/features/export-pdf/export-pdf.test.ts`：验证 Windows 与正斜杠路径的文件名提取。
- `src/features/reader/reader-notifications.ts`：维护通知结构与堆叠状态，不承担 JSX 渲染。
- `src/features/reader/reader-notifications.test.ts`：验证结构化通知在 reducer 中保持不变，并保留错误上限行为。
- `src/features/reader/ReaderPreviewWindow.tsx`：把导出结果转换为通知标题/详情并渲染两行 DOM。
- `src/App.css`：把通知栈对齐到大纲卡片内容区并定义两行排版。
- `tools/reader-ui-qa.tsx`：为 QA 注入成功的 PDF API，不影响正式应用入口。
- `tools/pdf-export-qa.mjs`：验证成功/失败两种通知、几何尺寸、主题继承、打印态隐藏并保存屏幕截图。
- `docs/implementation-worklist.md`：在 16.12 下追加本次实现与验证记录。

### Task 1: 建立通知内容与文件名提取的失败测试

**Files:**

- Modify: `src/features/export-pdf/export-pdf.test.ts`
- Modify: `src/features/reader/reader-notifications.test.ts`

- [ ] **Step 1: 为跨平台 PDF 文件名提取添加测试**

将 `export-pdf.test.ts` 的导入改为：

```ts
import { getPdfExportFileName, startPdfExport } from "./export-pdf.ts";
```

追加：

```ts
void test("extracts only the PDF file name from native output paths", () => {
  assert.equal(
    getPdfExportFileName(String.raw`E:\notes\readme (2).pdf`),
    "readme (2).pdf",
  );
  assert.equal(getPdfExportFileName("/Users/name/notes/readme.pdf"), "readme.pdf");
});
```

- [ ] **Step 2: 将通知测试夹具改成 `title + detail` 并验证结构保留**

把错误夹具改为：

```ts
function error(id: string): ReaderNotification {
  return {
    id,
    kind: "error",
    title: "PDF导出失败！",
    detail: id,
    isClosing: false,
  };
}
```

成功夹具使用：

```ts
{
  id: "success",
  kind: "success",
  title: "PDF文件已导出！",
  detail: "readme.pdf",
  isClosing: false,
}
```

追加结构断言：

```ts
void test("preserves notification title and detail", () => {
  const notification = error("无法保存 PDF 文件：Access denied");
  const notifications = addReaderNotification([], notification);

  assert.deepEqual(notifications[0], notification);
});
```

- [ ] **Step 3: 运行定向单测并确认红灯**

Run:

```powershell
node --test --experimental-strip-types src/features/export-pdf/export-pdf.test.ts src/features/reader/reader-notifications.test.ts
```

Expected: FAIL，因为 `getPdfExportFileName` 尚未导出，且当前 `ReaderNotification` 仍要求 `message`。

### Task 2: 建立成功/失败通知 DOM 与几何尺寸的失败 QA

**Files:**

- Modify: `tools/reader-ui-qa.tsx`
- Modify: `tools/pdf-export-qa.mjs`

- [ ] **Step 1: 在 QA 页面声明成功导出 API**

导入类型：

```ts
import type { PdfExportApi } from "../src/features/export-pdf/pdf-export-api.ts";
```

在渲染前增加：

```ts
const qaPdfExportMode = new URLSearchParams(window.location.search).get("pdfExport");
const qaPdfExportApi: PdfExportApi | undefined =
  qaPdfExportMode === "success"
    ? {
        exportPdf: () =>
          Promise.resolve({
            outputPath: String.raw`E:\notes\reader-ui-qa (2).pdf`,
          }),
      }
    : undefined;
```

并向 `ReaderPreviewWindow` 传入：

```tsx
pdfExportApi = { qaPdfExportApi };
```

- [ ] **Step 2: 扩展 PDF QA 的错误通知断言**

把错误等待条件改为分别查找标题和详情：

```js
document.querySelector(
  '.reader-preview-notification[data-kind="error"] .reader-preview-notification-title',
)?.textContent === "PDF导出失败！" &&
  document
    .querySelector(
      '.reader-preview-notification[data-kind="error"] .reader-preview-notification-detail',
    )
    ?.textContent?.includes("PDF 导出只能在桌面应用中使用。") === true;
```

在几何采集中加入：

```js
const notificationRect = notification?.getBoundingClientRect();
const stackRect = notificationStack?.getBoundingClientRect();
return {
  title: notification?.querySelector(".reader-preview-notification-title")?.textContent,
  detail: notification?.querySelector(".reader-preview-notification-detail")
    ?.textContent,
  notificationWidth: Math.round(notificationRect?.width ?? 0),
  stackWidth: Math.round(stackRect?.width ?? 0),
  // 保留已有字段
};
```

断言：

```js
assert.equal(notification.result.value.title, "PDF导出失败！");
assert.equal(notification.result.value.detail, "PDF 导出只能在桌面应用中使用。");
assert.equal(notification.result.value.stackLeft, "35px");
assert.equal(notification.result.value.stackWidth, 302);
assert.equal(notification.result.value.notificationWidth, 302);
```

- [ ] **Step 3: 扩展 PDF QA 的成功通知交互**

重新导航到：

```js
`${qaUrl}?pdfExport=success`;
```

等待文档后点击导出按钮，并断言：

```js
const success = document.querySelector(
  '.reader-preview-notification[data-kind="success"]',
);
return {
  title: success?.querySelector(".reader-preview-notification-title")?.textContent,
  detail: success?.querySelector(".reader-preview-notification-detail")?.textContent,
};
```

Expected values:

```js
{
  title: "PDF文件已导出！",
  detail: "reader-ui-qa (2).pdf",
}
```

在切换打印媒体前保存可见通知截图到 `output/playwright/pdf-export-notification.png`。

- [ ] **Step 4: 运行 PDF QA 并确认红灯**

Run:

```powershell
pnpm qa:pdf-export
```

Expected: FAIL，因为正式组件尚未接受注入 API、尚未渲染标题/详情元素，通知仍是 `24px` 左偏移和自适应宽度。

### Task 3: 最小实现结构化通知和内容区同宽布局

**Files:**

- Modify: `src/features/export-pdf/export-pdf.ts`
- Modify: `src/features/reader/reader-notifications.ts`
- Modify: `src/features/reader/ReaderPreviewWindow.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: 实现跨平台文件名提取**

在 `export-pdf.ts` 增加：

```ts
export function getPdfExportFileName(outputPath: string): string {
  return outputPath.split(/[\\/]/).pop() || outputPath;
}
```

- [ ] **Step 2: 将通知模型改为两行内容**

把 `ReaderNotification` 改为：

```ts
export type ReaderNotification = {
  id: string;
  isClosing: boolean;
  kind: "error" | "success";
  title: string;
  detail: string;
};
```

堆叠、关闭与删除算法保持不变。

- [ ] **Step 3: 让阅读窗口消费 `outputPath` 并保留真实错误**

导入：

```ts
import { getPdfExportFileName, startPdfExport } from "../export-pdf/export-pdf.ts";
import type { PdfExportApi } from "../export-pdf/pdf-export-api.ts";
```

把默认 API 命名为：

```ts
const defaultPdfExportApi = createPdfExportApi();
```

在 props 增加：

```ts
pdfExportApi?: PdfExportApi;
```

并在参数解构中使用：

```ts
pdfExportApi = defaultPdfExportApi,
```

把 `showReaderNotification` 签名改为：

```ts
(kind: ReaderNotification["kind"], title: string, detail: string) => {
```

创建通知时写入 `title` 和 `detail`。导出分支改为：

```ts
if (result.kind === "resource-timeout") {
  showReaderNotification(
    "error",
    "PDF导出失败！",
    "图片尚未加载完成，暂未导出。请检查图片路径或网络后重试。",
  );
} else if (result.kind === "export-failed") {
  showReaderNotification("error", "PDF导出失败！", result.message);
} else {
  showReaderNotification(
    "success",
    "PDF文件已导出！",
    getPdfExportFileName(result.outputPath),
  );
}
```

准备阶段异常改为：

```ts
showReaderNotification(
  "error",
  "PDF导出失败！",
  `无法准备 PDF 导出：${getErrorMessage(error)}`,
);
```

- [ ] **Step 4: 渲染独立标题和详情元素**

通知 JSX 改为：

```tsx
<p
  className="reader-preview-notification"
  data-closing={notification.isClosing}
  data-kind={notification.kind}
  key={notification.id}
  role={notification.kind === "error" ? "alert" : "status"}
>
  <span className="reader-preview-notification-title">{notification.title}</span>
  <span className="reader-preview-notification-detail">{notification.detail}</span>
</p>
```

- [ ] **Step 5: 通过共享 CSS 变量绑定大纲内容宽度**

在 `.reader-preview-shell` 增加：

```css
--reader-outline-width: 336px;
--reader-outline-inline-padding: 17px;
```

从 `.reader-preview-layout` 删除重复的 `--reader-outline-width`，把大纲 padding 改为：

```css
padding: 24px var(--reader-outline-inline-padding) 20px;
```

通知栈改为：

```css
left: calc(var(--window-card-inset) + var(--reader-outline-inline-padding));
width: calc(
  var(--reader-outline-width) - var(--reader-outline-inline-padding) -
    var(--reader-outline-inline-padding)
);
max-width: calc(
  100vw - 2 * var(--window-card-inset) - 2 * var(--reader-outline-inline-padding)
);
align-items: stretch;
```

通知项改为 `width: 100%`，并加入：

```css
.reader-preview-notification-title,
.reader-preview-notification-detail {
  display: block;
}

.reader-preview-notification-title {
  font-weight: 700;
}
```

- [ ] **Step 6: 运行定向测试和 PDF QA 直到绿灯**

Run:

```powershell
node --test --experimental-strip-types src/features/export-pdf/export-pdf.test.ts src/features/reader/reader-notifications.test.ts
pnpm qa:pdf-export
```

Expected: 所有定向单测 PASS；PDF QA 同时确认失败通知与成功通知，宽度 `302px`、左偏移 `35px`，打印态通知仍隐藏。

- [ ] **Step 7: 提交实现与回归测试**

```powershell
git add -- src/features/export-pdf/export-pdf.ts src/features/export-pdf/export-pdf.test.ts src/features/reader/reader-notifications.ts src/features/reader/reader-notifications.test.ts src/features/reader/ReaderPreviewWindow.tsx src/App.css tools/reader-ui-qa.tsx tools/pdf-export-qa.mjs
git commit -m "feat: improve PDF export notifications"
```

### Task 4: 全量验证、视觉检查和工作列表记录

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

Expected: 所有命令退出码为 0；PDF QA 截图显示两行通知并与大纲内容边缘对齐；Tauri 命令生成新的 release 测试 EXE，不生成安装包。

- [ ] **Step 2: 人工查看通知截图**

使用本地图片查看工具打开：

```text
E:\only_md_reader\output\playwright\pdf-export-notification.png
```

核对：通知为两行、宽度覆盖大纲内容区、无裁切或溢出、文件名不含路径。

- [ ] **Step 3: 在工作列表 16.12 追加验证记录**

追加一条 `2026-07-20` 修正记录，准确写入：成功/失败两行文案、动态文件名、真实错误原因、`302px` 宽度与 `35px` 左偏移、实际通过的测试数量、QA 命令、测试 EXE 路径及 SHA-256。不得在命令实际完成前填写通过状态或哈希。

- [ ] **Step 4: 验证文档并提交**

```powershell
pnpm exec prettier --check docs/implementation-worklist.md
git diff --check
git add -- docs/implementation-worklist.md
git commit -m "docs: record PDF notification validation"
```

Expected: 仅工作列表进入该文档提交，用户已有未跟踪 PDF 不被暂存。
