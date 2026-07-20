# PDF Notification Close Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每条 PDF 导出通知右上角增加使用用户指定 SVG 的关闭按钮，让错误通知可主动关闭，同时保留成功通知 3 秒自动关闭。

**Architecture:** 复用现有 `closeReaderNotification()` 状态转换和退出动画，只从 `ReaderNotificationStack` 向上回调通知 ID。手动关闭时由 `ReaderPreviewWindow` 清理对应成功通知计时器；CSS 负责按钮绝对定位和文本避让，现有通知尺寸、栈定位和省略号规则保持不变。

**Tech Stack:** React 19、TypeScript、CSS、Node test、Chromium/CDP PDF QA、Tauri 2。

---

## 文件结构

- 修改 `src/app-shell.test.ts`：静态契约测试，锁定关闭按钮语义、SVG 路径、回调和关键 CSS。
- 修改 `src/features/reader/ReaderPreviewWindow.tsx`：渲染关闭按钮、连接关闭回调并清理成功通知计时器。
- 修改 `src/App.css`：定位 `24px` 按钮、渲染 `16px` SVG、提供 hover/focus-visible 状态并给两行文本预留空间。
- 修改 `tools/pdf-export-qa.mjs`：在真实浏览器 DOM 中验证成功/失败按钮，并点击关闭验证退出后的移除。
- 修改 `docs/implementation-worklist.md`：更新 16.12 的旧约束并记录最终验证。
- 同步以上生产代码、测试和工作清单变更到 `pdf-export-error-preview` 临时分支；保留临时默认 PDF API。

### Task 1: 先建立关闭按钮失败契约

**Files:**

- Modify: `src/app-shell.test.ts`
- Modify: `tools/pdf-export-qa.mjs:113-253`

- [ ] **Step 1: 写入失败的静态契约测试**

在 `src/app-shell.test.ts` 增加测试，要求组件包含可访问按钮、用户指定的两条 SVG path、`onClose(notification.id)`，并要求 CSS 包含 `24px` 点击区、`16px` SVG 和文本右侧避让：

```ts
void test("PDF export notifications expose the requested close button", () => {
  assert.match(readerWindowTsx, /aria-label="关闭通知"/);
  assert.match(readerWindowTsx, /onClick=\{\(\) => onClose\(notification\.id\)\}/);
  assert.match(readerWindowTsx, /M859\.00288 178\.741248c-188\.43648/);
  assert.match(readerWindowTsx, /M571\.764736 518\.862848l154\.630144/);
  assert.match(
    appCss,
    /\.reader-preview-notification-close\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-notification-close svg\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s,
  );
  assert.match(
    appCss,
    /\.reader-preview-notification-title,[\s\S]*padding-right:\s*28px;/,
  );
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec node --test --experimental-strip-types src/app-shell.test.ts`

Expected: FAIL，原因是 `aria-label="关闭通知"` 或 `.reader-preview-notification-close` 尚不存在，不得是语法或路径错误。

- [ ] **Step 3: 写入真实浏览器交互断言**

在默认错误场景读取并断言关闭按钮的 `aria-label`、`24×24` 点击区与 `16×16` SVG。在长错误场景完成省略号断言后点击按钮并等待通知移除：

```js
const errorCloseButton = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const button = document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-close');
    const svg = button?.querySelector('svg');
    const buttonRect = button?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    return {
      ariaLabel: button?.getAttribute('aria-label'),
      buttonHeight: Math.round(buttonRect?.height ?? 0),
      buttonWidth: Math.round(buttonRect?.width ?? 0),
      svgHeight: Math.round(svgRect?.height ?? 0),
      svgWidth: Math.round(svgRect?.width ?? 0),
    };
  })()`,
  returnByValue: true,
});
assert.deepEqual(errorCloseButton.result.value, {
  ariaLabel: "关闭通知",
  buttonHeight: 24,
  buttonWidth: 24,
  svgHeight: 16,
  svgWidth: 16,
});
await cdp.send("Runtime.evaluate", {
  expression: `document.querySelector('.reader-preview-notification[data-kind="error"] .reader-preview-notification-close')?.click()`,
});
await waitForExpression(
  cdp,
  `document.querySelector('.reader-preview-notification[data-kind="error"]') === null`,
);
```

成功场景在截图和省略号断言完成后点击成功通知按钮，并等待通知在 3 秒之前从 DOM 移除。

- [ ] **Step 4: 在受控 Vite 服务上确认交互 QA 也为 RED**

确认 `1420` 空闲；从当前 worktree 启动 `pnpm dev -- --host 127.0.0.1 --port 1420 --strictPort`，用监听 PID 的 `Win32_Process.CommandLine` 证明服务指向当前 worktree。

Run: `pnpm qa:pdf-export`

Expected: FAIL，原因是关闭按钮不存在，而不是 Vite 服务、CDP 或既有 PDF 导出场景错误。结束后精确停止受控 Vite 进程并确认 1420 空闲。

### Task 2: 实现关闭按钮组件与样式

**Files:**

- Modify: `src/features/reader/ReaderPreviewWindow.tsx:163-165,868-895,1184,1203-1232`
- Modify: `src/App.css:1135-1182`
- Test: `src/app-shell.test.ts`
- Test: `tools/pdf-export-qa.mjs`

- [ ] **Step 1: 实现最小 React 连接**

让关闭函数同步清理成功计时器，再触发现有状态转换：

```tsx
const closeReaderNotification = useCallback((id: string) => {
  const successTimer = readerNotificationSuccessTimersRef.current.get(id);
  if (successTimer !== undefined) {
    window.clearTimeout(successTimer);
    readerNotificationSuccessTimersRef.current.delete(id);
  }
  setReaderNotifications((current) => closeReaderNotificationState(current, id));
}, []);
```

把回调传给通知栈：

```tsx
<ReaderNotificationStack
  notifications={readerNotifications}
  onClose={closeReaderNotification}
/>
```

在每条通知右上角加入原生按钮；SVG 只保留语义所需属性和用户提供的 path 数据：

```tsx
<button
  aria-label="关闭通知"
  className="reader-preview-notification-close"
  onClick={() => onClose(notification.id)}
  title="关闭通知"
  type="button"
>
  <svg aria-hidden="true" viewBox="0 0 1024 1024">
    <path d="M859.00288 178.741248c-188.43648-188.471296-495.06304-188.471296-683.49952 0-188.469248 188.432384-188.469248 495.060992 0 683.493376 188.43648 188.473344 495.06304 188.473344 683.49952 0C1047.472128 673.80224 1047.472128 367.173632 859.00288 178.741248zM809.965568 813.19936c-161.41312 161.409024-424.04864 161.376256-585.424896 0-161.409024-161.41312-161.409024-424.011776 0-585.424896 161.376256-161.376256 424.011776-161.409024 585.424896 0C971.341824 389.15072 971.341824 651.8272 809.965568 813.19936z" />
    <path d="M571.764736 518.862848l154.630144-154.871808c13.508608-13.529088 13.508608-35.463168 0-48.992256-13.508608-13.529088-35.407872-13.529088-48.91648 0l-154.628096 154.86976L362.14784 308.92032c-13.45536-13.473792-35.270656-13.473792-48.726016 0-13.453312 13.477888-13.453312 35.325952 0 48.80384l160.698368 160.950272-168.409088 168.67328c-13.510656 13.529088-13.510656 35.465216 0 48.994304 13.508608 13.529088 35.407872 13.529088 48.914432 0l168.411136-168.675328 160.700416 160.950272c13.45536 13.473792 35.270656 13.473792 48.726016 0 13.45536-13.477888 13.45536-35.325952 0-48.801792L571.764736 518.862848z" />
  </svg>
</button>
```

- [ ] **Step 2: 实现最小 CSS**

保持卡片现有尺寸，增加相对定位、文本避让和按钮状态：

```css
.reader-preview-notification {
  position: relative;
}

.reader-preview-notification-title,
.reader-preview-notification-detail {
  padding-right: 28px;
}

.reader-preview-notification-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 4px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  place-items: center;
}

.reader-preview-notification-close svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
```

为 hover 和 `:focus-visible` 使用现有 design token / `color-mix()`；不得硬编码新的主题色。

- [ ] **Step 3: 运行静态测试并确认 GREEN**

Run: `pnpm exec node --test --experimental-strip-types src/app-shell.test.ts`

Expected: PASS，且 TypeScript/JSX 无错误。

- [ ] **Step 4: 在受控 Vite 服务上确认交互 QA 为 GREEN**

重新按 Task 1 的 PID/命令行取证步骤启动当前 worktree Vite，运行：`pnpm qa:pdf-export`。

Expected: PASS；关闭按钮几何、两类通知点击移除、长文本省略号和打印态隐藏全部通过。结束后精确停止受控 Vite 进程并确认 1420 空闲。

- [ ] **Step 5: 提交测试和组件改动**

```powershell
git add -- src/app-shell.test.ts tools/pdf-export-qa.mjs src/features/reader/ReaderPreviewWindow.tsx src/App.css
git commit -m "feat: add PDF notification close buttons"
```

### Task 3: 正式验证、工作清单与测试 EXE

**Files:**

- Modify: `docs/implementation-worklist.md:603-609`

- [ ] **Step 1: 更新工作清单旧约束**

把“错误通知不提供重试或操作按钮”改为“错误通知不提供重试按钮；所有通知右上角提供关闭按钮”，并在追加验证记录中写明 SVG、按钮几何、成功计时器清理、可视 QA 结果和 EXE 信息。

- [ ] **Step 2: 运行完整验证**

依次运行：

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm qa:pdf-export
pnpm qa:reader-ui
pnpm build
pnpm tauri build --no-bundle --ci
```

Expected: 所有命令退出码为 0；仅允许已记录的 Vite 大 chunk 非阻塞警告。记录测试总数、EXE 绝对路径、大小、LastWriteTime 和 SHA-256。

- [ ] **Step 3: 人工核对 QA 截图**

打开 `output/playwright/pdf-export-notification.png`，确认关闭图标位于右上角、未压住标题/详情、长文件名仍显示省略号。使用 QA 参数或截图入口分别核对明亮/暗色主题；如固定 QA 入口缺少暗色通知覆盖，先扩充仓库 QA 再验收。

- [ ] **Step 4: 写入最终验证记录并提交**

```powershell
git add -- docs/implementation-worklist.md
git commit -m "docs: record PDF notification close validation"
```

### Task 4: 同步临时强制失败预览版

**Files:**

- Modify via cherry-pick: `src/app-shell.test.ts`
- Modify via cherry-pick: `src/features/reader/ReaderPreviewWindow.tsx`
- Modify via cherry-pick: `src/App.css`
- Modify via cherry-pick/manual reconciliation: `tools/pdf-export-qa.mjs`
- Modify via cherry-pick: `docs/implementation-worklist.md`

- [ ] **Step 1: 同步正式提交**

在 `E:\only_md_reader\.worktrees\pdf-export-error-preview` 中逐个 cherry-pick Task 1 至 Task 3 的正式提交。`tools/pdf-export-qa.mjs` 如与临时固定错误原因冲突，只保留临时默认错误文案，合入关闭按钮相关断言；不得恢复正式 `createPdfExportApi()` 默认行为。

- [ ] **Step 2: 验证临时行为与关闭按钮**

用指向临时 worktree 的受控 Vite 运行：

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm qa:pdf-export
pnpm qa:reader-ui
pnpm build
pnpm tauri build --no-bundle --ci
```

Expected: 全部退出码 0；临时 EXE 点击导出仍不写 PDF，显示固定错误通知，点击右上角按钮后通知经退出动画消失。

- [ ] **Step 3: 记录临时 EXE**

输出临时 EXE 的绝对路径、大小、LastWriteTime 与 SHA-256；确认正式和临时 worktree 均干净，正式分支不包含强制失败常量，临时分支仍明确禁止合并。
