import type { PdfExportReadiness } from "./export-readiness.ts";

export type PdfExportResult =
  | { kind: "exported"; outputPath: string }
  | { kind: "resource-timeout" }
  | { kind: "export-failed"; message: string };

type StartPdfExportOptions = {
  awaitReadiness(this: void): Promise<PdfExportReadiness>;
  exportPdf(this: void): Promise<{ outputPath: string }>;
};

export async function startPdfExport({
  awaitReadiness,
  exportPdf,
}: StartPdfExportOptions): Promise<PdfExportResult> {
  const readiness = await awaitReadiness();

  if (readiness.kind === "timeout") {
    return { kind: "resource-timeout" };
  }

  try {
    const output = await exportPdf();
    return { kind: "exported", outputPath: output.outputPath };
  } catch (error) {
    return {
      kind: "export-failed",
      message: getPdfExportErrorMessage(error),
    };
  }
}

function getPdfExportErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
