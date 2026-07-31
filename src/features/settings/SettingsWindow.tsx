import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ReaderSettings,
  ReaderSettingsPatch,
  ThemeMode,
} from "./reader-settings.ts";
import { defaultReaderSettings } from "./reader-settings.ts";
import type { SettingsApi } from "./settings-api.ts";
import {
  createSettingsApi,
  defaultAvailableFontFamilies,
  type AvailableFontFamilies,
} from "./settings-api.ts";
import { createSettingsWindowViewModel } from "./settings-window.ts";
import {
  calculateScrollChromeMetrics,
  getScrollTopForThumbDelta,
  getScrollTopForTrackPointer,
  type ScrollChromeMetrics,
} from "../../shared/ui/scroll-chrome.ts";

type SettingsWindowProps = {
  api?: SettingsApi;
};

const themeModeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: "明亮", value: "light" },
  { label: "暗色", value: "dark" },
  { label: "跟随系统", value: "system" },
];

type FontOption = {
  label: string;
  value: string | null;
};

type FontSelectId = "bodyFontFamily" | "codeFontFamily";
type SelectDirection = "drop-down" | "drop-up";
type SelectScrollChromeState = ScrollChromeMetrics & {
  isDragging: boolean;
};

const selectMenuEstimatedHeight = 196;
const selectMenuViewportInset = 24;
const defaultSelectScrollChromeState: SelectScrollChromeState = {
  canScroll: false,
  isDragging: false,
  maxScrollTop: 0,
  maxThumbTop: 0,
  thumbHeight: 0,
  thumbTop: 0,
};

export function SettingsWindow({ api = createSettingsApi() }: SettingsWindowProps) {
  const [settings, setSettings] = useState<ReaderSettings>(defaultReaderSettings);
  const [lastSavedSettings, setLastSavedSettings] =
    useState<ReaderSettings>(defaultReaderSettings);
  const [availableFonts, setAvailableFonts] = useState<AvailableFontFamilies>(
    defaultAvailableFontFamilies,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openSelectId, setOpenSelectId] = useState<FontSelectId | null>(null);
  const [openSelectDirection, setOpenSelectDirection] =
    useState<SelectDirection>("drop-down");
  const viewModel = useMemo(() => createSettingsWindowViewModel(settings), [settings]);
  const bodyFontOptions = useMemo(
    () => createFontOptions(availableFonts.body, settings.bodyFontFamily),
    [availableFonts.body, settings.bodyFontFamily],
  );
  const codeFontOptions = useMemo(
    () => createFontOptions(availableFonts.code, settings.codeFontFamily),
    [availableFonts.code, settings.codeFontFamily],
  );

  useEffect(() => {
    let isCancelled = false;

    void api
      .getReaderSettings()
      .then((loaded) => {
        if (isCancelled) {
          return;
        }
        setSettings(loaded);
        setLastSavedSettings(loaded);
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setSaveError(getErrorMessage(error));
        }
      });

    void api
      .listAvailableFontFamilies()
      .then((loadedFonts) => {
        if (isCancelled) {
          return;
        }
        setAvailableFonts(normalizeAvailableFonts(loadedFonts));
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setSaveError(getErrorMessage(error));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (openSelectId === null) {
      return;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element) || target.closest(".custom-select")) {
        return;
      }

      setOpenSelectId(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSelectId(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openSelectId]);

  const savePatch = async (patch: ReaderSettingsPatch) => {
    const optimistic = {
      ...settings,
      ...patch,
      schemaVersion: 1 as const,
    };
    setSettings(optimistic);
    setSaveError(null);

    try {
      const saved = await api.updateReaderSettings(patch);
      setSettings(saved);
      setLastSavedSettings(saved);
    } catch (error) {
      setSettings(lastSavedSettings);
      setSaveError(getErrorMessage(error));
    }
  };

  return (
    <main className="settings-window-shell" aria-label="设置窗口">
      <section className="settings-window-frame" aria-label="设置">
        <div className="settings-window-title">{viewModel.title}</div>
        <section className="settings-panel" aria-label="设置内容">
          <div className="settings-form">
            <div className="settings-row">
              <div className="settings-label">外观主题</div>
              <div className="settings-segmented" role="group" aria-label="外观主题">
                {themeModeOptions.map((option) => (
                  <button
                    data-current={option.value === settings.themeMode}
                    key={option.value}
                    type="button"
                    onClick={() => {
                      void savePatch({ themeMode: option.value });
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <SelectRow
              id="bodyFontFamily"
              label="阅读字体"
              value={settings.bodyFontFamily}
              options={bodyFontOptions}
              isOpen={openSelectId === "bodyFontFamily"}
              direction={
                openSelectId === "bodyFontFamily" ? openSelectDirection : "drop-down"
              }
              onOpenIntent={(selectElement) => {
                setOpenSelectDirection(getSelectOpenDirection(selectElement));
              }}
              onOpenChange={(isOpen) => {
                setOpenSelectId(isOpen ? "bodyFontFamily" : null);
              }}
              onChange={(value) => {
                setOpenSelectId(null);
                void savePatch({ bodyFontFamily: value });
              }}
            />
            <SelectRow
              id="codeFontFamily"
              label="代码字体"
              value={settings.codeFontFamily}
              options={codeFontOptions}
              dropUp
              isOpen={openSelectId === "codeFontFamily"}
              direction={
                openSelectId === "codeFontFamily" ? openSelectDirection : "drop-up"
              }
              onOpenIntent={(selectElement) => {
                setOpenSelectDirection(getSelectOpenDirection(selectElement));
              }}
              onOpenChange={(isOpen) => {
                setOpenSelectId(isOpen ? "codeFontFamily" : null);
              }}
              onChange={(value) => {
                setOpenSelectId(null);
                void savePatch({ codeFontFamily: value });
              }}
            />

            <div className="settings-row settings-row-pdf">
              <div className="settings-label">PDF 导出</div>
              <div className="pdf-auto-scale-control">
                <div className="pdf-setting-copy">
                  <div className="pdf-setting-title">允许自动缩小 PDF 内容</div>
                  <div className="pdf-setting-help">
                    超宽内容可能触发整页缩小，导致不同文件字号显示不同
                  </div>
                </div>
                <button
                  className="pdf-auto-scale-toggle"
                  type="button"
                  aria-label="允许自动缩小 PDF 内容"
                  aria-pressed={settings.pdfAllowGlobalScaling}
                  onClick={() => {
                    void savePatch({
                      pdfAllowGlobalScaling: !settings.pdfAllowGlobalScaling,
                    });
                  }}
                >
                  <svg
                    className="toggle-icon-off"
                    viewBox="0 0 1024 1024"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M715 267c135.31 0 245 109.69 245 245S850.31 757 715 757H309C173.69 757 64 647.31 64 512s109.69-245 245-245h406z m0 40H309c-113.218 0-205 91.782-205 205 0 112.086 89.955 203.162 201.61 204.973L309 717h406c113.218 0 205-91.782 205-205 0-112.086-89.955-203.162-201.61-204.973L715 307z m-406 60c80.081 0 145 64.919 145 145s-64.919 145-145 145-145-64.919-145-145 64.919-145 145-145z m0 40c-57.99 0-105 47.01-105 105s47.01 105 105 105 105-47.01 105-105-47.01-105-105-105z"
                    />
                  </svg>
                  <svg
                    className="toggle-icon-on"
                    viewBox="0 0 1024 1024"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M715 267c135.31 0 245 109.69 245 245S850.31 757 715 757H309C173.69 757 64 647.31 64 512s109.69-245 245-245h406z m0 40H309c-113.218 0-205 91.782-205 205 0 112.086 89.955 203.162 201.61 204.973L309 717h406c113.218 0 205-91.782 205-205 0-112.086-89.955-203.162-201.61-204.973L715 307z m0 60c80.081 0 145 64.919 145 145s-64.919 145-145 145-145-64.919-145-145 64.919-145 145-145z m0 40c-57.99 0-105 47.01-105 105s47.01 105 105 105 105-47.01 105-105-47.01-105-105-105z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {saveError ? (
            <p className="settings-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </section>
        <div className="settings-version">MD极简阅读 · v0.1.9</div>
      </section>
    </main>
  );
}

type SelectRowProps = {
  direction: SelectDirection;
  id: FontSelectId;
  isOpen: boolean;
  label: string;
  options: FontOption[];
  value: string | null;
  dropUp?: boolean;
  onChange(this: void, value: string | null): void;
  onOpenIntent(this: void, selectElement: HTMLElement | null): void;
  onOpenChange(this: void, isOpen: boolean): void;
};

function SelectRow({
  direction,
  dropUp = false,
  id,
  isOpen,
  label,
  onChange,
  onOpenIntent,
  onOpenChange,
  options,
  value,
}: SelectRowProps) {
  const selectRef = useRef<HTMLDetailsElement | null>(null);
  const menuScrollerRef = useRef<HTMLDivElement | null>(null);
  const menuTrackRef = useRef<HTMLDivElement | null>(null);
  const menuDragStateRef = useRef<{
    pointerId: number;
    startScrollTop: number;
    startY: number;
  } | null>(null);
  const [menuChromeState, setMenuChromeState] = useState<SelectScrollChromeState>(
    defaultSelectScrollChromeState,
  );
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const fallbackDirection: SelectDirection = dropUp ? "drop-up" : "drop-down";
  const resolvedDirection = isOpen ? direction : fallbackDirection;
  const updateMenuMetrics = useCallback(() => {
    const scroller = menuScrollerRef.current;
    const track = menuTrackRef.current;

    if (!scroller || !track) {
      return;
    }

    const metrics = calculateScrollChromeMetrics({
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      trackHeight: track.clientHeight,
    });

    setMenuChromeState((current) => ({
      ...metrics,
      isDragging: current.isDragging,
    }));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuChromeState(defaultSelectScrollChromeState);
      return undefined;
    }

    updateMenuMetrics();

    const scroller = menuScrollerRef.current;
    if (!scroller) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateMenuMetrics);
    resizeObserver.observe(scroller);

    if (scroller.firstElementChild) {
      resizeObserver.observe(scroller.firstElementChild);
    }

    window.addEventListener("resize", updateMenuMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMenuMetrics);
    };
  }, [isOpen, options.length, updateMenuMetrics]);

  const handleMenuTrackClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const scroller = menuScrollerRef.current;
    if (!scroller || !menuChromeState.canScroll) {
      return;
    }

    const trackRect = event.currentTarget.getBoundingClientRect();
    const pointerOffsetY =
      event.clientY - trackRect.top - menuChromeState.thumbHeight / 2;

    scroller.scrollTop = getScrollTopForTrackPointer({
      metrics: menuChromeState,
      pointerOffsetY,
    });
  };

  const handleMenuThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = menuScrollerRef.current;
    if (event.button !== 0 || !scroller || !menuChromeState.canScroll) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    menuDragStateRef.current = {
      pointerId: event.pointerId,
      startScrollTop: scroller.scrollTop,
      startY: event.clientY,
    };
    setMenuChromeState((current) => ({
      ...current,
      isDragging: true,
    }));
  };

  const handleMenuThumbPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = menuScrollerRef.current;
    const dragState = menuDragStateRef.current;

    if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    scroller.scrollTop = getScrollTopForThumbDelta({
      deltaY: event.clientY - dragState.startY,
      dragStartScrollTop: dragState.startScrollTop,
      metrics: menuChromeState,
    });
  };

  const endMenuDragging = useCallback(
    (pointerId: number, captureTarget?: HTMLDivElement | null) => {
      const dragState = menuDragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) {
        return;
      }

      if (captureTarget?.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }

      menuDragStateRef.current = null;
      setMenuChromeState((current) => ({
        ...current,
        isDragging: false,
      }));
    },
    [],
  );

  const stopMenuDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    endMenuDragging(event.pointerId, event.currentTarget);
  };

  useEffect(() => {
    const dragState = menuDragStateRef.current;
    if (!menuChromeState.isDragging || !dragState) {
      return undefined;
    }

    const stopWindowMenuDragging = (event: PointerEvent) => {
      endMenuDragging(event.pointerId);
    };

    window.addEventListener("pointerup", stopWindowMenuDragging, true);
    window.addEventListener("pointercancel", stopWindowMenuDragging, true);

    return () => {
      window.removeEventListener("pointerup", stopWindowMenuDragging, true);
      window.removeEventListener("pointercancel", stopWindowMenuDragging, true);
    };
  }, [endMenuDragging, menuChromeState.isDragging]);

  const thumbStyle = {
    "--scroll-thumb-height": `${menuChromeState.thumbHeight}px`,
    "--scroll-thumb-top": `${menuChromeState.thumbTop}px`,
  } as CSSProperties;

  return (
    <div className="settings-row">
      <div className="settings-label">{label}</div>
      <details
        className={`custom-select ${resolvedDirection}`}
        open={isOpen}
        ref={selectRef}
        onToggle={(event) => {
          if (event.currentTarget.open) {
            onOpenIntent(event.currentTarget);
          }

          onOpenChange(event.currentTarget.open);
        }}
      >
        <summary
          className="select-trigger"
          onKeyDown={(event) => {
            if (!isOpen && (event.key === "Enter" || event.key === " ")) {
              onOpenIntent(selectRef.current);
            }
          }}
          onPointerDown={() => {
            if (!isOpen) {
              onOpenIntent(selectRef.current);
            }
          }}
        >
          {selectedOption?.label}
        </summary>
        <div
          className="select-menu"
          role="listbox"
          aria-label={label}
          data-can-scroll={menuChromeState.canScroll}
          data-dragging-scrollbar={menuChromeState.isDragging}
        >
          <div
            className="select-menu-scroll"
            onScroll={updateMenuMetrics}
            ref={menuScrollerRef}
          >
            {options.map((option) => (
              <button
                className="select-option"
                data-selected={option.value === value}
                key={`${id}-${option.label}`}
                role="option"
                aria-selected={option.value === value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="select-menu-scrollbar-hotzone" aria-hidden="true">
            <div
              className="select-menu-scrollbar"
              onClick={handleMenuTrackClick}
              ref={menuTrackRef}
            >
              <div
                className="select-menu-scrollbar-thumb"
                onPointerDown={handleMenuThumbPointerDown}
                onPointerMove={handleMenuThumbPointerMove}
                onPointerUp={stopMenuDragging}
                onPointerCancel={stopMenuDragging}
                onLostPointerCapture={stopMenuDragging}
                style={thumbStyle}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function getSelectOpenDirection(selectElement: HTMLElement | null): SelectDirection {
  if (selectElement === null) {
    return "drop-down";
  }

  const rect = selectElement.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - selectMenuViewportInset;
  const spaceAbove = rect.top - selectMenuViewportInset;
  const menuHeight = selectMenuEstimatedHeight;

  if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
    return "drop-down";
  }

  return "drop-up";
}

function createFontOptions(
  fontFamilies: string[],
  selectedValue: string | null,
): FontOption[] {
  const names = dedupeFontNames(["Maple Mono NF CN", ...fontFamilies]);

  if (selectedValue?.trim()) {
    names.unshift(selectedValue.trim());
  }

  return dedupeFontNames(names).map((fontFamily) => ({
    label: fontFamily,
    value: fontFamily === "Maple Mono NF CN" ? null : fontFamily,
  }));
}

function normalizeAvailableFonts(fonts: AvailableFontFamilies): AvailableFontFamilies {
  return {
    body: dedupeFontNames(["Maple Mono NF CN", ...fonts.body]),
    code: dedupeFontNames(["Maple Mono NF CN", ...fonts.code]),
  };
}

function dedupeFontNames(fontFamilies: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const fontFamily of fontFamilies) {
    const trimmed = fontFamily.trim();
    const key = trimmed.toLocaleLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
