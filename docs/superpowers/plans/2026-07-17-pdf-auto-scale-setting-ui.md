# PDF Auto-Scale Setting UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved PDF auto-scale switch to both themes in the settings design prototype and produce verified screenshots.

**Architecture:** Keep this first step isolated to `docs/ui/settings.html`. Reuse the prototype's existing Warm Paper tokens, embed the user-provided on/off SVG path geometry, expose state through an accessible button, and use the existing repository screenshot workflow for visual verification.

**Tech Stack:** Static HTML, CSS, inline SVG, vanilla JavaScript, repository Playwright screenshot QA.

---

### Task 1: Add the PDF auto-scale switch to the settings prototype

**Files:**
- Modify: `docs/ui/settings.html`
- Verify: `output/playwright/settings-desktop-1920x1080.png`
- Verify: `output/playwright/settings-small-980x700.png`

- [x] **Step 1: Confirm the approved setting is absent before implementation**

Run:

```powershell
rg -n "允许自动缩小 PDF 内容|pdf-auto-scale-toggle" docs/ui/settings.html
```

Expected: exit code `1` and no matches.

- [x] **Step 2: Add the switch styling**

Change the prototype window height to `560px`, then add a fourth-row treatment and an accessible icon button. The icon uses `currentColor` so the supplied geometry remains legible in both themes:

```css
.pdf-setting-copy {
  min-width: 0;
}

.pdf-setting-title {
  color: var(--control-text);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.35;
}

.pdf-setting-help {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 620;
  line-height: 1.45;
}

.pdf-auto-scale-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 14px;
  align-items: center;
}

.pdf-auto-scale-toggle {
  width: 48px;
  height: 48px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 14px;
  background: var(--control-bg);
  color: var(--text-secondary);
  box-shadow: inset 0 0 0 1px var(--control-border);
  padding: 0;
}

.pdf-auto-scale-toggle[aria-pressed="true"] {
  color: var(--accent);
  box-shadow:
    inset 0 0 0 1px var(--control-focus-border),
    0 0 0 3px var(--focus-ring);
}

.pdf-auto-scale-toggle svg {
  width: 42px;
  height: 42px;
  fill: currentColor;
}

.pdf-auto-scale-toggle .toggle-icon-on,
.pdf-auto-scale-toggle[aria-pressed="true"] .toggle-icon-off {
  display: none;
}

.pdf-auto-scale-toggle[aria-pressed="true"] .toggle-icon-on {
  display: block;
}
```

- [x] **Step 3: Add the setting row to both theme examples**

Add this row after the code-font row in both settings panels. Use `aria-pressed="false"` for the light example and `aria-pressed="true"` for the dark example so one screenshot demonstrates each supplied state:

```html
<div class="settings-row settings-row-pdf">
  <div class="settings-label">PDF 导出</div>
  <div class="pdf-auto-scale-control">
    <div class="pdf-setting-copy">
      <div class="pdf-setting-title">允许自动缩小 PDF 内容</div>
      <div class="pdf-setting-help">
        超宽内容可能触发整页缩小，导致不同文件字号显示不同
      </div>
    </div>
    <button
      class="pdf-auto-scale-toggle"
      type="button"
      aria-label="允许自动缩小 PDF 内容"
      aria-pressed="false"
    >
      <svg class="toggle-icon-off" viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M715 267c135.31 0 245 109.69 245 245S850.31 757 715 757H309C173.69 757 64 647.31 64 512s109.69-245 245-245h406z m0 40H309c-113.218 0-205 91.782-205 205 0 112.086 89.955 203.162 201.61 204.973L309 717h406c113.218 0 205-91.782 205-205 0-112.086-89.955-203.162-201.61-204.973L715 307z m-406 60c80.081 0 145 64.919 145 145s-64.919 145-145 145-145-64.919-145-145 64.919-145 145-145z m0 40c-57.99 0-105 47.01-105 105s47.01 105 105 105 105-47.01 105-105-47.01-105-105-105z"></path>
      </svg>
      <svg class="toggle-icon-on" viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M715 267c135.31 0 245 109.69 245 245S850.31 757 715 757H309C173.69 757 64 647.31 64 512s109.69-245 245-245h406z m0 40H309c-113.218 0-205 91.782-205 205 0 112.086 89.955 203.162 201.61 204.973L309 717h406c113.218 0 205-91.782 205-205 0-112.086-89.955-203.162-201.61-204.973L715 307z m0 60c80.081 0 145 64.919 145 145s-64.919 145-145 145-145-64.919-145-145 64.919-145 145-145z m0 40c-57.99 0-105 47.01-105 105s47.01 105 105 105 105-47.01 105-105-47.01-105-105-105z"></path>
      </svg>
    </button>
  </div>
</div>
```

- [x] **Step 4: Make the prototype switch interactive**

Extend the existing inline script without altering the custom-select behavior:

```js
document.querySelectorAll(".pdf-auto-scale-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const isPressed = toggle.getAttribute("aria-pressed") === "true";
    toggle.setAttribute("aria-pressed", String(!isPressed));
  });
});
```

- [x] **Step 5: Run formatting and screenshot QA**

Run:

```powershell
pnpm format:check
pnpm qa:screenshots
```

Expected: both commands exit `0`; screenshot QA reports `status: "passed"` and regenerates the two settings screenshots.

- [x] **Step 6: Inspect both settings screenshots**

Open:

```text
output/playwright/settings-desktop-1920x1080.png
output/playwright/settings-small-980x700.png
```

Expected: the desktop screenshot shows both Warm Paper themes with the new row unobstructed; the small screenshot remains readable without clipping or horizontal overflow. The light example shows the off icon and the dark example shows the on icon.

- [x] **Step 7: Verify exact SVG paths and scope**

Run:

```powershell
git diff --check
git diff -- docs/ui/settings.html
```

Expected: no whitespace errors; only the approved prototype structure, styling, icons, and interaction are changed in `docs/ui/settings.html`.
