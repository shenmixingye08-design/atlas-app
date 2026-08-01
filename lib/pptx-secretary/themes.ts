import type { BrandConfig, PresentationTheme, ThemeId } from "./types";

/** Cross-platform JP-capable stack: Office substitutes Hiragino/Yu Gothic as needed. */
export const PPTX_SAFE_FONT = "Yu Gothic";

const THEME_BASE: Record<
  ThemeId,
  Omit<PresentationTheme, "brand" | "font_family"> & { font_family?: string }
> = {
  business: {
    style: "business",
    tone: "落ち着いた信頼感",
    colors: {
      primary: "1F4E79",
      accent: "2E75B6",
      text: "1F2937",
      muted: "6B7280",
      surface: "FFFFFF",
      light: "D6E3F0",
    },
  },
  sales: {
    style: "sales",
    tone: "提案・行動促進",
    colors: {
      primary: "0F3D68",
      accent: "C45C26",
      text: "1F2937",
      muted: "6B7280",
      surface: "FFFFFF",
      light: "F3E8E1",
    },
  },
  corporate: {
    style: "corporate",
    tone: "正式・コーポレート",
    colors: {
      primary: "111827",
      accent: "1D4ED8",
      text: "111827",
      muted: "4B5563",
      surface: "FFFFFF",
      light: "E5E7EB",
    },
  },
  modern: {
    style: "modern",
    tone: "洗練・余白重視",
    colors: {
      primary: "0B3A4A",
      accent: "14B8A6",
      text: "0F172A",
      muted: "64748B",
      surface: "FFFFFF",
      light: "CCFBF1",
    },
  },
  simple: {
    style: "simple",
    tone: "シンプル・可読性",
    colors: {
      primary: "334155",
      accent: "475569",
      text: "0F172A",
      muted: "64748B",
      surface: "FFFFFF",
      light: "F1F5F9",
    },
  },
  startup: {
    style: "startup",
    tone: "成長・スピード",
    colors: {
      primary: "1E3A5F",
      accent: "F59E0B",
      text: "0F172A",
      muted: "64748B",
      surface: "FFFFFF",
      light: "FEF3C7",
    },
  },
  education: {
    style: "education",
    tone: "学びやすい",
    colors: {
      primary: "1E40AF",
      accent: "2563EB",
      text: "1E293B",
      muted: "64748B",
      surface: "FFFFFF",
      light: "DBEAFE",
    },
  },
  training: {
    style: "training",
    tone: "手順が追いやすい",
    colors: {
      primary: "065F46",
      accent: "059669",
      text: "064E3B",
      muted: "6B7280",
      surface: "FFFFFF",
      light: "D1FAE5",
    },
  },
  report: {
    style: "report",
    tone: "数値・結論重視",
    colors: {
      primary: "1F2937",
      accent: "2563EB",
      text: "111827",
      muted: "6B7280",
      surface: "FFFFFF",
      light: "E0E7FF",
    },
  },
  proposal: {
    style: "proposal",
    tone: "課題解決・提案",
    colors: {
      primary: "1E3A5F",
      accent: "B45309",
      text: "1F2937",
      muted: "6B7280",
      surface: "FFFFFF",
      light: "FFEDD5",
    },
  },
};

export function resolveTheme(
  style: ThemeId,
  brand: BrandConfig = {},
): PresentationTheme {
  const base = THEME_BASE[style] ?? THEME_BASE.business;
  const primary = sanitizeColor(brand.primaryColor) ?? base.colors.primary;
  const accent = sanitizeColor(brand.accentColor) ?? base.colors.accent;
  return {
    style,
    font_family: brand.fontFamily?.trim() || PPTX_SAFE_FONT,
    tone: base.tone,
    brand: {
      ...brand,
      primaryColor: primary,
      accentColor: accent,
    },
    colors: {
      ...base.colors,
      primary,
      accent,
    },
  };
}

function sanitizeColor(value?: string): string | null {
  if (!value) return null;
  const hex = value.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex.toUpperCase();
}

export function themeForKind(kind: string): ThemeId {
  switch (kind) {
    case "sales_pitch":
    case "product":
    case "service_intro":
      return "sales";
    case "company_intro":
      return "corporate";
    case "investor":
    case "business_plan":
      return "startup";
    case "training":
      return "training";
    case "seminar":
    case "school":
      return "education";
    case "monthly_report":
    case "internal_meeting":
      return "report";
    case "proposal":
      return "proposal";
    default:
      return "business";
  }
}
