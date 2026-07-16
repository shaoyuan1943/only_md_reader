import type { PdfExportReadiness } from "./export-readiness.ts";

export type PdfExportResult =
  | { kind: "printed" }
  | { kind: "resource-timeout" }
  | { kind: "print-failed"; message: string };

type StartPdfExportOptions = {
  awaitReadiness(this: void): Promise<PdfExportReadiness>;
  print(this: void): Promise<void> | void;
};

export async function startPdfExport({
  awaitReadiness,
  print,
}: StartPdfExportOptions): Promise<PdfExportResult> {
  const readiness = await awaitReadiness();

  if (readiness.kind === "timeout") {
    return { kind: "resource-timeout" };
  }

  try {
    await print();
    return { kind: "printed" };
  } catch (error) {
    return {
      kind: "print-failed",
      message: getPdfExportErrorMessage(error),
    };
  }
}

function getPdfExportErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
