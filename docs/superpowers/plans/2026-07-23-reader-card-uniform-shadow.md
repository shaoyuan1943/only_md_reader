# Reader Card Uniform Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the outline and reading cards use the same directionless shadow on all four sides without changing card or document geometry.

**Architecture:** Keep the existing reader grid and card DOM unchanged. Replace the two directional shadow variables with one shared centered two-layer shadow, then prove the computed shadows and existing geometry in static tests and the repository-owned Chromium QA.

**Tech Stack:** CSS, TypeScript/Node test runner, Chromium CDP reader UI QA, Vite, Tauri 2.

---

## File Structure

- Modify `src/App.css`: define one shared reader card shadow and apply it to both cards without changing layout declarations.
- Modify `src/app-shell.test.ts`: statically reject separate or directional card shadows and lock unchanged layout values.
- Modify `tools/reader-ui-qa.mjs`: cover light/dark desktop rendering, compare computed card shadows, and assert unchanged card/document geometry.
- Modify `docs/implementation-worklist.md`: append the completed implementation and actual verification results to item 6.1.

### Task 1: Add a failing static regression test

**Files:**
- Modify: `src/app-shell.test.ts:789-810`
- Modify: `src/app-shell.test.ts:1015-1024`

- [ ] **Step 1: Replace the old two-shadow assertions**

Update the existing reader-card tests to require one shared variable and one shared selector rule:

```ts
assert.match(
  appCss,
  /\.reader-preview-shell\s*{[^}]*--reader-card-shadow:\s*0 0 24px -8px[^;]*,\s*0 0 8px -2px[^;]*;/s,
);
assert.doesNotMatch(appCss, /--reader-outline-card-shadow:/);
assert.match(
  appCss,
  /\.reader-preview-outline-card,\s*\.reader-preview-reading-card\s*{[^}]*\bbox-shadow:\s*var\(--reader-card-shadow\);/s,
);
```

Keep the existing assertions that lock:

```ts
--reader-outline-width: 336px;
--reader-card-gap: 30px;
padding: 56px 96px 112px;
max-width: min(100%, var(--reader-content-max-width, 860px));
```

- [ ] **Step 2: Run the static test and verify it fails**

Run:

```powershell
pnpm test:unit
```

Expected: FAIL because `src/App.css` still defines `--reader-outline-card-shadow`, uses positive vertical offsets, and applies different variables to the two cards.

### Task 2: Implement the shared directionless shadow

**Files:**
- Modify: `src/App.css:269-325`
- Modify: `src/App.css:412-414`

- [ ] **Step 1: Replace the shadow variables**

Replace the two current variables with:

```css
--reader-card-shadow:
  0 0 24px -8px color-mix(in srgb, var(--accent) 18%, transparent),
  0 0 8px -2px color-mix(in srgb, var(--accent) 10%, transparent);
```

Do not change `--reader-outline-width`, `--reader-card-gap`, `--window-card-inset`, or `.reader-preview-scroll` padding.

- [ ] **Step 2: Apply the same shadow in the shared card rule**

Use:

```css
.reader-preview-outline-card,
.reader-preview-reading-card {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 22px;
  background: var(--surface-bg);
  box-shadow: var(--reader-card-shadow);
  isolation: isolate;
}
```

Remove the individual `box-shadow` declarations from `.reader-preview-outline-card` and `.reader-preview-reading-card`. Do not change any other declaration in those rules.

- [ ] **Step 3: Run the static test and verify it passes**

Run:

```powershell
pnpm test:unit
```

Expected: all unit tests PASS.

- [ ] **Step 4: Commit the CSS and static test**

```powershell
git add -- src/App.css src/app-shell.test.ts
git commit -m "style: balance reader card shadows"
```

### Task 3: Add runtime shadow and geometry QA

**Files:**
- Modify: `tools/reader-ui-qa.mjs:20-23`
- Modify: `tools/reader-ui-qa.mjs:67-75`
- Modify: `tools/reader-ui-qa.mjs:92-111`
- Modify: `tools/reader-ui-qa.mjs:1248-1482`

- [ ] **Step 1: Add a dark desktop QA scenario**

Replace the viewport list with:

```js
const viewports = [
  {
    name: "desktop-1920-light",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    theme: "light",
  },
  {
    name: "desktop-1920-dark",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    theme: "dark",
  },
  {
    name: "min-reader-hidpi",
    width: 1320,
    height: 560,
    deviceScaleFactor: 2,
    theme: "light",
  },
];
```

Navigate with:

```js
const viewportUrl = `${qaUrl}?theme=${viewport.theme}`;
await cdp.send("Page.navigate", { url: viewportUrl });
```

- [ ] **Step 2: Collect computed card shadows and document geometry**

Inside `collectLayout`, obtain:

```js
const outlineStyle = outline ? getComputedStyle(outline) : null;
const readingStyle = reading ? getComputedStyle(reading) : null;
const readerDocument = document.querySelector(".reader-preview-document");
const readerDocumentRect = readerDocument?.getBoundingClientRect();
```

Return:

```js
outlineCardShadow: outlineStyle?.boxShadow ?? "",
readingCardShadow: readingStyle?.boxShadow ?? "",
readerDocumentWidth: Math.round(readerDocumentRect?.width ?? 0),
```

- [ ] **Step 3: Assert identical directionless shadows**

After `initialLayout` is collected, add:

```js
assert.equal(
  initialLayout.outlineCardShadow,
  initialLayout.readingCardShadow,
  "outline and reading cards must use the same computed shadow",
);
assert.match(initialLayout.readingCardShadow, /0px 0px 24px -8px/);
assert.match(initialLayout.readingCardShadow, /0px 0px 8px -2px/);
```

- [ ] **Step 4: Assert the existing geometry remains unchanged**

Add:

```js
assert.equal(Math.round(initialLayout.outlineCardWidth), 336);
assert.equal(initialLayout.cardGap, 30);
assert.equal(initialLayout.readingCardLeft, 384);
assert.equal(
  Math.round(initialLayout.readingCardWidth),
  viewport.width - 402,
);
assert.equal(
  initialLayout.readerDocumentWidth,
  Math.min(860, viewport.width - 594),
);
```

These formulas preserve the existing `18px + 336px + 30px` left geometry and the reading card's `18px` right inset plus `96px` internal padding on both sides.

- [ ] **Step 5: Run reader UI QA**

Run:

```powershell
pnpm qa:reader-ui
```

Expected:

- PASS for `desktop-1920-light`, `desktop-1920-dark`, and `min-reader-hidpi`.
- Screenshots written under `output/playwright/`.
- Computed shadows are equal in both themes.
- Card and document geometry assertions pass unchanged.

- [ ] **Step 6: Inspect the generated screenshots**

Open:

```text
output/playwright/reader-ui-desktop-1920-light.png
output/playwright/reader-ui-desktop-1920-dark.png
output/playwright/reader-ui-min-reader-hidpi.png
```

Confirm that each card has visible shadow on all four sides and the middle gap is not visibly darker than the outer sides.

### Task 4: Run the full verification set and record results

**Files:**
- Modify: `docs/implementation-worklist.md:173-187`

- [ ] **Step 1: Run frontend verification**

Run:

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Expected: every command exits with code 0.

- [ ] **Step 2: Build the fresh test executable**

Run:

```powershell
pnpm tauri build --no-bundle --ci
```

Expected: exit code 0 and a fresh `src-tauri/target/release/only-md-reader.exe`.

- [ ] **Step 3: Update the worklist with only actual results**

Append one verification record under item 6.1 containing:

- the shared centered shadow implementation;
- unchanged `336px` outline width, `30px` gap, `18px` inset, `96px` reading padding, and `860px` default content width;
- the exact commands that passed;
- light/dark/minimum-window screenshot inspection results;
- any validation command that could not run and its concrete cause.

- [ ] **Step 4: Commit QA and documentation**

```powershell
git add -- tools/reader-ui-qa.mjs docs/implementation-worklist.md docs/superpowers/plans/2026-07-23-reader-card-uniform-shadow.md
git commit -m "test: verify uniform reader card shadows"
```

