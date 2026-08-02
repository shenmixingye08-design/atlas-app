/**
 * Rule-based deliverable Diff → preference signals.
 * Never activates memory. Never uses LLM by default.
 */

import type { PersonalMemoryScope } from "@/lib/personal-memory/types";
import { sanitizeUserFacingMemoryText } from "@/lib/personal-memory/security";

export type DiffPreferenceSignal = {
  scope: PersonalMemoryScope;
  key: string;
  title: string;
  summary: string;
  value: Record<string, unknown>;
  liked: boolean;
  strength: number;
};

function countEmoji(text: string): number {
  return (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

function avgSentenceLength(text: string): number {
  const sentences = text
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((sum, s) => sum + s.length, 0);
  return total / sentences.length;
}

function bulletRatio(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return 0;
  const bullets = lines.filter((l) => /^[-*・●◦\d]+[.)、]\s?/.test(l.trim()) || /^[-*・]/.test(l.trim()));
  return bullets.length / lines.length;
}

function headingCount(text: string): number {
  return (text.match(/^(#{1,3}\s|.+[\n\r]=+|.+[\n\r]-+)/gm) ?? []).length
    + (text.match(/【[^】]+】/g) ?? []).length;
}

function lengthDelta(before: string, after: string): number {
  if (!before.length) return 0;
  return (after.length - before.length) / before.length;
}

/**
 * Compare before/after deliverable text and extract preference signals.
 */
export function analyzeDeliverableDiff(input: {
  before: string;
  after: string;
  artifactType?: string | null;
  workCategory?: string | null;
}): DiffPreferenceSignal[] {
  const before = input.before ?? "";
  const after = input.after ?? "";
  if (!before.trim() || !after.trim()) return [];
  if (before === after) return [];

  const signals: DiffPreferenceSignal[] = [];
  const delta = lengthDelta(before, after);
  const beforeEmoji = countEmoji(before);
  const afterEmoji = countEmoji(after);
  const beforeBullets = bulletRatio(before);
  const afterBullets = bulletRatio(after);
  const beforeSent = avgSentenceLength(before);
  const afterSent = avgSentenceLength(after);
  const beforeHeadings = headingCount(before);
  const afterHeadings = headingCount(after);

  if (delta < -0.15) {
    signals.push({
      scope: "writing_style",
      key: "length",
      title: "文章の長さ",
      summary: "短めに整える",
      value: { length: "short", text: "短めに整える" },
      liked: true,
      strength: Math.min(1, Math.abs(delta)),
    });
  } else if (delta > 0.25) {
    signals.push({
      scope: "writing_style",
      key: "length",
      title: "文章の長さ",
      summary: "説明を厚めにする",
      value: { length: "detailed", text: "説明を厚めにする" },
      liked: true,
      strength: Math.min(1, delta),
    });
  }

  if (afterBullets - beforeBullets >= 0.2) {
    signals.push({
      scope: "work_content_style",
      key: "structure",
      title: "構成",
      summary: "箇条書きを多用する",
      value: { structure: "bullets", text: "箇条書きを多用する" },
      liked: true,
      strength: afterBullets - beforeBullets,
    });
  } else if (beforeBullets - afterBullets >= 0.2) {
    signals.push({
      scope: "work_content_style",
      key: "structure",
      title: "構成",
      summary: "文章中心で書く",
      value: { structure: "prose", text: "文章中心で書く" },
      liked: true,
      strength: beforeBullets - afterBullets,
    });
  }

  if (beforeEmoji > 0 && afterEmoji === 0) {
    signals.push({
      scope: "writing_style",
      key: "emoji",
      title: "絵文字",
      summary: "絵文字なし",
      value: { emoji: false, text: "絵文字なし" },
      liked: true,
      strength: 0.9,
    });
  } else if (afterEmoji > beforeEmoji + 1) {
    signals.push({
      scope: "writing_style",
      key: "emoji",
      title: "絵文字",
      summary: "絵文字を適度に使う",
      value: { emoji: true, text: "絵文字を適度に使う" },
      liked: true,
      strength: 0.6,
    });
  }

  if (beforeSent > 40 && afterSent > 0 && afterSent < beforeSent * 0.75) {
    signals.push({
      scope: "writing_style",
      key: "sentence_length",
      title: "一文の長さ",
      summary: "一文を短くする",
      value: { sentenceLength: "short", text: "一文を短くする" },
      liked: true,
      strength: 0.7,
    });
  }

  if (afterHeadings > beforeHeadings) {
    signals.push({
      scope: "document_design",
      key: "headings",
      title: "見出し構成",
      summary: "見出しを多めにする",
      value: { headings: "more", text: "見出しを多めにする" },
      liked: true,
      strength: 0.65,
    });
  }

  if (/です|ます|ございます/.test(after) && /だよ|だね|っす/.test(before) && !/だよ|だね/.test(after)) {
    signals.push({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "敬語で書く",
      value: { tone: "polite", text: "敬語で書く" },
      liked: true,
      strength: 0.8,
    });
  }

  if (/結論|まず結論|要点/.test(after.slice(0, 120)) && !/結論|まず結論/.test(before.slice(0, 120))) {
    signals.push({
      scope: "writing_style",
      key: "structure_order",
      title: "構成順",
      summary: "結論ファースト",
      value: { order: "conclusion_first", text: "結論ファースト" },
      liked: true,
      strength: 0.75,
    });
  }

  const artifact = (input.artifactType ?? "").toLowerCase();
  if (artifact.includes("pptx") || artifact.includes("powerpoint")) {
    if (/青|#0{0,2}0{0,2}[89a-f]{2}|blue/i.test(after) && !/青|blue/i.test(before)) {
      signals.push({
        scope: "powerpoint_theme",
        key: "palette",
        title: "PowerPointの色",
        summary: "青系テーマ",
        value: { palette: "blue", text: "青系テーマ" },
        liked: true,
        strength: 0.7,
      });
    }
  }
  if (artifact.includes("pdf")) {
    signals.push({
      scope: "preferred_formats",
      key: "formats",
      title: "成果物の形式",
      summary: "PDFを使う",
      value: { formats: ["pdf"], text: "PDFを使う" },
      liked: true,
      strength: 0.4,
    });
  }

  // Prefer strongest distinct scope+key
  const byKey = new Map<string, DiffPreferenceSignal>();
  for (const signal of signals) {
    const key = `${signal.scope}:${signal.key}`;
    const existing = byKey.get(key);
    if (!existing || signal.strength > existing.strength) {
      byKey.set(key, {
        ...signal,
        summary: sanitizeUserFacingMemoryText(signal.summary).slice(0, 120),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.strength - a.strength).slice(0, 6);
}

export function describeDiffSignals(signals: DiffPreferenceSignal[]): string {
  if (signals.length === 0) return "";
  return signals.map((s) => s.summary).join(" / ");
}
