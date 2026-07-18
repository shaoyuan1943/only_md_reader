const CSS_PIXELS_PER_INCH = 96;
const MILLIMETERS_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const PDF_PRINTABLE_WIDTH_MM = 178;
const PDF_BODY_FONT_SIZE_PT = 12;
const PDF_FORMULA_SCALE_PROPERTY = "--pdf-formula-scale";
const PDF_FORMULA_FIT_ATTRIBUTE = "data-pdf-local-fit";
const PDF_INLINE_CODE_WRAP_ATTRIBUTE = "data-pdf-wrap-overwide";
const PDF_GLOBAL_SCALING_ATTRIBUTE = "data-pdf-allow-global-scaling";

type FormulaScaleOptions = {
  currentBodyFontSize: number;
  formulaScrollWidth: number;
  printableWidth: number;
  printBodyFontSize: number;
};

type InlineCodeWrapOptions = {
  currentFontSize: number;
  inlineCodeWidth: number;
  printableWidth: number;
  printFontSize: number;
};

type PreparePdfLocalFitOptions = {
  root: ParentNode;
};

type PreparePdfPrintLayoutOptions = {
  root: HTMLElement;
  allowGlobalScaling: boolean;
};

type FormulaStyleSnapshot = {
  element: HTMLElement;
  fitAttribute: string | null;
  scaleProperty: string;
};

type InlineCodeAttributeSnapshot = {
  element: HTMLElement;
  wrapAttribute: string | null;
};

export function calculatePdfFormulaScale({
  currentBodyFontSize,
  formulaScrollWidth,
  printableWidth,
  printBodyFontSize,
}: FormulaScaleOptions): number {
  if (
    currentBodyFontSize <= 0 ||
    formulaScrollWidth <= 0 ||
    printableWidth <= 0 ||
    printBodyFontSize <= 0
  ) {
    return 1;
  }

  const expectedPrintWidth =
    formulaScrollWidth * (printBodyFontSize / currentBodyFontSize);

  return expectedPrintWidth > printableWidth ? printableWidth / expectedPrintWidth : 1;
}

export function shouldWrapPdfInlineCode({
  currentFontSize,
  inlineCodeWidth,
  printableWidth,
  printFontSize,
}: InlineCodeWrapOptions): boolean {
  if (
    currentFontSize <= 0 ||
    inlineCodeWidth <= 0 ||
    printableWidth <= 0 ||
    printFontSize <= 0
  ) {
    return false;
  }

  const expectedPrintWidth = inlineCodeWidth * (printFontSize / currentFontSize);
  return expectedPrintWidth > printableWidth;
}

export function preparePdfPrintLayout({
  root,
  allowGlobalScaling,
}: PreparePdfPrintLayoutOptions): () => void {
  const previousScalingMode = root.getAttribute(PDF_GLOBAL_SCALING_ATTRIBUTE);
  root.setAttribute(PDF_GLOBAL_SCALING_ATTRIBUTE, String(allowGlobalScaling));

  let restoreLocalFit: () => void = () => undefined;

  try {
    if (!allowGlobalScaling) {
      restoreLocalFit = preparePdfLocalFit({ root });
    }
  } catch (error) {
    restorePdfScalingMode(root, previousScalingMode);
    throw error;
  }

  return () => {
    restoreLocalFit();
    restorePdfScalingMode(root, previousScalingMode);
  };
}

export function preparePdfLocalFit({ root }: PreparePdfLocalFitOptions): () => void {
  const printableWidth =
    (PDF_PRINTABLE_WIDTH_MM / MILLIMETERS_PER_INCH) * CSS_PIXELS_PER_INCH;
  const printBodyFontSize =
    (PDF_BODY_FONT_SIZE_PT / POINTS_PER_INCH) * CSS_PIXELS_PER_INCH;
  const formulaSnapshots: FormulaStyleSnapshot[] = [];
  const inlineCodeSnapshots: InlineCodeAttributeSnapshot[] = [];

  for (const formula of root.querySelectorAll<HTMLElement>(".katex-display")) {
    const formulaContent = formula.querySelector<HTMLElement>(".katex-html");
    const currentBodyFontSize = Number.parseFloat(
      globalThis.getComputedStyle(formula).fontSize,
    );
    const formulaScrollWidth = formulaContent?.getBoundingClientRect().width ?? 0;
    const scale = calculatePdfFormulaScale({
      currentBodyFontSize,
      formulaScrollWidth,
      printableWidth,
      printBodyFontSize,
    });

    if (scale >= 1) {
      continue;
    }

    formulaSnapshots.push({
      element: formula,
      fitAttribute: formula.getAttribute(PDF_FORMULA_FIT_ATTRIBUTE),
      scaleProperty: formula.style.getPropertyValue(PDF_FORMULA_SCALE_PROPERTY),
    });
    formula.setAttribute(PDF_FORMULA_FIT_ATTRIBUTE, "true");
    formula.style.setProperty(PDF_FORMULA_SCALE_PROPERTY, scale.toFixed(6));
  }

  for (const inlineCode of root.querySelectorAll<HTMLElement>("code:not(pre code)")) {
    const previousWhiteSpace = inlineCode.style.whiteSpace;
    inlineCode.style.whiteSpace = "nowrap";
    const inlineCodeWidth = inlineCode.getBoundingClientRect().width;

    if (previousWhiteSpace === "") {
      inlineCode.style.removeProperty("white-space");
    } else {
      inlineCode.style.whiteSpace = previousWhiteSpace;
    }

    const currentFontSize = Number.parseFloat(
      globalThis.getComputedStyle(inlineCode).fontSize,
    );

    if (
      !shouldWrapPdfInlineCode({
        currentFontSize,
        inlineCodeWidth,
        printableWidth,
        printFontSize: printBodyFontSize,
      })
    ) {
      continue;
    }

    inlineCodeSnapshots.push({
      element: inlineCode,
      wrapAttribute: inlineCode.getAttribute(PDF_INLINE_CODE_WRAP_ATTRIBUTE),
    });
    inlineCode.setAttribute(PDF_INLINE_CODE_WRAP_ATTRIBUTE, "true");
  }

  return () => {
    for (const { element, fitAttribute, scaleProperty } of formulaSnapshots) {
      if (fitAttribute === null) {
        element.removeAttribute(PDF_FORMULA_FIT_ATTRIBUTE);
      } else {
        element.setAttribute(PDF_FORMULA_FIT_ATTRIBUTE, fitAttribute);
      }

      if (scaleProperty === "") {
        element.style.removeProperty(PDF_FORMULA_SCALE_PROPERTY);
      } else {
        element.style.setProperty(PDF_FORMULA_SCALE_PROPERTY, scaleProperty);
      }
    }

    for (const { element, wrapAttribute } of inlineCodeSnapshots) {
      if (wrapAttribute === null) {
        element.removeAttribute(PDF_INLINE_CODE_WRAP_ATTRIBUTE);
      } else {
        element.setAttribute(PDF_INLINE_CODE_WRAP_ATTRIBUTE, wrapAttribute);
      }
    }
  };
}

function restorePdfScalingMode(root: HTMLElement, previousValue: string | null) {
  if (previousValue === null) {
    root.removeAttribute(PDF_GLOBAL_SCALING_ATTRIBUTE);
  } else {
    root.setAttribute(PDF_GLOBAL_SCALING_ATTRIBUTE, previousValue);
  }
}
