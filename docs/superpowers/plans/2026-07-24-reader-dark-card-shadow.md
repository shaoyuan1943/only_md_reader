# Reader Dark Card Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark reader cards' warm glow with a centered neutral shadow while preserving the approved light shadow and every layout dimension.

**Architecture:** Keep the existing shared `--reader-card-shadow` variable and card selector. Add one root effective-theme override for dark mode, then make the repository-owned static and Chromium QA distinguish the light and dark computed shadows without changing geometry assertions.

**Tech Stack:** CSS, TypeScript/Node test runner, Chromium CDP reader UI QA, Vite, Tauri 2.

---

## File Structure

- Modify `src/app-shell.test.ts`: require a dark effective-theme override with neutral black shadow layers.
- Modify `src/App.css`: add the dark-only override; do not change the default light shadow or layout declarations.
- Modify `tools/reader-ui-qa.mjs`: assert the expected computed shadow color family for each theme.
- Modify `docs/implementation-worklist.md`: append actual verification and EXE metadata under item 6.1.

### Task 1: Add the failing dark-shadow regression test

**Files:**
- Modify: `src/app-shell.test.ts:1002-1020`

- [ ] **Step 1: Require the dark effective-theme override**

Add this assertion after the existing default shared-shadow assertion:

```ts
assert.match(
  appCss,
  /:root\[data-theme-effective-mode="dark"\]\s+\.reader-preview-shell\s*{[^}]*--reader-card-shadow:\s*0 0 24px -8px rgb\(0 0 0 \/ 52%\),\s*0 0 8px -2px rgb\(0 0 0 \/ 34%\);/s,
);
```

Keep the existing assertions for the default Accent shadow, the shared card selector, and unchanged geometry.

- [ ] **Step 2: Run the unit suite and verify RED**

Run:

```powershell
pnpm test:unit
```

Expected: FAIL because `src/App.css` does not yet define a dark effective-theme override.

### Task 2: Implement the minimal dark-only override

**Files:**
- Modify: `src/App.css:273-277`

- [ ] **Step 1: Add the dark theme variable override**

Immediately after `.reader-preview-shell`, add:

```css
:root[data-theme-effective-mode="dark"] .reader-preview-shell {
  --reader-card-shadow:
    0 0 24px -8px rgb(0 0 0 / 52%),
    0 0 8px -2px rgb(0 0 0 / 34%);
}
```

Do not change the default Accent shadow, card selector, `--reader-outline-width`, `--reader-card-gap`, `--window-card-inset`, reading padding, or content width.

- [ ] **Step 2: Run the unit suite and verify GREEN**

Run:

```powershell
pnpm test:unit
```

Expected: 193 tests pass.

- [ ] **Step 3: Commit the production change and static test**

```powershell
git add -- src/App.css src/app-shell.test.ts
git commit -m "style: sharpen dark reader card shadows"
```

### Task 3: Strengthen runtime theme QA

**Files:**
- Modify: `tools/reader-ui-qa.mjs:132-146`

- [ ] **Step 1: Assert theme-specific computed shadow colors**

After confirming the two cards have identical computed shadows, add:

```js
if (viewport.theme === "dark") {
  assert.match(initialLayout.readingCardShadow, /rgba?\(0, 0, 0/);
  assert.doesNotMatch(initialLayout.readingCardShadow, /194, 138, 99/);
} else {
  assert.doesNotMatch(initialLayout.readingCardShadow, /rgba?\(0, 0, 0/);
}
```

Keep the existing zero-offset blur/spread and geometry assertions.

- [ ] **Step 2: Run reader UI QA**

Run:

```powershell
pnpm qa:reader-ui
```

Expected: PASS for `desktop-1920-light`, `desktop-1920-dark`, and `min-reader-hidpi`, with unchanged card/document geometry.

- [ ] **Step 3: Inspect the fresh screenshots**

Open:

```text
output/playwright/reader-ui-desktop-1920-light.png
output/playwright/reader-ui-desktop-1920-dark.png
output/playwright/reader-ui-min-reader-hidpi.png
```

Confirm that dark card edges no longer show a warm light band, both cards remain evenly shadowed on four sides, and light mode is visually unchanged.

### Task 4: Verify, document, and build the test EXE

**Files:**
- Modify: `docs/implementation-worklist.md:173-190`
- Modify: `docs/superpowers/plans/2026-07-24-reader-dark-card-shadow.md`

- [ ] **Step 1: Run the full frontend verification**

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
git diff --check
```

Expected: all commands exit with code 0; Vite may emit only the already-recorded oversized dynamic chunk warning.

- [ ] **Step 2: Build the fresh test executable**

```powershell
pnpm tauri build --no-bundle --ci
```

Expected: exit code 0 and a fresh `src-tauri/target/release/only-md-reader.exe`; no MSI/NSIS package.

- [ ] **Step 3: Record only actual results**

Append one item 6.1 verification record containing:

- the dark-only neutral shadow values;
- proof that light shadow and all geometry stayed unchanged;
- RED/GREEN results;
- runtime QA and screenshot inspection results;
- full command results;
- exact EXE path, size, timestamp, and SHA-256.

- [ ] **Step 4: Mark this plan complete and commit**

Change every plan checkbox to `[x]`, then run:

```powershell
git add -- tools/reader-ui-qa.mjs docs/implementation-worklist.md docs/superpowers/plans/2026-07-24-reader-dark-card-shadow.md
git commit -m "test: verify dark reader card shadows"
```
