/**
 * Measure user edits vs generated text. One small edit is not a strong preference.
 * Repeated edits raise confidence and may create a candidate — never auto-confirm
 * sensitive facts.
 */

import { containsSensitiveFacts, detectSensitiveFacts } from "@/lib/personal-memory/sensitive-facts";

export type EditDiffMetrics = {
  addedChars: number;
  deletedChars: number;
  replacedChars: number;
  diffRate: number;
  toneChanged: boolean;
  lengthChanged: "shorter" | "longer" | "unchanged";
  ctaChanged: boolean;
  hashtagsChanged: boolean;
  emojiChanged: boolean;
  forbiddenRemoved: string[];
  sensitiveFactKinds: string[];
  requiresExplicitConfirm: boolean;
};

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const CTA_RE = /詳しくは|お問い合わせ|こちらから|今すぐ|リンクから/g;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function lcsLength(a: string, b: string): number {
  const left = a.slice(0, 400);
  const right = b.slice(0, 400);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = new Uint16Array(cols);
  const curr = new Uint16Array(cols);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      curr[j] =
        left[i - 1] === right[j - 1]
          ? (prev[j - 1] ?? 0) + 1
          : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    prev.set(curr);
    curr.fill(0);
  }
  return prev[right.length] ?? 0;
}

export function measureEditDiff(before: string, after: string): EditDiffMetrics {
  const source = before ?? "";
  const target = after ?? "";
  const common = lcsLength(source, target);
  const deletedChars = Math.max(0, source.length - common);
  const addedChars = Math.max(0, target.length - common);
  const replacedChars = Math.min(deletedChars, addedChars);
  const denom = Math.max(source.length, target.length, 1);
  const diffRate = Number(((deletedChars + addedChars) / denom).toFixed(4));

  const sourcePolite = /です|ます|ございます/.test(source);
  const targetPolite = /です|ます|ございます/.test(target);
  const sourceCasual = /だよ|だね|だよね|！/.test(source);
  const targetCasual = /だよ|だね|だよね|！/.test(target);
  const toneChanged =
    sourcePolite !== targetPolite || sourceCasual !== targetCasual;

  const lengthChanged =
    target.length < source.length * 0.9
      ? "shorter"
      : target.length > source.length * 1.1
        ? "longer"
        : "unchanged";

  const ctaChanged = countMatches(source, CTA_RE) !== countMatches(target, CTA_RE);
  const hashtagsChanged =
    countMatches(source, HASHTAG_RE) !== countMatches(target, HASHTAG_RE);
  const emojiChanged = countMatches(source, EMOJI_RE) !== countMatches(target, EMOJI_RE);

  const forbiddenHints = ["煽り", "絶対", "今だけ", "限定"];
  const forbiddenRemoved = forbiddenHints.filter(
    (word) => source.includes(word) && !target.includes(word),
  );

  const sensitiveFactKinds = detectSensitiveFacts(`${source}\n${target}`);
  const addedText = target.length > source.length ? target.slice(source.length) : target;
  const requiresExplicitConfirm =
    containsSensitiveFacts(addedText) ||
    (containsSensitiveFacts(target) && !containsSensitiveFacts(source));

  return {
    addedChars,
    deletedChars,
    replacedChars,
    diffRate,
    toneChanged,
    lengthChanged,
    ctaChanged,
    hashtagsChanged,
    emojiChanged,
    forbiddenRemoved,
    sensitiveFactKinds,
    requiresExplicitConfirm,
  };
}

export function preferenceTextFromEditDiff(metrics: EditDiffMetrics): string {
  const parts: string[] = [];
  if (metrics.lengthChanged === "shorter") parts.push("もっと短くして");
  if (metrics.lengthChanged === "longer") parts.push("もう少し詳しく");
  if (metrics.toneChanged) parts.push("丁寧に");
  if (metrics.emojiChanged && metrics.deletedChars > 0) parts.push("絵文字なし");
  if (metrics.hashtagsChanged) parts.push("ハッシュタグを見直して");
  if (metrics.ctaChanged) parts.push("CTAを合わせて");
  if (metrics.forbiddenRemoved.length > 0) {
    parts.push(`この言い回しは嫌`);
  }
  return [...new Set(parts)].join("、");
}

export function shouldProposeEditCandidate(input: {
  metrics: EditDiffMetrics;
  repeatCount: number;
}): { propose: boolean; confidence: number } {
  const { metrics, repeatCount } = input;
  if (metrics.diffRate < 0.04 && !metrics.toneChanged && metrics.forbiddenRemoved.length === 0) {
    return { propose: false, confidence: 0.2 };
  }
  if (metrics.requiresExplicitConfirm) {
    return { propose: true, confidence: Math.min(0.7, 0.45 + repeatCount * 0.08) };
  }
  if (repeatCount < 2) {
    return { propose: false, confidence: 0.35 + metrics.diffRate * 0.2 };
  }
  return {
    propose: true,
    confidence: Math.min(0.88, 0.5 + repeatCount * 0.1 + Math.min(0.2, metrics.diffRate)),
  };
}
