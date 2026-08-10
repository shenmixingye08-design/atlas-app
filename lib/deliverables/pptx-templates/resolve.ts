import { findPptxTemplate, getPptxTemplate } from "./registry";
import type {
  PptxAutomationTheme,
  PptxColorTokens,
  PptxTemplateId,
  ResolvedPptxDesign,
} from "./types";

function normalizeHex(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const hex = raw.replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : fallback;
}

function lighten(hex: string, amount = 0.75): string {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `${mix(r)}${mix(g)}${mix(b)}`;
}

function mapAutomationTheme(
  theme: string | null | undefined,
): PptxTemplateId | null {
  if (!theme) return null;
  const normalized = theme.trim().toLowerCase();
  if (normalized === "blue") return "business";
  if (normalized === "neutral") return "simple";
  if (normalized === "brand") return "proposal";
  return findPptxTemplate(normalized)?.id ?? null;
}

function inferFromAssignment(assignment: string | null | undefined): PptxTemplateId | null {
  if (!assignment) return null;
  if (/ピッチ|pitch|登壇|発表資料/i.test(assignment)) return "pitch";
  if (/提案|proposal|営業資料|提案書/i.test(assignment)) return "proposal";
  if (/報告|report|議事|週次|月次/i.test(assignment)) return "report";
  if (/シンプル|simple|簡潔/i.test(assignment)) return "simple";
  return null;
}

export type ResolvePptxDesignInput = {
  templateId?: string | null;
  theme?: string | PptxAutomationTheme | null;
  assignment?: string | null;
  brandColorHex?: string | null;
  fontFace?: string | null;
  titleAlign?: "left" | "center" | "right" | null;
  slideCountHint?: number | null;
  logoDataUrl?: string | null;
  companyName?: string | null;
};

export function resolvePptxDesign(
  input: ResolvePptxDesignInput = {},
): ResolvedPptxDesign {
  const fromExplicit = findPptxTemplate(input.templateId ?? null);
  const fromTheme = mapAutomationTheme(
    typeof input.theme === "string" ? input.theme : null,
  );
  const fromAssignment = inferFromAssignment(input.assignment);
  const template = getPptxTemplate(
    fromExplicit?.id ?? fromTheme ?? fromAssignment ?? "business",
  );

  const effectiveAccent = normalizeHex(
    input.brandColorHex,
    template.colors.accent,
  );
  const colors: PptxColorTokens = {
    ...template.colors,
    accent: effectiveAccent,
    accentLight: lighten(effectiveAccent, 0.78),
  };

  const hintRaw = input.slideCountHint;
  const slideCountHint =
    typeof hintRaw === "number" && Number.isFinite(hintRaw) && hintRaw > 0
      ? Math.min(40, Math.max(3, Math.round(hintRaw)))
      : null;

  return {
    template,
    colors,
    fontFace: input.fontFace?.trim() || "Calibri",
    titleAlign: input.titleAlign ?? "center",
    slideCountHint,
    logoDataUrl: input.logoDataUrl ?? null,
    companyName: input.companyName ?? null,
  };
}
