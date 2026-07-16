import { invoke, isTauri } from "@tauri-apps/api/core";

export type PdfExportApi = {
  openPrintDialog(): Promise<void>;
};

type InvokeCommand = (command: string) => Promise<void>;

type CreatePdfExportApiOptions = {
  invokeCommand?: InvokeCommand;
  isTauriRuntime?: () => boolean;
  print?: () => void;
};

export function createPdfExportApi(
  options: CreatePdfExportApiOptions = {},
): PdfExportApi {
  const invokeCommand = options.invokeCommand ?? ((command) => invoke<void>(command));
  const isTauriRuntime = options.isTauriRuntime ?? (() => isTauri());
  const print = options.print ?? (() => window.print());

  return {
    openPrintDialog() {
      if (isTauriRuntime()) {
        return invokeCommand("open_pdf_print_dialog");
      }

      print();
      return Promise.resolve();
    },
  };
}
