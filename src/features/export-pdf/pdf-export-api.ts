import { invoke, isTauri } from "@tauri-apps/api/core";

export type PdfExportApi = {
  exportPdf(sourcePath: string): Promise<PdfExportOutput>;
};

export type PdfExportOutput = {
  outputPath: string;
};

type InvokeCommand = (
  command: string,
  args: Record<string, string>,
) => Promise<PdfExportOutput>;

type CreatePdfExportApiOptions = {
  invokeCommand?: InvokeCommand;
  isTauriRuntime?: () => boolean;
};

export function createPdfExportApi(
  options: CreatePdfExportApiOptions = {},
): PdfExportApi {
  const invokeCommand =
    options.invokeCommand ??
    ((command, args) => invoke<PdfExportOutput>(command, args));
  const isTauriRuntime = options.isTauriRuntime ?? (() => isTauri());

  return {
    exportPdf(sourcePath) {
      if (!isTauriRuntime()) {
        return Promise.reject(new Error("PDF 导出只能在桌面应用中使用。"));
      }

      return invokeCommand("export_pdf", { sourcePath });
    },
  };
}
