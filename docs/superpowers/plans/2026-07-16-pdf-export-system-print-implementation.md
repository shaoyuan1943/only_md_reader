# PDF 导出 V1（系统打印）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在阅读窗口中实现仅按钮触发的 PDF 系统打印导出，并以 A4 浅色打印样式完整输出当前 Markdown 正文。

**Architecture:** 新的 `features/export-pdf` 模块负责资源稳定性和单次系统打印编排；`ReaderPreviewWindow` 只管理按钮、错误/忙碌状态与 `Ctrl+P`/`Cmd+P` 拦截。专用 `@media print` CSS 将现有阅读 DOM 从滚动卡片重排为完整 A4 文档；新的 CDP QA 脚本从同一阅读 QA 页面生成多页 PDF 并验证内容、样式和非正文 UI 被隐藏。

**Tech Stack:** React 19、TypeScript、浏览器 `document.fonts`/`window.print()`、CSS `@page`/`@media print`、Node 内置 test、现有 Chromium CDP QA。

---

## Files

| 路径                                               | 职责                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/features/export-pdf/export-readiness.ts`      | 等待字体、正文图片和两个最终布局帧；返回 ready/timeout。                          |
| `src/features/export-pdf/export-readiness.test.ts` | 资源就绪、失败图片、超时和布局帧的 Node 单测。                                    |
| `src/features/export-pdf/export-pdf.ts`            | 调用 readiness 后执行注入的打印函数，返回可显示的结果。                           |
| `src/features/export-pdf/export-pdf.test.ts`       | 成功打印、超时不打印、打印异常的单测。                                            |
| `src/features/export-pdf/pdf-export.css`           | A4 浅色打印样式、隐藏 UI、解除滚动、分页与宽内容规则。                            |
| `src/features/markdown/markdown-renderer.ts`       | 为 Shiki 代码块同时输出 Eva Light/Dark CSS variables，使 print 可选择轻色 token。 |
| `src/features/markdown/markdown-renderer.test.ts`  | 验证双主题 Shiki token 输出与屏幕主题回归。                                       |
| `src/features/export-pdf/README.md`                | 导出模块的边界与测试说明。                                                        |
| `src/features/reader/ReaderPreviewWindow.tsx`      | PDF 按钮、用户指定 SVG、导出状态、错误提示和打印快捷键拦截。                      |
| `src/features/reader/reader-preview.ts`            | 导出按钮文案。                                                                    |
| `src/App.css`                                      | 屏幕态导出按钮和状态样式；导入打印 CSS。                                          |
| `src/main.tsx`                                     | 导入 `pdf-export.css`。                                                           |
| `tools/reader-ui-qa.tsx`                           | 给导出按钮和复杂 Markdown 样本提供 QA hook。                                      |
| `tools/reader-ui-qa.mjs`                           | 验证按钮位置、提示、点击触发、资源等待和快捷键拦截。                              |
| `tools/pdf-export-qa.mjs`                          | 切换 print media、调用 `Page.printToPDF`、检查真实 PDF。                          |
| `package.json`                                     | 把导出模块单测加入 `test:unit`，新增 `qa:pdf-export`。                            |
| `AGENTS.md`                                        | 将 `pnpm qa:pdf-export` 追加到固定 QA 链路。                                      |

## Task 1: 写出资源就绪状态机（TDD）

**Files:**

- Create: `src/features/export-pdf/export-readiness.test.ts`
- Create: `src/features/export-pdf/export-readiness.ts`

- [ ] **Step 1: 写 failing tests。**

```ts
void test("waits for document fonts, unfinished markdown images, and two layout frames", async () => {
  const pendingImage = createFakeImage({ complete: false });
  const readiness = waitForPdfExportReadiness({
    document: createFakeDocument(),
    root: createFakeRoot([pendingImage]),
    requestAnimationFrame: createQueuedFrameScheduler(),
    timeoutMs: 100,
  });
  pendingImage.dispatch("load");
  await flushQueuedFrames();
  assert.deepEqual(await readiness, { kind: "ready" });
});
```

另写三条最小测试：已有 `data-load-state="failed"` 图片立即允许、未完成图片超时返回 `{ kind: "timeout" }`、事件监听器在超时后不再保留。

- [ ] **Step 2: 验证 RED。**

Run: `node --test --experimental-strip-types src/features/export-pdf/export-readiness.test.ts`
Expected: FAIL，原因是模块尚不存在。

- [ ] **Step 3: 写最小实现。**

导出 `PDF_EXPORT_RESOURCE_TIMEOUT_MS = 10_000` 和 `waitForPdfExportReadiness(options)`；它只查询 `img.markdown-image`，先等待 `document.fonts.ready`，再等待未完成图片的 `load`/`error`，最后排队两个 `requestAnimationFrame`。超时必须清理所有监听器和 timer。

- [ ] **Step 4: 验证 GREEN。**

Run: `node --test --experimental-strip-types src/features/export-pdf/export-readiness.test.ts`
Expected: PASS，4 个测试通过。

## Task 2: 编排打印调用（TDD）

**Files:**

- Create: `src/features/export-pdf/export-pdf.test.ts`
- Create: `src/features/export-pdf/export-pdf.ts`

- [ ] **Step 1: 写 failing tests。**

```ts
void test("prints exactly once after readiness succeeds", async () => {
  let prints = 0;
  const result = await startPdfExport({
    awaitReadiness: async () => ({ kind: "ready" }),
    print: () => {
      prints += 1;
    },
  });
  assert.deepEqual(result, { kind: "printed" });
  assert.equal(prints, 1);
});
```

另写：timeout 返回 `{ kind: "resource-timeout" }` 且 `print` 未调用；`print()` 抛错时返回 `{ kind: "print-failed", message }`。

- [ ] **Step 2: 验证 RED。**

Run: `node --test --experimental-strip-types src/features/export-pdf/export-pdf.test.ts`
Expected: FAIL，原因是 `startPdfExport` 尚不存在。

- [ ] **Step 3: 写最小实现。**

`startPdfExport` 接受可注入 `awaitReadiness` 和 `print`，只在 ready 时调用一次 `print()`；不读写文件、不调用 Tauri command。

- [ ] **Step 4: 验证 GREEN。**

Run: `node --test --experimental-strip-types src/features/export-pdf/export-pdf.test.ts`
Expected: PASS，3 个测试通过。

## Task 3: 接入阅读窗口与用户指定按钮（TDD + UI QA）

**Files:**

- Modify: `src/features/reader/ReaderPreviewWindow.tsx`
- Modify: `src/features/reader/reader-preview.ts`
- Modify: `src/App.css`
- Modify: `tools/reader-ui-qa.tsx`
- Modify: `tools/reader-ui-qa.mjs`

- [ ] **Step 1: 在 `tools/reader-ui-qa.mjs` 写 failing UI 断言。**

断言 `.reader-preview-pdf-export-button` 存在、为 `32×32`、`title`/`aria-label` 为“导出为PDF文档”、其中心点在设置按钮正上方且两按钮边缘间隔 6px；模拟 `window.print` 后点击按钮，断言只调用一次；派发 `Ctrl+P` 和 `Meta+P` 键盘事件，断言 `defaultPrevented === true` 且打印次数没有增加。

- [ ] **Step 2: 验证 RED。**

Run: `pnpm qa:reader-ui`
Expected: FAIL，找不到 PDF 导出按钮。

- [ ] **Step 3: 接入实现。**

在 `ReaderPreviewWindow` 中：

```tsx
<button
  className="reader-preview-pdf-export-button"
  type="button"
  aria-label={preview.pdfExportLabel}
  title={preview.pdfExportLabel}
  aria-busy={isPdfExportPreparing}
  disabled={isRendering || isPdfExportPreparing}
  onClick={() => void handlePdfExport()}
>
  <PdfExportIcon />
</button>
```

`PdfExportIcon` 复用已确认 SVG path；按钮放在设置按钮前、同一 `ScrollablePanel` 中。`handlePdfExport` 将 `readingScrollerRef.current`、`document` 和 `window.print.bind(window)` 交给 `startPdfExport`，在 `resource-timeout` 或 `print-failed` 时渲染非阻塞 `role="alert"` 文本。新增 document 级 `keydown` 监听，针对 `Ctrl+P`/`Cmd+P` 仅 `preventDefault()`，不调用导出函数。

- [ ] **Step 4: 验证 GREEN。**

Run: `pnpm qa:reader-ui`
Expected: PASS，新增导出断言和现有阅读交互均通过。

## Task 4: 编写 A4 浅色打印样式（TDD + print-media QA）

**Files:**

- Create: `src/features/export-pdf/pdf-export.css`
- Modify: `src/main.tsx`
- Modify: `src/features/markdown/markdown-renderer.ts`
- Modify: `src/features/markdown/markdown-renderer.test.ts`
- Create: `tools/pdf-export-qa.mjs`
- Modify: `package.json`

- [ ] **Step 1: 写 failing `qa:pdf-export`。**

脚本复用 reader QA 的 Vite/CDP 启动与 bootstrap，向页面发送 `Emulation.setEmulatedMedia`（`media: "print"`），断言：大纲、文件路径、设置/导出按钮、复制控件、滚动 chrome 与选择浮层的 computed `display` 为 `none`；正文根的 `overflow` 为 `visible`；主滚动容器的 `height/max-height` 不限制全文；页面背景为白色或等价浅色。

通过 `Page.printToPDF` 生成 `output/playwright/pdf-export-qa.pdf`，读取 PDF 字节并断言文件非空、页数至少为 2，且提取/检查 PDF 文本包含中文标题、代码、表格和公式样本文字。

- [ ] **Step 2: 验证 RED。**

Run: `pnpm qa:pdf-export`
Expected: FAIL，脚本或打印样式尚不存在。

- [ ] **Step 3: 写打印 CSS。**

`highlightCodeBlock` 改用 Shiki 的 `themes: { light, dark }` 与 `defaultColor: false`，使 token span 带有 `--shiki-light` / `--shiki-dark` 变量；屏幕态按当前 `data-code-theme` 选择变量，打印态固定选择 `--shiki-light`。`@page { size: A4; margin: 18mm 16mm 20mm; }`；在 `@media print` 内白底深色、隐藏应用 chrome、解除滚动、去除圆角/阴影、使 `.markdown-rendered-document` 全宽进入流。将代码块切换为浅色底和 `var(--shiki-light)` token，隐藏复制按钮；表格 `table-layout: auto`、`break-inside: avoid-page`；图片 `max-width: 100%`；代码、引用、公式、图片和表格使用 `break-inside: avoid-page`，过长块允许自然分页；禁止右侧裁切。

- [ ] **Step 4: 生成真实 PDF。**

Run: `pnpm qa:pdf-export`
Expected: PASS，并生成 `output/playwright/pdf-export-qa.pdf` 与页面 PNG 检查产物。

## Task 5: 接入测试、文档与完整验证

**Files:**

- Modify: `package.json`
- Modify: `AGENTS.md`
- Create: `src/features/export-pdf/README.md`
- Modify: `docs/implementation-worklist.md`

- [ ] **Step 1: 把两个新 Node 单测精确加入 `test:unit`。**

新增：`src/features/export-pdf/export-readiness.test.ts` 和 `src/features/export-pdf/export-pdf.test.ts`。

- [ ] **Step 2: 更新验证文档。**

在 `AGENTS.md` 的固定 QA 列表中加入 `pnpm qa:pdf-export`；README 记录 V1 只走系统打印、无快捷键、10 秒资源超时与不写文件。工作列表仅在每个真实验收完成后补充对应验证记录。

- [ ] **Step 3: 运行项目完整验证。**

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm qa:reader-ui
pnpm qa:pdf-export
pnpm qa:screenshots
cargo test --manifest-path src-tauri\Cargo.toml
pnpm tauri build --no-bundle --ci
```

Expected: 每条命令退出码 0；记录各命令的实际结果和 Windows 实机打印结果。

- [ ] **Step 4: Windows 实机验证。**

启动新的无安装包 release exe；打开包含中文、多页、表格、代码、公式和本地图片的样本文档；点击唯一的导出按钮；在 Windows 打印界面选择 PDF 输出并保存；检查 PDF 可打开、为多页、无应用 UI、浅色主题、正文未截断。取消一次打印并确认阅读位置与窗口仍可使用。

- [ ] **Step 5: Commit。**

```bash
git add src/features/export-pdf src/features/reader/ReaderPreviewWindow.tsx src/features/reader/reader-preview.ts src/App.css src/main.tsx tools/reader-ui-qa.tsx tools/reader-ui-qa.mjs tools/pdf-export-qa.mjs package.json AGENTS.md docs/implementation-worklist.md docs/superpowers/plans/2026-07-16-pdf-export-system-print-implementation.md
git commit -m "feat: add system print PDF export"
```

## Plan self-review

- Design coverage: 唯一按钮、无快捷键、指定 SVG、A4 浅色、无文件名/路径/页眉页脚、资源稳定、失败图片、超时、分页、真实 PDF QA、Windows 实机验证都被任务覆盖。
- Intentional exclusions: 没有添加保存路径、静默写 PDF、Pandoc/LaTeX、原生 WebView 或 Rust PDF API。
- Placeholder scan: 没有 `TBD`、`TODO` 或“适当处理”式步骤；每个代码任务均有明确文件、测试和命令。

## Critical plan revision (Shiki print theme)

当前 `highlightCodeBlock` 只输出当前明暗主题的 inline token color；仅用打印 CSS 把代码块背景改白会使暗色主题中的浅 token 在 PDF 上不可读。实施必须把 Shiki 输出改成双主题 CSS variables，并在打印媒体固定取 `--shiki-light`。这不是扩大范围，而是满足已确认的“PDF 固定浅色代码主题”要求；对应修改和测试已加入 Task 4。
