const runtimeWindow = window as Window & {
  __ONLY_MD_READER_BOOT_THEME__?: "light" | "dark";
  __TAURI_INTERNALS__?: unknown;
};

const bootTheme = runtimeWindow.__ONLY_MD_READER_BOOT_THEME__;

if (bootTheme === "light" || bootTheme === "dark") {
  document.documentElement.dataset.bootTheme = bootTheme;
}
