/**
 * Instruction reduction + preference apply contracts.
 * Deterministic — no extra LLM. Measure and strip restated prefs
 * that are already satisfied by saved Preference.
 */

import { compareMemoryQuality } from "@/lib/memory-apply/quality-diff";
import type { ResolvedMemoryValue } from "@/lib/personal-memory/types";
import { parseXSocialPreferenceFromText } from "@/lib/memory-apply/x-social-preference";

export type InstructionReductionInput = {
  instructionCharsBefore: number;
  instructionCharsAfter: number;
  correctionCountBefore: number;
  correctionCountAfter: number;
  beforeBody: string;
  afterBody: string;
  memoryAppliedCount: number;
  expectedChannel: string;
  appliedChannels: readonly string[];
};

export type InstructionReductionResult = {
  instructionCharDelta: number;
  instructionReductionRate: number;
  correctionCountDelta: number;
  diffRate: number;
  memoryAppliedCount: number;
  channelScopeCorrect: boolean;
};

export function measureMemoryApplyDelta(
  input: InstructionReductionInput,
): InstructionReductionResult {
  const instructionCharDelta =
    input.instructionCharsAfter - input.instructionCharsBefore;
  const instructionReductionRate =
    input.instructionCharsBefore <= 0
      ? 0
      : Number(
          Math.max(
            0,
            (input.instructionCharsBefore - input.instructionCharsAfter) /
              input.instructionCharsBefore,
          ).toFixed(4),
        );
  const quality = compareMemoryQuality({
    before: input.beforeBody,
    after: input.afterBody,
    memoryMode: input.memoryAppliedCount > 0 ? "on" : "off",
  });
  const diffRate = Number((1 - quality.overlapRatio).toFixed(4));
  const expected = input.expectedChannel.toLowerCase();
  const channelScopeCorrect =
    input.appliedChannels.length === 0 ||
    input.appliedChannels.some(
      (channel) =>
        channel.toLowerCase() === expected ||
        channel.toLowerCase() === "artifact" ||
        channel.toLowerCase() === "global",
    );

  return {
    instructionCharDelta,
    instructionReductionRate,
    correctionCountDelta:
      input.correctionCountAfter - input.correctionCountBefore,
    diffRate,
    memoryAppliedCount: input.memoryAppliedCount,
    channelScopeCorrect,
  };
}

/** Preference items a user would otherwise restate every time. */
export type InstructionPreferenceItem = {
  key: string;
  label: string;
  pattern: RegExp;
};

export const INSTRUCTION_PREFERENCE_ITEMS: readonly InstructionPreferenceItem[] =
  [
    { key: "length:short", label: "短め", pattern: /もっと短くして|短めに|短めで|短くして|簡潔に|短めの|短文/ },
    { key: "length:long", label: "詳しく", pattern: /詳しく|詳細に|長めに|長くして|長文/ },
    { key: "tone:polite", label: "丁寧", pattern: /丁寧に|丁寧な|敬語で|敬語/ },
    { key: "tone:casual", label: "カジュアル", pattern: /カジュアルに|カジュアルな/ },
    { key: "structure:bullets", label: "箇条書き", pattern: /箇条書き|ブレット|ポイントで整理/ },
    { key: "structure:headings", label: "見出し", pattern: /見出しを(入れて|つけて)|見出しあり/ },
    { key: "headingCount", label: "見出し数", pattern: /見出し\s*(?:は|を)?\s*\d+\s*つ/ },
    { key: "hashtags:max", label: "ハッシュタグ数", pattern: /ハッシュタグ\s*(?:は|最大)?\s*\d+\s*個/ },
    { key: "hashtags:none", label: "ハッシュタグなし", pattern: /ハッシュタグ(なし|無し|不要|やめて)/ },
    { key: "emoji:none", label: "絵文字なし", pattern: /絵文字(なし|無し|やめて|を使わない)/ },
    { key: "emoji:few", label: "絵文字少なめ", pattern: /絵文字(少なめ|控えめ)/ },
    { key: "format:docx", label: "Word", pattern: /wordで|ワードで|docx|\.docx|wordファイル|ワードファイル/i },
    { key: "format:xlsx", label: "Excel", pattern: /excelで|エクセルで|xlsx|\.xlsx/i },
    { key: "format:pptx", label: "PowerPoint", pattern: /powerpointで|パワーポイントで|パワポで|pptx/i },
    { key: "format:pdf", label: "PDF", pattern: /pdfで|ｐｄｆで/i },
    { key: "conclusion:first", label: "結論先", pattern: /結論を最初|結論を先|結論から|結論先/ },
    { key: "template", label: "テンプレート", pattern: /いつもの(形式|テンプレ|テンプレート)|同じ(構成|フォーマット)/ },
  ] as const;

const OVERRIDE_SPLIT_RE = /今回は|今回だけ|今日は|今日だけ|この回だけ|今回に限って/;

export function detectInstructionPreferenceItems(text: string): string[] {
  const hay = text.trim();
  if (!hay) return [];
  const keys: string[] = [];
  for (const item of INSTRUCTION_PREFERENCE_ITEMS) {
    if (item.pattern.test(hay)) keys.push(item.key);
  }
  return [...new Set(keys)];
}

export function splitStandingAndOverride(text: string): {
  standing: string;
  override: string;
  hasOverride: boolean;
} {
  const match = text.match(OVERRIDE_SPLIT_RE);
  if (!match || match.index == null) {
    return { standing: text, override: "", hasOverride: false };
  }
  return {
    standing: text.slice(0, match.index).trim(),
    override: text.slice(match.index).trim(),
    hasOverride: true,
  };
}

export function parseExplicitOverrideFromText(
  text: string,
): {
  length?: "short" | "long";
  headingCount?: number;
  tone?: string;
  format?: "docx" | "xlsx" | "pptx" | "pdf";
} {
  const { override, hasOverride } = splitStandingAndOverride(text);
  if (!hasOverride) return {};
  const x = parseXSocialPreferenceFromText(override);
  const heading = override.match(/見出し\s*(?:は|を)?\s*(\d+)\s*つ/);
  const out: {
    length?: "short" | "long";
    headingCount?: number;
    tone?: string;
    format?: "docx" | "xlsx" | "pptx" | "pdf";
  } = {};
  if (x.length === "short" || x.length === "long") out.length = x.length;
  if (x.tone) out.tone = x.tone;
  if (heading) out.headingCount = Number.parseInt(heading[1]!, 10);
  if (/word|ワード|docx/i.test(override)) out.format = "docx";
  else if (/excel|エクセル|xlsx/i.test(override)) out.format = "xlsx";
  else if (/powerpoint|パワポ|pptx/i.test(override)) out.format = "pptx";
  else if (/pdf/i.test(override)) out.format = "pdf";
  return out;
}

export function savedPreferenceKeysFromValues(
  values: readonly ResolvedMemoryValue[],
): string[] {
  const keys = new Set<string>();
  for (const row of values) {
    const v = row.value;
    const hay = [
      row.key,
      row.summary,
      typeof v.text === "string" ? v.text : "",
      typeof v.length === "string" ? v.length : "",
      typeof v.structure === "string" ? v.structure : "",
      typeof v.tone === "string" ? v.tone : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (v.length === "short" || /短め|短く|簡潔/.test(hay)) keys.add("length:short");
    if (v.length === "long" || /長文|詳しく/.test(hay)) keys.add("length:long");
    if (v.tone === "polite" || /丁寧|敬語/.test(hay)) keys.add("tone:polite");
    if (v.tone === "casual") keys.add("tone:casual");
    if (v.structure === "bullets" || /箇条書き/.test(hay)) {
      keys.add("structure:bullets");
    }
    if (v.headings === true || v.structure === "headings" || /見出し/.test(hay)) {
      keys.add("structure:headings");
    }
    if (typeof v.headingCount === "number" && v.headingCount > 0) {
      keys.add("headingCount");
    }
    if (typeof v.hashtagsMax === "number") keys.add("hashtags:max");
    if (v.hashtags === "none") keys.add("hashtags:none");
    if (v.emoji === "none") keys.add("emoji:none");
    if (v.emoji === "few") keys.add("emoji:few");
    if (v.conclusion === "first") keys.add("conclusion:first");
    const formats = Array.isArray(v.formats) ? v.formats : [];
    for (const format of formats) {
      const normalized = String(format).toLowerCase();
      if (normalized === "docx" || normalized === "word") keys.add("format:docx");
      if (normalized === "xlsx" || normalized === "excel") keys.add("format:xlsx");
      if (normalized === "pptx" || normalized === "powerpoint") {
        keys.add("format:pptx");
      }
      if (normalized === "pdf") keys.add("format:pdf");
    }
    if (row.scope === "preferred_formats") {
      if (/docx|word|ワード/i.test(hay)) keys.add("format:docx");
      if (/xlsx|excel|エクセル/i.test(hay)) keys.add("format:xlsx");
      if (/pptx|powerpoint|パワポ/i.test(hay)) keys.add("format:pptx");
      if (/pdf/i.test(hay)) keys.add("format:pdf");
    }
  }
  return [...keys];
}

export type StripKnownPreferencesResult = {
  text: string;
  strippedKeys: string[];
  restatedItemsBefore: string[];
  restatedItemsAfter: string[];
  overrideKeys: string[];
};

/**
 * Remove phrases already satisfied by saved Preference.
 * Never strips this-turn override ("今回は詳しく").
 */
export function stripKnownPreferencesFromInstruction(input: {
  instruction: string;
  savedKeys?: readonly string[];
  values?: readonly ResolvedMemoryValue[];
}): StripKnownPreferencesResult {
  const instruction = input.instruction ?? "";
  const saved = new Set(
    input.savedKeys ??
      (input.values ? savedPreferenceKeysFromValues(input.values) : []),
  );
  const { standing, override, hasOverride } = splitStandingAndOverride(
    instruction,
  );
  const overrideKeys = hasOverride
    ? detectInstructionPreferenceItems(override)
    : [];
  const restatedItemsBefore = detectInstructionPreferenceItems(instruction);

  let next = standing;
  const strippedKeys: string[] = [];
  for (const item of INSTRUCTION_PREFERENCE_ITEMS) {
    if (!saved.has(item.key)) continue;
    if (overrideKeys.includes(item.key)) continue;
    if (!item.pattern.test(next)) continue;
    const replaced = next.replace(item.pattern, " ");
    if (replaced !== next) {
      strippedKeys.push(item.key);
      next = replaced;
    }
  }

  next = next
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([。、，,.])/g, "$1")
    .replace(/^[、。\s]+|[、。\s]+$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const combined = [next, override].filter(Boolean).join(" ").trim();
  const restatedItemsAfter = detectInstructionPreferenceItems(combined);

  return {
    text: combined || instruction.trim(),
    strippedKeys: [...new Set(strippedKeys)],
    restatedItemsBefore,
    restatedItemsAfter,
    overrideKeys,
  };
}

export function preferenceApplicationRate(input: {
  expectedKeys: readonly string[];
  appliedKeys: readonly string[];
}): number {
  if (input.expectedKeys.length === 0) return 1;
  const applied = new Set(input.appliedKeys);
  const hit = input.expectedKeys.filter((key) => applied.has(key)).length;
  return Number((hit / input.expectedKeys.length).toFixed(4));
}

export function describePreferenceLabels(keys: readonly string[]): string[] {
  const labels: string[] = [];
  for (const key of keys) {
    const item = INSTRUCTION_PREFERENCE_ITEMS.find((row) => row.key === key);
    if (item && !labels.includes(item.label)) labels.push(item.label);
  }
  return labels;
}

/**
 * Lightweight user-facing line. Do not lead with the word Memory.
 */
export function buildPreferenceAppliedNotice(
  labels: readonly string[],
): string | null {
  if (labels.length === 0) return null;
  if (labels.length <= 3) {
    return `前回の好みを反映しました（${labels.join("、")}）`;
  }
  return "前回の好みを反映しました";
}
