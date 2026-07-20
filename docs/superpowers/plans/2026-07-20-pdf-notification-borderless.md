# Borderless PDF Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 真正移除 PDF 导出通知卡片边框，并通过 1px 几何补偿保持文字、关闭按钮、卡片尺寸及其他视觉行为不变。

**Architecture:** 只调整共享通知 CSS，并同步更新静态契约和真实浏览器 PDF QA。正式分支先完成 RED→GREEN、双主题截图与无安装包构建；随后将同一提交同步到临时强制失败分支，保留其固定 reject 默认 API。

**Tech Stack:** CSS、Node test、Chromium/CDP PDF QA、React 19、TypeScript、Tauri 2。

---

## 文件结构

- 修改 `src/App.css`：移除卡片边框，补偿 padding 与关闭按钮 inset。
- 修改 `src/app-shell.test.ts`：锁定无边框和几何补偿静态契约。
- 修改 `tools/pdf-export-qa.mjs`：浅暗场景验证 `0px/none` 边框和保持 `9px` 的实际按钮外缘距离。
- 修改 `docs/implementation-worklist.md`：记录无边框产品决策、双主题可视验证和新 EXE。
- 临时分支同步以上四个文件的正式提交，保留临时固定失败 API 与专属 QA。

### Task 1: 正式版无边框 RED→GREEN

**Files:**

- Modify: `src/app-shell.test.ts:76-142`
- Modify: `tools/pdf-export-qa.mjs:60-69,140-190,472-590`
- Modify: `src/App.css:1135-1212`

- [ ] **Step 1: 更新静态契约并确认 RED**

在现有 `PDF export notifications expose a compact close control` 测试中增加或调整以下断言：

```ts
assert.match(notificationRule, /\bborder:\s*0;/);
assert.match(notificationRule, /\bpadding:\s*12px 15px;/);
assert.match(closeButtonRule, /\btop:\s*9px;/);
assert.match(closeButtonRule, /\bright:\s*9px;/);

const errorNotificationRule = getCssRuleBody(
  '.reader-preview-notification[data-kind="error"]',
);
assert.match(errorNotificationRule, /\bcolor:\s*var\(--button-danger-bg\);/);
assert.doesNotMatch(errorNotificationRule, /border(?:-color)?:/);
```

Run:

```powershell
pnpm exec node --test --experimental-strip-types src/app-shell.test.ts
```

Expected: FAIL，原因是当前 CSS 仍为 `border: 1px`、`padding: 11px 14px` 和 `top/right: 8px`。

- [ ] **Step 2: 更新真实浏览器 QA 并确认 RED**

浅色默认错误场景补充边框与按钮实际 inset 数据：

```js
const style = notification ? getComputedStyle(notification) : null;
return {
  borderTopStyle: style?.borderTopStyle,
  borderTopWidth: style?.borderTopWidth,
  closeButtonTopInset: (closeButtonRect?.top ?? 0) - (notificationRect?.top ?? 0),
  closeButtonRightInset: (notificationRect?.right ?? 0) - (closeButtonRect?.right ?? 0),
};
```

断言：

```js
assert.equal(notification.result.value.borderTopWidth, "0px");
assert.equal(notification.result.value.borderTopStyle, "none");
assert.equal(notification.result.value.closeButtonTopInset, 9);
assert.equal(notification.result.value.closeButtonRightInset, 9);
```

暗色场景把旧 `1px solid` 契约替换为：

```js
assert.equal(darkNotification.result.value.borderTopWidth, "0px");
assert.equal(darkNotification.result.value.borderRightWidth, "0px");
assert.equal(darkNotification.result.value.borderTopStyle, "none");
assert.equal(darkNotification.result.value.borderRightStyle, "none");
assert.equal(darkNotification.result.value.closeButtonTop, "9px");
assert.equal(darkNotification.result.value.closeButtonRight, "9px");
assert.equal(darkNotification.result.value.closeButtonTopInset, 9);
assert.equal(darkNotification.result.value.closeButtonRightInset, 9);
```

删除 `borderColor !== transparent` 和 `8px + 1px border` 推导断言。保留危险色 token、背景、文字避让、ellipsis、timer、坐标点击和截图断言。

确认 1420 空闲，从正式 worktree 受控启动：

```powershell
pnpm dev -- --host 127.0.0.1 --port 1420 --strictPort
pnpm qa:pdf-export
```

Expected: FAIL，原因是当前卡片仍报告 `1px solid` 或关闭按钮 CSS 仍为 `8px`。必须用监听 PID 的 `Win32_Process.CommandLine` 证明 Vite 指向正式 worktree，结束后精确清理并确认 1420 空闲。

- [ ] **Step 3: 实现最小 CSS**

将通知 CSS 精确改为：

```css
.reader-preview-notification {
  border: 0;
  padding: 12px 15px;
}

.reader-preview-notification-close-button {
  top: 9px;
  right: 9px;
}

.reader-preview-notification[data-kind="error"] {
  color: var(--button-danger-bg);
}
```

上述代码只替换同一规则中的对应声明；不得删除或改动宽度、`14px` 圆角、背景、阴影、字体、pointer-events、动画、`28px` 文字避让或关闭按钮其他样式。

- [ ] **Step 4: 运行 GREEN 验证**

依次运行：

```powershell
pnpm exec node --test --experimental-strip-types src/app-shell.test.ts
pnpm qa:pdf-export
pnpm test
pnpm lint
pnpm format:check
git diff --check
```

Expected: 全部退出码 0；PDF QA 的浅暗通知都报告边框 `0px/none`，关闭按钮实际 top/right inset 仍为 `9px`。

- [ ] **Step 5: 提交正式实现**

```powershell
git add -- src/App.css src/app-shell.test.ts tools/pdf-export-qa.mjs
git commit -m "style: remove PDF notification borders"
```

### Task 2: 正式双主题验证、工作清单与 EXE

**Files:**

- Modify: `docs/implementation-worklist.md:603-612`

- [ ] **Step 1: 运行正式完整验证**

从受控正式 worktree Vite 运行：

```powershell
pnpm qa:pdf-export
pnpm qa:reader-ui
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm tauri build --no-bundle --ci
```

Expected: 所有命令退出码 0；只允许工作清单 13.8 已记录的 Vite oversized chunk 警告。QA 前后均验证 1420 服务归属和最终空闲。

- [ ] **Step 2: 人工检查新鲜浅暗截图**

用 `view_image` 原始分辨率检查：

```text
output/playwright/pdf-export-notification.png
output/playwright/pdf-export-notification-dark.png
```

两张图必须满足：卡片外框线不可见；关闭按钮和文字保持原位置；标题/详情不重叠；长文本省略号可见；宽 `324px`、圆角 `14px`、左/下 `24px` 和阴影未回归。

- [ ] **Step 3: 记录正式 EXE 与工作清单**

读取 `src-tauri/target/release/only-md-reader.exe` 的绝对路径、Length、LastWriteTime 和 SHA-256。更新第 16.12 项，明确：

```text
通知卡片 border: 0；padding 12px 15px；关闭按钮 top/right 9px；
移除错误边框色，其余几何与行为不变；浅暗固定 QA 和人工截图通过。
```

写入实际测试数、命令结果和 EXE 元数据，不得复用旧哈希。

- [ ] **Step 4: 提交验证记录**

```powershell
pnpm exec prettier --check docs/implementation-worklist.md
git diff --check
git add -- docs/implementation-worklist.md
git commit -m "docs: record borderless PDF notification validation"
```

### Task 3: 同步临时强制失败版并重建

**Files:**

- Modify via cherry-pick: `src/App.css`
- Modify via cherry-pick: `src/app-shell.test.ts`
- Modify via cherry-pick/manual reconciliation: `tools/pdf-export-qa.mjs`
- Modify via cherry-pick: `docs/implementation-worklist.md`

- [ ] **Step 1: 同步正式提交**

在 `E:\only_md_reader\.worktrees\pdf-export-error-preview` 逐个 cherry-pick Task 1、Task 2 的提交。若 `tools/pdf-export-qa.mjs` 冲突，只合入无边框断言，必须保留：

```js
const temporaryDefaultPdfError =
  "无法写入 PDF 文件，请确认文件未被其他程序占用或目标目录具有写入权限。";
```

以及临时默认错误自身的零 `3000ms` timer、真实坐标关闭、`printCalls=0` 断言。不得恢复正式 `createPdfExportApi()` 默认行为。

- [ ] **Step 2: 运行临时完整验证**

用命令行明确指向临时 worktree 的受控 Vite 运行：

```powershell
pnpm qa:pdf-export
pnpm qa:reader-ui
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm tauri build --no-bundle --ci
```

Expected: 全部退出码 0；临时默认场景仍固定失败、不写 PDF、可关闭、无 3000ms timer；浅暗通知无卡片边框且其他视觉不变。

- [ ] **Step 3: 检查临时截图和 EXE**

用 `view_image` 检查临时浅色固定错误截图与暗色截图，确认无外框线、无重叠、省略号与按钮位置正常。读取临时 EXE 的绝对路径、Length、LastWriteTime 和 SHA-256，确认时间晚于最终临时 HEAD 且 `bundle` 目录不存在。

- [ ] **Step 4: 最终隔离检查**

确认：

```text
正式 worktree clean，继续包含 createPdfExportApi，不含强制失败常量；
临时 worktree clean，继续包含固定失败 defaultPdfExportApi；
两个 worktree 的 App.css 无边框规则一致；
1420 空闲；临时分支仍禁止合并。
```
