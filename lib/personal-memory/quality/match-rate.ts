import type { MemoryApplyPreviewItem } from "@/lib/personal-memory/types";
import type {
  MatchDimension,
  MatchRateBreakdown,
} from "@/lib/personal-memory/quality/types";

function bulletRatio(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return 0;
  const bullets = lines.filter(
    (l) => /^[-*・●◦\d]+[.)、]/.test(l.trim()) || /^[-*・]/.test(l.trim()),
  );
  return bullets.length / lines.length;
}

function hasEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

function isPolite(text: string): boolean {
  return /です|ます|ございます/.test(text);
}

function isConclusionFirst(text: string): boolean {
  return /結論|まず結論|要点/.test(text.slice(0, 120));
}

function wantsShort(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) =>
    /短|簡潔|length.*short|短め/i.test(`${m.summary} ${m.title}`),
  );
}

function wantsBullets(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) => /箇条書き|bullets/i.test(m.summary));
}

function wantsNoEmoji(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) => /絵文字なし|emoji.*false/i.test(m.summary));
}

function wantsPolite(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) => /敬語|丁寧/i.test(m.summary));
}

function wantsConclusionFirst(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) => /結論ファースト|conclusion_first/i.test(m.summary));
}

function wantsBlue(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) => /青|blue/i.test(m.summary));
}

function wantsPdf(memories: MemoryApplyPreviewItem[]): boolean {
  return memories.some((m) => /pdf/i.test(m.summary));
}

/**
 * Compare corrected deliverable against applied Memory preferences.
 * Returns 0–1 per dimension (null = no memory constraint for that dimension).
 */
export function computeMatchRates(input: {
  correctedText: string;
  applied: MemoryApplyPreviewItem[];
  artifactType?: string | null;
}): MatchRateBreakdown {
  const text = input.correctedText ?? "";
  const applied = input.applied ?? [];
  const artifact = (input.artifactType ?? "").toLowerCase();

  const styleScores: number[] = [];
  if (wantsNoEmoji(applied)) {
    styleScores.push(hasEmoji(text) ? 0 : 1);
  }
  if (wantsPolite(applied)) {
    styleScores.push(isPolite(text) ? 1 : 0.3);
  }
  if (wantsConclusionFirst(applied)) {
    styleScores.push(isConclusionFirst(text) ? 1 : 0.2);
  }

  const lengthExpected = wantsShort(applied);
  let lengthScore: number | null = null;
  if (lengthExpected) {
    lengthScore = text.length <= 800 ? 1 : text.length <= 1600 ? 0.6 : 0.2;
  }

  const structureExpected = wantsBullets(applied);
  let structureScore: number | null = null;
  if (structureExpected) {
    const ratio = bulletRatio(text);
    structureScore = ratio >= 0.35 ? 1 : ratio >= 0.15 ? 0.55 : 0.15;
  }

  let layoutScore: number | null = null;
  if (wantsBlue(applied)) {
    layoutScore = /青|blue|#0{0,2}[0-9a-f]{2}[89a-f]{2}/i.test(text) ? 1 : 0.4;
  }

  let formatScore: number | null = null;
  if (wantsPdf(applied)) {
    formatScore =
      artifact.includes("pdf") || /pdf/i.test(text) ? 1 : 0.5;
  }

  let destinationScore: number | null = null;
  const destMem = applied.find((m) =>
    /保存|dropbox|drive|storage/i.test(`${m.title} ${m.summary}`),
  );
  if (destMem) {
    destinationScore = 0.8; // preference present; runtime destination verified elsewhere
  }

  let templateScore: number | null = null;
  const tmpl = applied.find((m) =>
    /テンプレート|theme|word|powerpoint|excel/i.test(
      `${m.title} ${m.scope} ${m.summary}`,
    ),
  );
  if (tmpl) {
    templateScore = 0.75;
  }

  return {
    writing_style:
      styleScores.length > 0
        ? styleScores.reduce((a, b) => a + b, 0) / styleScores.length
        : null,
    structure: structureScore,
    length: lengthScore,
    layout: layoutScore,
    destination: destinationScore,
    format: formatScore,
    template: templateScore,
  };
}

export function averageMatchRate(rates: MatchRateBreakdown): number {
  const values = (Object.values(rates) as Array<number | null>).filter(
    (v): v is number => typeof v === "number",
  );
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function emptyMatchRates(): MatchRateBreakdown {
  return {
    writing_style: null,
    structure: null,
    length: null,
    layout: null,
    destination: null,
    format: null,
    template: null,
  };
}

export type { MatchDimension };
