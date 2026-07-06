# Long Code And Wide Table Fixture

## Long Code Block

```ts
type ReaderSettings = {
  schemaVersion: 1;
  colorThemeId: "warm-paper";
  themeMode: "light" | "dark" | "system";
  bodyFontFamily: string | null;
  codeFontFamily: string | null;
  bodyFontSize: number;
  codeFontSize: number;
  lineHeight: number;
  contentMaxWidth: number;
  lightCodeTheme: "Eva Light Bold";
  darkCodeTheme: "Eva Dark Bold";
};

const intentionallyLongLine = "This line is intentionally long so the reader can verify horizontal scrolling without forcing the whole reading layout to overflow beyond the viewport width.";
```

## Wide Table

| File | Purpose | Light theme behavior | Dark theme behavior | Failure state | Notes | Future coverage |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/ui/open-file.html` | Open-file prototype | centered open button | centered open button | readable empty state | recent files use two lines | Tauri dialog integration |
| `docs/ui/reader.html` | Reader prototype | outline and document split | outline and document split | render error state | settings button outside content width | outline sync |
| `docs/ui/settings.html` | Settings prototype | form controls | form controls | validation feedback | no nested cards | persisted settings |
