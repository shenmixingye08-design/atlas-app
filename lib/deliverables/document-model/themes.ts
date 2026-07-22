import type { DesignTemplateId } from "./types";

export type DocumentTheme = {
  id: DesignTemplateId;
  label: string;
  description: string;
  /** Hex without # */
  accentHex: string;
  accentRgb: { r: number; g: number; b: number };
  textHex: string;
  mutedHex: string;
  lineHex: string;
  headerFillHex: string;
  zebraFillHex: string;
  calloutFillHex: string;
  /** Cover style intensity. */
  coverStyle: "full" | "compact" | "minimal";
  showToc: boolean;
  /** Word half-points / PDF points approximations. */
  bodySize: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  titleSize: number;
  /** Page margins in PDF points (approx 72pt = 1in). */
  marginPt: { top: number; right: number; bottom: number; left: number };
  /** Word DXA (1440 = 1in). */
  marginDxa: { top: number; right: number; bottom: number; left: number };
  lineSpacing: number;
};

const BUSINESS: DocumentTheme = {
  id: "business",
  label: "ビジネス",
  description: "提出向けの清潔な業務資料",
  accentHex: "1F4E79",
  accentRgb: { r: 0.12, g: 0.31, b: 0.47 },
  textHex: "222222",
  mutedHex: "666666",
  lineHex: "D0D7DE",
  headerFillHex: "1F4E79",
  zebraFillHex: "F7F9FC",
  calloutFillHex: "F3F6FA",
  coverStyle: "full",
  showToc: true,
  bodySize: 22,
  h1Size: 32,
  h2Size: 26,
  h3Size: 24,
  titleSize: 48,
  marginPt: { top: 64, right: 56, bottom: 64, left: 56 },
  marginDxa: { top: 1296, right: 1152, bottom: 1296, left: 1152 },
  lineSpacing: 300,
};

const STANDARD: DocumentTheme = {
  ...BUSINESS,
  id: "standard",
  label: "標準",
  description: "バランスの取れた標準レイアウト",
  accentHex: "2F3E4E",
  accentRgb: { r: 0.18, g: 0.24, b: 0.31 },
  headerFillHex: "2F3E4E",
  coverStyle: "compact",
  titleSize: 44,
};

const SIMPLE: DocumentTheme = {
  ...BUSINESS,
  id: "simple",
  label: "シンプル",
  description: "余白重視の簡潔な資料",
  accentHex: "333333",
  accentRgb: { r: 0.2, g: 0.2, b: 0.2 },
  headerFillHex: "444444",
  zebraFillHex: "FAFAFA",
  calloutFillHex: "F5F5F5",
  coverStyle: "minimal",
  showToc: false,
  titleSize: 40,
  marginPt: { top: 72, right: 64, bottom: 72, left: 64 },
  marginDxa: { top: 1440, right: 1296, bottom: 1440, left: 1296 },
};

const REPORT: DocumentTheme = {
  ...BUSINESS,
  id: "report",
  label: "レポート",
  description: "調査・報告向けの堅実な構成",
  accentHex: "244A3A",
  accentRgb: { r: 0.14, g: 0.29, b: 0.23 },
  headerFillHex: "244A3A",
  zebraFillHex: "F4F8F6",
  calloutFillHex: "EEF5F1",
  coverStyle: "full",
  showToc: true,
};

const THEMES: Record<DesignTemplateId, DocumentTheme> = {
  business: BUSINESS,
  standard: STANDARD,
  simple: SIMPLE,
  report: REPORT,
};

export function getDocumentTheme(id: DesignTemplateId): DocumentTheme {
  return THEMES[id] ?? BUSINESS;
}

export function listDocumentThemes(): DocumentTheme[] {
  return [BUSINESS, STANDARD, SIMPLE, REPORT];
}
