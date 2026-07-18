import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculatePdfFormulaScale,
  preparePdfPrintLayout,
  shouldWrapPdfInlineCode,
} from "./pdf-local-fit.ts";

const pdfExportCss = readFileSync(new URL("./pdf-export.css", import.meta.url), "utf8");

void test("does not shrink a formula that fits the printable width", () => {
  assert.equal(
    calculatePdfFormulaScale({
      currentBodyFontSize: 16,
      formulaScrollWidth: 650,
      printableWidth: 673,
      printBodyFontSize: 16,
    }),
    1,
  );
});

void test("scales only an overwide formula to the printable width", () => {
  const scale = calculatePdfFormulaScale({
    currentBodyFontSize: 16,
    formulaScrollWidth: 900,
    printableWidth: 673,
    printBodyFontSize: 16,
  });

  assert.ok(Math.abs(scale - 0.747777778) < 0.000001);
});

void test("keeps a normal inline code token intact when it fits on an A4 line", () => {
  assert.equal(
    shouldWrapPdfInlineCode({
      currentFontSize: 16,
      inlineCodeWidth: 420,
      printableWidth: 673,
      printFontSize: 16,
    }),
    false,
  );
});

void test("allows wrapping only when one inline code token exceeds the A4 line", () => {
  assert.equal(
    shouldWrapPdfInlineCode({
      currentFontSize: 16,
      inlineCodeWidth: 900,
      printableWidth: 673,
      printFontSize: 16,
    }),
    true,
  );
});

void test("fixed-size export marks the layout for local fitting and restores it", () => {
  const root = new FakePrintRoot();

  const restore = preparePdfPrintLayout({
    root: root as unknown as HTMLElement,
    allowGlobalScaling: false,
  });

  assert.equal(root.getAttribute("data-pdf-allow-global-scaling"), "false");
  restore();
  assert.equal(root.getAttribute("data-pdf-allow-global-scaling"), null);
});

void test("automatic scaling export skips local fitting and restores its mode marker", () => {
  const root = new FakePrintRoot();
  root.setAttribute("data-pdf-allow-global-scaling", "previous");

  const restore = preparePdfPrintLayout({
    root: root as unknown as HTMLElement,
    allowGlobalScaling: true,
  });

  assert.equal(root.getAttribute("data-pdf-allow-global-scaling"), "true");
  restore();
  assert.equal(root.getAttribute("data-pdf-allow-global-scaling"), "previous");
});

void test("print CSS starts both PDF modes at 12pt and relaxes only overwide blocks", () => {
  assert.match(pdfExportCss, /\.markdown-rendered-document\s*{[^}]*font-size:\s*12pt/s);
  assert.match(pdfExportCss, /data-pdf-allow-global-scaling="true"/);
  assert.match(
    pdfExportCss,
    /data-pdf-allow-global-scaling="true"[\s\S]*table\s*{[^}]*font-size:\s*inherit\s*!important/s,
  );
  assert.doesNotMatch(
    pdfExportCss,
    /data-pdf-allow-global-scaling="true"[^}]*\.markdown-rendered-document\s*{[^}]*font-size/s,
  );
});

class FakePrintRoot {
  readonly attributes = new Map<string, string>();

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  querySelectorAll() {
    return [];
  }
}
