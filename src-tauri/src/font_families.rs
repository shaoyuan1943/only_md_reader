use serde::Serialize;

const BUNDLED_DEFAULT_FONT: &str = "Maple Mono NF CN";

const BODY_FONT_PRIORITIES: &[&str] = &[
    BUNDLED_DEFAULT_FONT,
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    "PingFang SC",
    "Noto Sans CJK SC",
    "Noto Sans SC",
    "Segoe UI",
    "Arial",
    "Times New Roman",
    "Georgia",
    "Tahoma",
    "Verdana",
];

const CODE_FONT_PRIORITIES: &[&str] = &[
    BUNDLED_DEFAULT_FONT,
    "Cascadia Code",
    "Cascadia Mono",
    "Consolas",
    "Courier New",
    "Lucida Console",
    "DejaVu Sans Mono",
    "SF Mono",
    "Menlo",
    "Monaco",
];

const FONT_STYLE_SUFFIXES: &[&str] = &[
    "Bold Italic",
    "Bold Oblique",
    "SemiBold Italic",
    "Semibold Italic",
    "SemiLight Italic",
    "Semilight Italic",
    "Black Italic",
    "Light Italic",
    "Medium Italic",
    "Extra Bold",
    "Bold",
    "Italic",
    "Oblique",
    "Regular",
    "SemiBold",
    "Semibold",
    "SemiLight",
    "Semilight",
    "Black",
    "Light",
    "Medium",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvailableFontFamilies {
    pub body: Vec<String>,
    pub code: Vec<String>,
}

#[tauri::command]
pub fn list_available_font_families() -> AvailableFontFamilies {
    let system_fonts = list_platform_font_families();

    AvailableFontFamilies {
        body: ordered_font_list(BODY_FONT_PRIORITIES, &system_fonts),
        code: ordered_font_list(CODE_FONT_PRIORITIES, &system_fonts),
    }
}

fn ordered_font_list(priorities: &[&str], system_fonts: &[String]) -> Vec<String> {
    let mut result = Vec::new();

    for font in priorities {
        push_font_once(&mut result, font);
    }

    for font in system_fonts {
        push_font_once(&mut result, font);
    }

    result
}

fn push_font_once(result: &mut Vec<String>, font: &str) {
    let trimmed = font.trim();

    if trimmed.is_empty()
        || result
            .iter()
            .any(|current| current.eq_ignore_ascii_case(trimmed))
    {
        return;
    }

    result.push(trimmed.to_string());
}

#[cfg(windows)]
fn list_platform_font_families() -> Vec<String> {
    use std::collections::BTreeSet;
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };

    let mut families = BTreeSet::new();

    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(fonts_key) =
            RegKey::predef(root).open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
        else {
            continue;
        };

        for value in fonts_key.enum_values().flatten() {
            for family in font_families_from_registry_value_name(&value.0) {
                families.insert(family);
            }
        }
    }

    families.into_iter().collect()
}

#[cfg(not(windows))]
fn list_platform_font_families() -> Vec<String> {
    Vec::new()
}

fn font_families_from_registry_value_name(value_name: &str) -> Vec<String> {
    let without_kind = value_name
        .split_once(" (")
        .map_or(value_name, |(family, _)| family);

    without_kind
        .split(" & ")
        .filter_map(normalize_registry_font_family)
        .collect()
}

fn normalize_registry_font_family(family: &str) -> Option<String> {
    let mut normalized = family.trim().to_string();

    loop {
        let before = normalized.clone();
        for suffix in FONT_STYLE_SUFFIXES {
            if let Some(stripped) = normalized.strip_suffix(suffix) {
                normalized = stripped.trim().to_string();
                break;
            }
        }

        if normalized == before {
            break;
        }
    }

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        font_families_from_registry_value_name, list_available_font_families, ordered_font_list,
    };

    #[test]
    fn parses_windows_registry_font_names_into_family_names() {
        assert_eq!(
            font_families_from_registry_value_name(
                "Microsoft YaHei & Microsoft YaHei UI (TrueType)",
            ),
            ["Microsoft YaHei", "Microsoft YaHei UI"],
        );
        assert_eq!(
            font_families_from_registry_value_name("Cascadia Mono Regular (TrueType)"),
            ["Cascadia Mono"],
        );
        assert_eq!(
            font_families_from_registry_value_name("Times New Roman Bold Italic (TrueType)"),
            ["Times New Roman"],
        );
    }

    #[test]
    fn keeps_bundled_default_first_and_deduplicates_system_fonts() {
        let fonts = ordered_font_list(
            &["Maple Mono NF CN", "Consolas"],
            &[
                "consolas".to_string(),
                "Arial".to_string(),
                "Maple Mono NF CN".to_string(),
            ],
        );

        assert_eq!(fonts, ["Maple Mono NF CN", "Consolas", "Arial"]);
    }

    #[test]
    fn available_font_lists_have_safe_defaults() {
        let fonts = list_available_font_families();

        assert_eq!(
            fonts.body.first().map(String::as_str),
            Some("Maple Mono NF CN")
        );
        assert_eq!(
            fonts.code.first().map(String::as_str),
            Some("Maple Mono NF CN")
        );
        assert!(fonts.body.iter().any(|font| font == "Arial"));
        assert!(fonts.code.iter().any(|font| font == "Consolas"));
    }
}
