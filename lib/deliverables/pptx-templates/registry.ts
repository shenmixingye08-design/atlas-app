import type { PptxTemplateDefinition, PptxTemplateId } from "./types";
import { PPTX_TEMPLATE_IDS } from "./types";

const BUSINESS: PptxTemplateDefinition = {
  id: "business",
  displayName: "ビジネス",
  description: "提出向けの清潔な業務スライド",
  colors: {
    accent: "1F4E79",
    accentLight: "D9E2F3",
    text: "222222",
    muted: "666666",
    onAccent: "FFFFFF",
    surface: "FFFFFF",
  },
  titleLayout: "centered-bar",
  contentLayout: "standard",
  showAgenda: true,
  showSectionDividers: true,
  showClosing: true,
  titleFontSize: 36,
  headingFontSize: 24,
  bodyFontSize: 16,
  designMarker: "P304TMPL_BUSINESS",
};

const SIMPLE: PptxTemplateDefinition = {
  id: "simple",
  displayName: "シンプル",
  description: "余白重視の最小装飾",
  colors: {
    accent: "333333",
    accentLight: "E8E8E8",
    text: "222222",
    muted: "777777",
    onAccent: "FFFFFF",
    surface: "FFFFFF",
  },
  titleLayout: "minimal",
  contentLayout: "compact",
  showAgenda: true,
  showSectionDividers: false,
  showClosing: true,
  titleFontSize: 32,
  headingFontSize: 22,
  bodyFontSize: 16,
  designMarker: "P304TMPL_SIMPLE",
};

const PROPOSAL: PptxTemplateDefinition = {
  id: "proposal",
  displayName: "提案",
  description: "左アクセントの提案資料",
  colors: {
    accent: "0B5CAB",
    accentLight: "D6E6F7",
    text: "1A1A1A",
    muted: "5A5A5A",
    onAccent: "FFFFFF",
    surface: "FFFFFF",
  },
  titleLayout: "left-stripe",
  contentLayout: "left-rail",
  showAgenda: true,
  showSectionDividers: true,
  showClosing: true,
  titleFontSize: 34,
  headingFontSize: 24,
  bodyFontSize: 16,
  designMarker: "P304TMPL_PROPOSAL",
};

const PITCH: PptxTemplateDefinition = {
  id: "pitch",
  displayName: "ピッチ",
  description: "強いタイトル面の発表向け",
  colors: {
    accent: "111827",
    accentLight: "E5E7EB",
    text: "111827",
    muted: "6B7280",
    onAccent: "FFFFFF",
    surface: "FFFFFF",
  },
  titleLayout: "full-bleed",
  contentLayout: "wide-title",
  showAgenda: false,
  showSectionDividers: true,
  showClosing: true,
  titleFontSize: 40,
  headingFontSize: 26,
  bodyFontSize: 17,
  designMarker: "P304TMPL_PITCH",
};

const REPORT: PptxTemplateDefinition = {
  id: "report",
  displayName: "報告",
  description: "ヘッダー帯付きの報告書スタイル",
  colors: {
    accent: "2F3E4E",
    accentLight: "E8EEF4",
    text: "222222",
    muted: "666666",
    onAccent: "FFFFFF",
    surface: "FFFFFF",
  },
  titleLayout: "header-band",
  contentLayout: "banded",
  showAgenda: true,
  showSectionDividers: false,
  showClosing: true,
  titleFontSize: 34,
  headingFontSize: 22,
  bodyFontSize: 15,
  designMarker: "P304TMPL_REPORT",
};

const REGISTRY: Record<PptxTemplateId, PptxTemplateDefinition> = {
  business: BUSINESS,
  simple: SIMPLE,
  proposal: PROPOSAL,
  pitch: PITCH,
  report: REPORT,
};

export function listPptxTemplates(): PptxTemplateDefinition[] {
  return PPTX_TEMPLATE_IDS.map((id) => REGISTRY[id]);
}

export function isPptxTemplateId(value: string): value is PptxTemplateId {
  return (PPTX_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function getPptxTemplate(id: PptxTemplateId): PptxTemplateDefinition {
  return REGISTRY[id];
}

export function findPptxTemplate(
  id: string | null | undefined,
): PptxTemplateDefinition | null {
  if (!id || !isPptxTemplateId(id)) return null;
  return REGISTRY[id];
}
