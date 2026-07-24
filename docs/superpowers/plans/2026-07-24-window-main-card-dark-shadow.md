# Window Main Card Dark Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved centered neutral dark shadow to the open-file and settings window main cards without changing their light appearance or geometry.

**Architecture:** Add one global semantic CSS variable whose default resolves to the existing `--panel-shadow` and whose effective-dark value matches the reader card shadow. Make only `.open-file-window` and `.settings-window-frame` consume it, then verify each production component through repository-owned Chromium QA.

**Tech Stack:** CSS, React, TypeScript, Node test runner, Playwright Chromium, Vite, Tauri 2.

---

## File Structure

- Modify `src/app-shell.test.ts`: require the shared window-main-card shadow variable, exact dark override, and both consumers.
- Modify `src/App.css`: define the shared variable and dark override; switch only the two main card selectors.
- Modify `src/qa-workflows.test.ts`: require the new open-file UI QA entrypoint and fixture files.
- Modify `package.json`: expose `pnpm qa:open-file-ui`.
- Create `tools/open-file-ui-qa.html`: stable Vite entry page for the production open-file component.
- Create `tools/open-file-ui-qa.tsx`: mount `OpenFileWindow` with deterministic APIs and query-selected theme.
- Create `tools/open-file-ui-qa.mjs`: run light/dark Chromium checks and save screenshots.
- Modify `tools/settings-ui-qa.mjs`: assert light/dark settings frame shadow and unchanged geometry.
- Modify `docs/implementation-worklist.md`: append actual verification and EXE metadata under the open-file/settings UI records.
- Modify this plan: mark every completed step `[x]`.

### Task 1: Add the shared main-card shadow with TDD

**Files:**
- Modify: `src/app-shell.test.ts:519-560`
- Modify: `src/App.css:1-43`
- Modify: `src/App.css:1365-1398`

- [ ] **Step 1: Write the failing static regression test**

Add a focused test near the existing shared window inset tests:

```ts
void test("open file and settings main cards share the approved dark shadow", () => {
  assert.match(
    appCss,
    /html,\s*body,\s*#root\s*{[^}]*--window-main-card-shadow:\s*var\(--panel-shadow\);/s,
  );
  assert.match(
    appCss,
    /:root\[data-theme-effective-mode="dark"\]\s*{[^}]*--window-main-card-shadow:\s*0 0 24px -8px rgb\(0 0 0 \/ 52%\),\s*0 0 8px -2px rgb\(0 0 0 \/ 34%\);/s,
  );
  assert.match(
    appCss,
    /\.open-file-window\s*{[^}]*box-shadow:\s*var\(--window-main-card-shadow\);/s,
  );
  assert.match(
    appCss,
    /\.settings-window-frame\s*{[^}]*box-shadow:\s*var\(--window-main-card-shadow\);/s,
  );
});
```

Keep the existing inset, `22px` radius, surface background, and open-file border assertions.

- [ ] **Step 2: Run the unit suite and verify RED**

Run:

```powershell
pnpm test:unit
```

Expected: exactly the new regression test fails because both cards still consume `--panel-shadow` directly and the shared variable does not exist.

- [ ] **Step 3: Implement the minimal CSS**

Add the default variable inside the existing `html, body, #root` rule:

```css
--window-main-card-shadow: var(--panel-shadow);
```

Add the effective-dark root override immediately after that rule:

```css
:root[data-theme-effective-mode="dark"] {
  --window-main-card-shadow:
    0 0 24px -8px rgb(0 0 0 / 52%),
    0 0 8px -2px rgb(0 0 0 / 34%);
}
```

Change only these two existing declarations:

```css
.open-file-window {
  box-shadow: var(--window-main-card-shadow);
}

.settings-window-frame {
  box-shadow: var(--window-main-card-shadow);
}
```

Do not change either selector's border, radius, width, height, positioning, overflow, or background declarations.

- [ ] **Step 4: Run the unit suite and verify GREEN**

Run:

```powershell
pnpm test:unit
```

Expected: all tests pass.

- [ ] **Step 5: Commit the production change and static test**

```powershell
git add -- src/App.css src/app-shell.test.ts
git commit -m "style: align dark window card shadows"
```

### Task 2: Add a stable production open-file UI QA entrypoint

**Files:**
- Modify: `src/qa-workflows.test.ts:13-40`
- Modify: `package.json:9-20`
- Create: `tools/open-file-ui-qa.html`
- Create: `tools/open-file-ui-qa.tsx`
- Create: `tools/open-file-ui-qa.mjs`

- [ ] **Step 1: Require the QA command and fixture files**

Extend the QA workflow test:

```ts
assert.match(
  packageJson,
  /"qa:open-file-ui":\s*"node tools\/open-file-ui-qa\.mjs"/,
);
```

Add these paths to the committed visual QA fixture loop:

```ts
"../tools/open-file-ui-qa.html",
"../tools/open-file-ui-qa.tsx",
"../tools/open-file-ui-qa.mjs",
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
```

Expected: FAIL because the command and three files do not exist.

- [ ] **Step 3: Add the package command**

Add:

```json
"qa:open-file-ui": "node tools/open-file-ui-qa.mjs",
```

next to `qa:settings-ui`.

- [ ] **Step 4: Add the browser fixture**

Create `tools/open-file-ui-qa.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Only MD Reader Open File QA</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/tools/open-file-ui-qa.tsx"></script>
  </body>
</html>
```

Create `tools/open-file-ui-qa.tsx` with production CSS, theme application, and deterministic empty recent-file data:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "../src/App.css";
import { OpenFileWindow } from "../src/features/open-file/OpenFileWindow.tsx";
import type { OpenFileApi } from "../src/features/open-file/open-file-api.ts";
import { applyReaderSettingsToRoot } from "../src/features/settings/apply-reader-settings.ts";
import { defaultReaderSettings } from "../src/features/settings/reader-settings.ts";
import "../src/shared/fonts/maple-mono-nf-cn.css";
import "../src/shared/theme/theme.css";
import { validateThemeTokenBundle } from "../src/shared/theme/theme-schema.ts";
import warmPaper from "../src/shared/theme/themes/warm-paper.json";

const theme = validateThemeTokenBundle(warmPaper);
const themeMode =
  new URLSearchParams(window.location.search).get("theme") === "dark"
    ? "dark"
    : "light";

applyReaderSettingsToRoot(
  theme,
  { ...defaultReaderSettings, themeMode },
  document.documentElement,
  false,
);

const api: OpenFileApi = {
  chooseMarkdownFile: () => Promise.resolve(null),
  openMarkdownFile: () => Promise.reject(new Error("not used by visual QA")),
  listRecentFiles: () => Promise.resolve([]),
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OpenFileWindow api={api} />
  </React.StrictMode>,
);
```

- [ ] **Step 5: Add the Chromium runner**

Create `tools/open-file-ui-qa.mjs` following the repository's existing Playwright runtime location and Vite lifecycle. For both `light` and `dark` at the fixed native open-window viewport, collect:

```js
const metrics = await page.locator(".open-file-window").evaluate((card) => {
  const cardRect = card.getBoundingClientRect();
  const styles = getComputedStyle(card);
  const rootStyles = getComputedStyle(document.documentElement);

  const panelProbe = document.createElement("div");
  panelProbe.style.boxShadow = "var(--panel-shadow)";
  document.body.append(panelProbe);
  const computedPanelShadow = getComputedStyle(panelProbe).boxShadow;
  panelProbe.remove();

  return {
    effectiveTheme: document.documentElement.dataset.themeEffectiveMode,
    boxShadow: styles.boxShadow,
    panelShadow: computedPanelShadow,
    borderRadius: styles.borderRadius,
    borderWidth: styles.borderWidth,
    insetLeft: cardRect.left,
    insetTop: cardRect.top,
    insetRight: window.innerWidth - cardRect.right,
    insetBottom: window.innerHeight - cardRect.bottom,
  };
});
```

Assert:

```js
assert.equal(metrics.effectiveTheme, theme);
assert.equal(metrics.borderRadius, "22px");
assert.equal(metrics.borderWidth, "1px");
assert.equal(metrics.insetLeft, 18);
assert.equal(metrics.insetTop, 18);
assert.equal(metrics.insetRight, 18);
assert.equal(metrics.insetBottom, 18);

if (theme === "dark") {
  assert.match(metrics.boxShadow, /rgba?\(0, 0, 0, 0\.52\)/);
  assert.match(metrics.boxShadow, /rgba?\(0, 0, 0, 0\.34\)/);
  assert.match(metrics.boxShadow, /0px 0px 24px -8px/);
  assert.match(metrics.boxShadow, /0px 0px 8px -2px/);
} else {
  assert.equal(metrics.boxShadow, metrics.panelShadow);
}
```

Save:

```text
output/playwright/open-file-ui-light.png
output/playwright/open-file-ui-dark.png
```

The runner must start a strict local Vite server only when port `1420` is unavailable, close only the process it started, use `tools/verify/node_modules/playwright/index.js`, and print a JSON result containing both scenario metrics and screenshot paths.

- [ ] **Step 6: Run workflow and open-file QA**

Run:

```powershell
node --test --experimental-strip-types src/qa-workflows.test.ts
pnpm qa:open-file-ui
```

Expected: both commands pass; the light and dark screenshots are freshly generated.

- [ ] **Step 7: Inspect both screenshots**

Open the two files at original resolution and confirm:

- dark main card has an even neutral shadow on all four sides;
- light main card remains visually unchanged;
- the card border, inset, radius, settings button, open button, and internal layout did not move.

### Task 3: Extend settings runtime QA

**Files:**
- Modify: `tools/settings-ui-qa.mjs:430-630`

- [ ] **Step 1: Record light settings frame shadow and geometry**

Before the first settings screenshot, collect `.settings-window-frame` box shadow, computed `--panel-shadow`, radius, and four viewport insets. Assert light frame shadow equals the computed panel shadow, radius is `22px`, and every inset is `18px`.

- [ ] **Step 2: Record dark settings frame shadow**

After the existing dark theme button click, include:

```js
const frame = document.querySelector(".settings-window-frame");
const frameRect = frame.getBoundingClientRect();
const frameStyles = getComputedStyle(frame);

return {
  // retain existing dropdown fields
  frameBoxShadow: frameStyles.boxShadow,
  frameBorderRadius: frameStyles.borderRadius,
  frameInsets: {
    left: frameRect.left,
    top: frameRect.top,
    right: window.innerWidth - frameRect.right,
    bottom: window.innerHeight - frameRect.bottom,
  },
};
```

Assert:

```js
assert.match(darkDropdownCheck.frameBoxShadow, /rgba?\(0, 0, 0, 0\.52\)/);
assert.match(darkDropdownCheck.frameBoxShadow, /rgba?\(0, 0, 0, 0\.34\)/);
assert.match(darkDropdownCheck.frameBoxShadow, /0px 0px 24px -8px/);
assert.match(darkDropdownCheck.frameBoxShadow, /0px 0px 8px -2px/);
assert.equal(darkDropdownCheck.frameBorderRadius, "22px");
assert.deepEqual(darkDropdownCheck.frameInsets, {
  left: 18,
  top: 18,
  right: 18,
  bottom: 18,
});
```

Do not change existing dropdown shadow assertions; the dropdown remains outside this feature.

- [ ] **Step 3: Run settings QA**

Run:

```powershell
pnpm qa:settings-ui
```

Expected: existing settings interactions and dropdown checks still pass, plus the new light/dark main-frame checks.

- [ ] **Step 4: Inspect the dark settings screenshot**

Open the fresh dark screenshot at original resolution and confirm that only the main frame shadow changed; the dropdown retains its stronger independent dark shadow and all controls remain aligned.

- [ ] **Step 5: Commit both runtime QA additions**

```powershell
git add -- package.json src/qa-workflows.test.ts tools/open-file-ui-qa.html tools/open-file-ui-qa.tsx tools/open-file-ui-qa.mjs tools/settings-ui-qa.mjs
git commit -m "test: verify window main card shadows"
```

### Task 4: Complete regression verification, documentation, and EXE build

**Files:**
- Modify: `docs/implementation-worklist.md`
- Modify: `docs/superpowers/plans/2026-07-24-window-main-card-dark-shadow.md`

- [ ] **Step 1: Re-run all affected visual QA**

```powershell
pnpm qa:open-file-ui
pnpm qa:settings-ui
pnpm qa:reader-ui
```

Expected: all pass; reader geometry and shadow behavior remain unchanged.

- [ ] **Step 2: Run full frontend verification**

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
git diff --check
```

Expected: all commands exit with code `0`; Vite may emit only the already-recorded oversized chunk warning.

- [ ] **Step 3: Build a fresh test EXE**

```powershell
pnpm tauri build --no-bundle --ci
```

Expected: exit code `0`, a fresh `src-tauri/target/release/only-md-reader.exe`, and no MSI/NSIS package.

- [ ] **Step 4: Record exact results**

Append a verification record that includes:

- the shared default and dark shadow values;
- confirmation that only the two main cards changed;
- RED/GREEN results;
- open-file, settings, and reader QA results with computed values and geometry;
- original-resolution screenshot inspection;
- full command results and known non-blocking warning;
- exact EXE path, byte size, timestamp, and SHA-256.

- [ ] **Step 5: Mark the plan complete and commit**

Change every plan checkbox to `[x]`, then run:

```powershell
git add -- docs/implementation-worklist.md docs/superpowers/plans/2026-07-24-window-main-card-dark-shadow.md
git commit -m "docs: record window card shadow verification"
```
