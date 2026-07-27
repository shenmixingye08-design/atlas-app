/**
 * Word template definitions — layout config only.
 * Rendering stays in the shared docx renderer (no per-template Packer clones).
 */

export const WORD_TEMPLATE_IDS = [
  "standard-document",
  "business-report",
  "meeting-minutes",
  "sales-report",
  "proposal",
  "comparison-table",
  "manual",
  "customer-letter",
  "contract",
  "estimate",
] as const;

export type WordTemplateId = (typeof WORD_TEMPLATE_IDS)[number];

export type WordPurpose =
  | "general"
  | "business_report"
  | "meeting_minutes"
  | "sales_report"
  | "proposal"
  | "comparison"
  | "manual"
  | "customer_letter"
  | "contract"
  | "estimate";

export type WordDateFormat = "ja-long" | "ja-slash" | "iso";

export type WordColorTheme = {
  accentHex: string;
  textHex: string;
  mutedHex: string;
  headerFillHex: string;
  zebraFillHex: string;
  lineHex: string;
};

export type WordTypography = {
  /** Primary East-Asian face; fallbacks applied in renderer. */
  eastAsiaFont: string;
  asciiFont: string;
  bodyHalfPoints: number;
  h1HalfPoints: number;
  h2HalfPoints: number;
  h3HalfPoints: number;
  titleHalfPoints: number;
  lineSpacing: number;
  paragraphSpacingAfter: number;
  firstLineIndentDxa: number;
};

export type WordMarginsDxa = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type WordPageBreakRule =
  | "none"
  | "before_h1"
  | "before_major_sections"
  | "title_page_only";

export type WordTemplateDefinition = {
  id: WordTemplateId;
  displayName: string;
  description: string;
  purposes: WordPurpose[];
  typography: WordTypography;
  colors: WordColorTheme;
  marginsDxa: WordMarginsDxa;
  showHeader: boolean;
  showFooter: boolean;
  showPageNumbers: boolean;
  hidePageNumberOnFirstPage: boolean;
  showLogo: boolean;
  showCompanyInfo: boolean;
  dateFormat: WordDateFormat;
  pageBreakRule: WordPageBreakRule;
  includeToc: boolean;
  orientation: "portrait" | "landscape" | "auto";
  tableHeaderRepeat: boolean;
  preferCompactCover: boolean;
};

const BASE_TYPOGRAPHY: WordTypography = {
  eastAsiaFont: "Yu Gothic",
  asciiFont: "Calibri",
  bodyHalfPoints: 22,
  h1HalfPoints: 32,
  h2HalfPoints: 28,
  h3HalfPoints: 24,
  titleHalfPoints: 44,
  lineSpacing: 288,
  paragraphSpacingAfter: 180,
  firstLineIndentDxa: 0,
};

const BASE_COLORS: WordColorTheme = {
  accentHex: "1F4E79",
  textHex: "222222",
  mutedHex: "666666",
  headerFillHex: "1F4E79",
  zebraFillHex: "F7F9FC",
  lineHex: "D0D7DE",
};

const A4_MARGINS: WordMarginsDxa = {
  top: 1440,
  right: 1440,
  bottom: 1440,
  left: 1440,
};

export const WORD_TEMPLATES: Record<WordTemplateId, WordTemplateDefinition> = {
  "standard-document": {
    id: "standard-document",
    displayName: "標準文書",
    description: "用途が特定できないときの汎用レイアウト",
    purposes: ["general"],
    typography: { ...BASE_TYPOGRAPHY },
    colors: { ...BASE_COLORS, accentHex: "2F3E4E", headerFillHex: "2F3E4E" },
    marginsDxa: A4_MARGINS,
    showHeader: false,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: false,
    showLogo: false,
    showCompanyInfo: false,
    dateFormat: "ja-long",
    pageBreakRule: "none",
    includeToc: false,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: true,
  },
  "business-report": {
    id: "business-report",
    displayName: "社内報告書",
    description: "社内向けの報告・実績まとめ",
    purposes: ["business_report"],
    typography: { ...BASE_TYPOGRAPHY, titleHalfPoints: 46, lineSpacing: 300 },
    colors: {
      ...BASE_COLORS,
      accentHex: "244A3A",
      headerFillHex: "244A3A",
      zebraFillHex: "F4F8F6",
    },
    marginsDxa: { top: 1296, right: 1152, bottom: 1296, left: 1152 },
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: true,
    showLogo: true,
    showCompanyInfo: true,
    dateFormat: "ja-long",
    pageBreakRule: "before_major_sections",
    includeToc: true,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: false,
  },
  "meeting-minutes": {
    id: "meeting-minutes",
    displayName: "会議議事録",
    description: "会議名・日時・参加者・決定事項向け",
    purposes: ["meeting_minutes"],
    typography: {
      ...BASE_TYPOGRAPHY,
      bodyHalfPoints: 20,
      titleHalfPoints: 40,
      paragraphSpacingAfter: 140,
    },
    colors: { ...BASE_COLORS, accentHex: "333333", headerFillHex: "444444" },
    marginsDxa: A4_MARGINS,
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: false,
    showLogo: false,
    showCompanyInfo: true,
    dateFormat: "ja-slash",
    pageBreakRule: "none",
    includeToc: false,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: true,
  },
  "sales-report": {
    id: "sales-report",
    displayName: "営業報告書",
    description: "訪問・提案・次アクション向け営業報告",
    purposes: ["sales_report"],
    typography: { ...BASE_TYPOGRAPHY, titleHalfPoints: 46 },
    colors: { ...BASE_COLORS },
    marginsDxa: { top: 1296, right: 1152, bottom: 1296, left: 1152 },
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: true,
    showLogo: true,
    showCompanyInfo: true,
    dateFormat: "ja-long",
    pageBreakRule: "title_page_only",
    includeToc: false,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: false,
  },
  proposal: {
    id: "proposal",
    displayName: "提案書",
    description: "顧客向け提案・ソリューション資料",
    purposes: ["proposal"],
    typography: { ...BASE_TYPOGRAPHY, titleHalfPoints: 50, lineSpacing: 300 },
    colors: {
      ...BASE_COLORS,
      accentHex: "1B4F72",
      headerFillHex: "1B4F72",
    },
    marginsDxa: { top: 1296, right: 1152, bottom: 1296, left: 1152 },
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: true,
    showLogo: true,
    showCompanyInfo: true,
    dateFormat: "ja-long",
    pageBreakRule: "before_major_sections",
    includeToc: true,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: false,
  },
  "comparison-table": {
    id: "comparison-table",
    displayName: "比較表資料",
    description: "見積・価格・プラン比較向け",
    purposes: ["comparison"],
    typography: {
      ...BASE_TYPOGRAPHY,
      bodyHalfPoints: 20,
      titleHalfPoints: 40,
    },
    colors: { ...BASE_COLORS },
    marginsDxa: { top: 1008, right: 864, bottom: 1008, left: 864 },
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: false,
    showLogo: false,
    showCompanyInfo: true,
    dateFormat: "ja-slash",
    pageBreakRule: "none",
    includeToc: false,
    orientation: "auto",
    tableHeaderRepeat: true,
    preferCompactCover: true,
  },
  manual: {
    id: "manual",
    displayName: "作業手順書",
    description: "手順・マニュアル・チェックリスト向け",
    purposes: ["manual"],
    typography: {
      ...BASE_TYPOGRAPHY,
      bodyHalfPoints: 20,
      firstLineIndentDxa: 0,
      paragraphSpacingAfter: 120,
    },
    colors: {
      ...BASE_COLORS,
      accentHex: "333333",
      headerFillHex: "444444",
      zebraFillHex: "FAFAFA",
    },
    marginsDxa: A4_MARGINS,
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: false,
    showLogo: false,
    showCompanyInfo: true,
    dateFormat: "ja-slash",
    pageBreakRule: "before_h1",
    includeToc: true,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: true,
  },
  "customer-letter": {
    id: "customer-letter",
    displayName: "顧客向け案内文",
    description: "地権者・顧客向けの案内・通知文",
    purposes: ["customer_letter"],
    typography: {
      ...BASE_TYPOGRAPHY,
      bodyHalfPoints: 22,
      titleHalfPoints: 36,
      firstLineIndentDxa: 420,
      lineSpacing: 360,
      paragraphSpacingAfter: 200,
    },
    colors: {
      ...BASE_COLORS,
      accentHex: "7B2D1A",
      headerFillHex: "7B2D1A",
    },
    marginsDxa: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    showHeader: false,
    showFooter: true,
    showPageNumbers: false,
    hidePageNumberOnFirstPage: true,
    showLogo: true,
    showCompanyInfo: true,
    dateFormat: "ja-long",
    pageBreakRule: "none",
    includeToc: false,
    orientation: "portrait",
    tableHeaderRepeat: false,
    preferCompactCover: true,
  },
  contract: {
    id: "contract",
    displayName: "契約関連たたき台",
    description: "契約条件・当事者・署名欄向けの控えめで読みやすい書式",
    purposes: ["contract"],
    typography: {
      ...BASE_TYPOGRAPHY,
      bodyHalfPoints: 20,
      titleHalfPoints: 36,
      lineSpacing: 300,
      paragraphSpacingAfter: 140,
      firstLineIndentDxa: 0,
    },
    colors: {
      ...BASE_COLORS,
      accentHex: "1A1A1A",
      headerFillHex: "333333",
      zebraFillHex: "F5F5F5",
    },
    marginsDxa: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: false,
    showLogo: false,
    showCompanyInfo: true,
    dateFormat: "ja-long",
    pageBreakRule: "before_major_sections",
    includeToc: false,
    orientation: "portrait",
    tableHeaderRepeat: true,
    preferCompactCover: true,
  },
  estimate: {
    id: "estimate",
    displayName: "見積書",
    description: "見積明細・合計・注記向け。横長表に対応",
    purposes: ["estimate"],
    typography: {
      ...BASE_TYPOGRAPHY,
      bodyHalfPoints: 20,
      titleHalfPoints: 40,
      paragraphSpacingAfter: 120,
    },
    colors: {
      ...BASE_COLORS,
      accentHex: "0E4D3A",
      headerFillHex: "0E4D3A",
      zebraFillHex: "F3F8F5",
    },
    marginsDxa: { top: 1008, right: 864, bottom: 1008, left: 864 },
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    hidePageNumberOnFirstPage: false,
    showLogo: true,
    showCompanyInfo: true,
    dateFormat: "ja-slash",
    pageBreakRule: "none",
    includeToc: false,
    orientation: "auto",
    tableHeaderRepeat: true,
    preferCompactCover: true,
  },
};

export function getWordTemplate(id: WordTemplateId): WordTemplateDefinition {
  return WORD_TEMPLATES[id] ?? WORD_TEMPLATES["standard-document"];
}

export function listWordTemplates(): WordTemplateDefinition[] {
  return WORD_TEMPLATE_IDS.map((id) => WORD_TEMPLATES[id]);
}

export function isWordTemplateId(value: string): value is WordTemplateId {
  return (WORD_TEMPLATE_IDS as readonly string[]).includes(value);
}
