/**
 * Apply PersonalizationContext to real artifact generation options + content.
 * This is the Generator/Exporter bridge — not string concatenation into prompts alone.
 */

import type {
  ArtifactGeneratorOptions,
  PersonalizationContext,
} from "@/lib/personalization/types";

const BLUE = "1F4E79";
const RED = "8B1E1E";
const GREEN = "1F6B3A";
const MONO = "333333";

function paletteColor(
  palette: PersonalizationContext["visualStyle"]["colorPalette"],
  primary?: string,
): string {
  if (primary) return primary.replace(/^#/, "").toUpperCase();
  switch (palette) {
    case "red":
      return RED;
    case "green":
      return GREEN;
    case "mono":
      return MONO;
    case "blue":
    case "brand":
    default:
      return BLUE;
  }
}

/** Transform source content toward remembered style before binary generation. */
export function applyContentPersonalization(
  content: string,
  context: PersonalizationContext,
): string {
  let next = content;

  if (context.writingStyle.verbosity === "short") {
    // Collapse long paragraphs; keep headings and bullets
    next = next
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        if (/^#{1,6}\s/.test(trimmed) || /^[-*•]\s/.test(trimmed)) {
          return line;
        }
        if (trimmed.length > 40) {
          const cut = trimmed.slice(0, 48);
          const pause = Math.max(
            cut.lastIndexOf("。"),
            cut.lastIndexOf("．"),
            cut.lastIndexOf(". "),
          );
          return pause > 12 ? trimmed.slice(0, pause + 1) : `${cut}…`;
        }
        return line;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  if (context.writingStyle.bulletUsage === "prefer") {
    // Convert dense semicolon/comma lists after headings into bullets when plain
    next = next.replace(
      /(^#{1,3}\s.+\n)([^#\n-][^\n]{20,200})/gm,
      (full, heading: string, body: string) => {
        if (/[。．]/.test(body) && body.includes("、")) {
          const parts = body
            .split(/[、,]/)
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length >= 3) {
            return `${heading}${parts.map((p) => `- ${p.replace(/[。．]$/, "")}`).join("\n")}`;
          }
        }
        return full;
      },
    );
  }

  if (context.writingStyle.headingDensity === "high") {
    // Promote bold-like short lines to headings when missing structure
    const lines = next.split("\n");
    const headingCount = lines.filter((l) => /^#{1,3}\s/.test(l.trim())).length;
    if (headingCount < 2) {
      next = lines
        .map((line, index) => {
          const t = line.trim();
          if (
            index > 0 &&
            t.length > 0 &&
            t.length <= 24 &&
            !t.startsWith("-") &&
            !t.startsWith("#") &&
            !/[。．]$/.test(t)
          ) {
            return `## ${t}`;
          }
          return line;
        })
        .join("\n");
    }
  }

  if (context.writingStyle.terminology) {
    for (const [from, to] of Object.entries(context.writingStyle.terminology)) {
      if (!from || !to || from === to) continue;
      next = next.split(from).join(to);
    }
  }

  if (context.writingStyle.tone === "polite" || context.writingStyle.politeness === "high") {
    next = next
      .replace(/です(?![かね])/g, "です")
      .replace(/だ。/g, "です。")
      .replace(/である。/g, "です。");
  }

  return next;
}

export function buildArtifactGeneratorOptions(
  context: PersonalizationContext,
): ArtifactGeneratorOptions {
  const primary = paletteColor(
    context.visualStyle.colorPalette,
    context.visualStyle.primaryColor,
  );

  return {
    personalization: context,
    word: {
      fontFamily: context.visualStyle.fontFamily ?? "Yu Gothic",
      marginsMm: context.visualStyle.marginsMm ?? 20,
      verbosity: context.writingStyle.verbosity,
      bulletPrefer: context.writingStyle.bulletUsage === "prefer",
      headingDensity: context.writingStyle.headingDensity,
      footerNote:
        context.deliveryPreferences.fileNamePattern != null
          ? undefined
          : undefined,
    },
    excel: {
      freezePane: context.visualStyle.freezePane ?? true,
      autoFilter: context.visualStyle.autoFilter ?? true,
      headerColor: primary,
      columnOrder: context.artifactPreferences.columnOrder,
      dateFormat: context.artifactPreferences.dateFormat ?? "YYYY-MM-DD",
      currencyFormat: context.artifactPreferences.currencyFormat ?? "¥#,##0",
      chartEnabled: context.artifactPreferences.chartEnabled ?? false,
    },
    pdf: {
      marginsMm: context.visualStyle.marginsMm ?? 18,
      fontFamily: context.visualStyle.fontFamily,
      headerFooter: context.visualStyle.headerFooter ?? true,
      pageLayout: context.structure.pageLayout ?? "standard",
    },
    powerpoint: {
      aspectRatio: context.visualStyle.aspectRatio ?? "16:9",
      primaryColor: primary,
      maxSlides: context.artifactPreferences.maxSlides,
      bulletPrefer: context.writingStyle.bulletUsage === "prefer",
      headingDensity: context.writingStyle.headingDensity,
    },
    ocr: context.artifactPreferences.ocrNormalize,
    fileNamePattern: context.deliveryPreferences.fileNamePattern,
  };
}

/** Apply naming pattern: {title}_{date} etc. */
export function applyFileNamePattern(
  baseFileName: string,
  pattern: string | undefined,
  extras?: { date?: string; category?: string },
): string {
  if (!pattern?.trim()) return baseFileName;
  const date =
    extras?.date ??
    new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return pattern
    .replace(/\{title\}/g, baseFileName)
    .replace(/\{date\}/g, date)
    .replace(/\{category\}/g, extras?.category ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || baseFileName;
}

/** OCR / Vision post-extract normalization from memory. */
export function applyOcrPersonalization(
  rows: Array<Record<string, string>>,
  context: PersonalizationContext,
): Array<Record<string, string>> {
  const prefs = context.artifactPreferences.ocrNormalize;
  if (!prefs) return rows;

  const dateRe = /(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})/;
  const amountRe = /[¥￥]?\s*([\d,]+(?:\.\d+)?)/;

  return rows.map((row) => {
    const next: Record<string, string> = { ...row };
    if (prefs.columns?.length) {
      const ordered: Record<string, string> = {};
      for (const col of prefs.columns) {
        ordered[col] = next[col] ?? "";
      }
      for (const [k, v] of Object.entries(next)) {
        if (!(k in ordered)) ordered[k] = v;
      }
      Object.assign(next, ordered);
    }
    for (const [key, value] of Object.entries(next)) {
      const keyLower = key.toLowerCase();
      const looksDate =
        /日付|date|日/.test(key) ||
        /\d{4}[\/年.-]\d{1,2}[\/月.-]\d{1,2}/.test(value) ||
        /\d{4}年\d{1,2}月\d{1,2}日/.test(value);
      const looksAmount =
        /金額|amount|price|合計|税/.test(key) ||
        /[¥￥]\s*[\d,]+/.test(value);

      if (prefs.dateFormat && looksDate) {
        const jp = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        const m = jp ?? value.match(dateRe);
        if (m) {
          const y = m[1]!;
          const mo = m[2]!.padStart(2, "0");
          const d = m[3]!.padStart(2, "0");
          next[key] =
            prefs.dateFormat === "YYYY-MM-DD"
              ? `${y}-${mo}-${d}`
              : prefs.dateFormat === "YYYY/MM/DD"
                ? `${y}/${mo}/${d}`
                : value;
        }
        continue;
      }
      if (prefs.amountFormat && looksAmount && amountRe.test(value)) {
        const m = value.match(amountRe);
        if (m) {
          const num = Number(m[1]!.replace(/,/g, ""));
          if (Number.isFinite(num) && !(keyLower.includes("日付") || looksDate && !looksAmount)) {
            next[key] =
              prefs.amountFormat === "yen"
                ? `¥${num.toLocaleString("ja-JP")}`
                : String(num);
          }
        }
      }
    }
    return next;
  });
}

export function applyVisionSummaryPersonalization(
  text: string,
  context: PersonalizationContext,
): string {
  const style = context.artifactPreferences.ocrNormalize?.summaryStyle;
  if (style === "bullets") {
    const sentences = text
      .split(/[。．\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return sentences.map((s) => `- ${s}`).join("\n");
  }
  return applyContentPersonalization(text, context);
}
