import type { TemplateId } from "@/lib/documents/schema/enums";

/** Shared design tokens — Japanese business clean look. */
export const DESIGN_TOKENS = {
  page: {
    widthMm: 210,
    heightMm: 297,
    marginMm: 25,
  },
  fonts: {
    body: "Noto Sans JP",
    bodyFallback: "Yu Gothic",
    sizes: {
      body: 11,
      h1: 18,
      h2: 14,
      h3: 12,
      title: 22,
      subtitle: 13,
      caption: 9,
    },
    lineHeight: 1.6,
  },
  colors: {
    accent: "#1F4E79",
    accentRgb: { r: 0.12, g: 0.31, b: 0.47 },
    body: "#222222",
    muted: "#666666",
    tableHeaderBg: "#1F4E79",
    tableHeaderText: "#FFFFFF",
    tableZebra: "#F7F9FC",
    callout: {
      info: "#E8F4FD",
      warning: "#FFF4E5",
      note: "#F5F5F5",
    },
  },
  docx: {
    marginTwips: 1440,
    bodySizeHalfPoints: 22,
    h1SizeHalfPoints: 32,
    h2SizeHalfPoints: 28,
    h3SizeHalfPoints: 24,
    titleSizeHalfPoints: 44,
  },
  pdf: {
    pageWidth: 595,
    pageHeight: 842,
    margin: 50,
  },
} as const;

export function tokensForTemplate(templateId: TemplateId) {
  if (templateId === "simple") {
    return { ...DESIGN_TOKENS, colors: { ...DESIGN_TOKENS.colors, accent: "#333333" } };
  }
  return DESIGN_TOKENS;
}
