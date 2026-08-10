/**
 * PPT design template contracts (P3-04).
 * Layout math is deterministic — never AI-planned geometry.
 */

export const PPTX_TEMPLATE_IDS = [
  "business",
  "simple",
  "proposal",
  "pitch",
  "report",
] as const;

export type PptxTemplateId = (typeof PPTX_TEMPLATE_IDS)[number];

export type PptxAutomationTheme = "blue" | "neutral" | "brand";

export type PptxTitleLayout =
  | "centered-bar"
  | "left-stripe"
  | "minimal"
  | "full-bleed"
  | "header-band";

export type PptxContentLayout =
  | "standard"
  | "left-rail"
  | "compact"
  | "wide-title"
  | "banded";

export type PptxColorTokens = {
  /** Hex without # */
  accent: string;
  accentLight: string;
  text: string;
  muted: string;
  onAccent: string;
  surface: string;
};

export type PptxTemplateDefinition = {
  id: PptxTemplateId;
  displayName: string;
  description: string;
  colors: PptxColorTokens;
  titleLayout: PptxTitleLayout;
  contentLayout: PptxContentLayout;
  showAgenda: boolean;
  showSectionDividers: boolean;
  showClosing: boolean;
  titleFontSize: number;
  headingFontSize: number;
  bodyFontSize: number;
  /** Marker written into notes/hidden text for probe asserts (no PII). */
  designMarker: string;
};

export type ResolvedPptxDesign = {
  template: PptxTemplateDefinition;
  colors: PptxColorTokens;
  fontFace: string;
  titleAlign: "left" | "center" | "right";
  slideCountHint: number | null;
  logoDataUrl: string | null;
  companyName: string | null;
};
