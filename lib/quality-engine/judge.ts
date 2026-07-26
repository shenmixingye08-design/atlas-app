import type { Deliverable } from "@/lib/orchestration/deliverable-types";
import type { QualityCriterionScores } from "@/lib/orchestration/parse-quality";

import { QUALITY_JUDGE_PASS_SCORE } from "./policy";
import type {
  QualityJudgeCriteria,
  QualityJudgeResult,
  QualityPromptKind,
} from "./types";

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return clamp(values.reduce((a, b) => a + b, 0) / values.length);
}

function headingCount(markdown: string): number {
  return (markdown.match(/^#{1,3}\s+/gm) ?? []).length;
}

function toLegacyCriteria(c: QualityJudgeCriteria): QualityCriterionScores {
  return {
    accuracy: average([c.expertise, c.information]),
    completeness: c.completeness,
    logic: average([c.persuasiveness, c.structure]),
    readability: average([c.readability, c.naturalness]),
    professionalism: average([c.expertise, c.naturalness]),
    visualStructure: average([c.design, c.structure]),
  };
}

function extractJson(output: string): Record<string, unknown> | null {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? output).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Deterministic Quality Judge — no LLM. Used for all tiers; LLM may refine on full. */
export function runRulesQualityJudge(input: {
  deliverable: Deliverable;
  kind: QualityPromptKind;
  requiredSectionTitles?: readonly string[];
  hasBusinessProfile?: boolean;
  hasVision?: boolean;
}): QualityJudgeResult {
  const started = Date.now();
  const body = (input.deliverable.content || input.deliverable.markdown).trim();
  const md = input.deliverable.markdown.trim() || body;
  const titles = input.requiredSectionTitles ?? [];
  const missingSections = titles.filter(
    (title) => !md.includes(title) && !body.includes(title),
  );

  const lengthScore =
    body.length >= 1_200 ? 95 : body.length >= 600 ? 80 : body.length >= 250 ? 65 : 40;
  const headings = headingCount(md);
  const structureScore =
    headings >= Math.max(3, Math.floor(titles.length * 0.6))
      ? 92
      : headings >= 2
        ? 75
        : 50;
  const readabilityScore = /。|！|\./.test(body) && !/\n{4,}/.test(md) ? 88 : 60;
  const naturalnessScore =
    !/as an AI|I'm sorry|生成AIとして/i.test(body) && body.length > 80 ? 90 : 55;
  const expertiseScore = input.hasBusinessProfile ? 88 : 72;
  const designScore = /^#\s+/m.test(md) || headings >= 3 ? 85 : 60;
  const informationScore =
    body.length >= 400 && input.deliverable.summary.trim().length > 20 ? 86 : 58;
  const persuasivenessScore =
    input.kind === "sns" || input.kind === "blog"
      ? readabilityScore
      : /提案|メリット|効果|結論|おすすめ/.test(body)
        ? 84
        : 68;
  const completenessScore =
    missingSections.length === 0
      ? clamp(lengthScore + (input.deliverable.title.trim() ? 5 : -15))
      : clamp(55 - missingSections.length * 8);

  if (input.hasVision && /矛盾|不一致/.test(body)) {
    // light penalty only — Vision contradiction wording in body is rare
  }

  const criteria: QualityJudgeCriteria = {
    completeness: clamp(completenessScore),
    readability: clamp(readabilityScore),
    persuasiveness: clamp(persuasivenessScore),
    naturalness: clamp(naturalnessScore),
    expertise: clamp(expertiseScore),
    design: clamp(designScore),
    structure: clamp(structureScore),
    information: clamp(informationScore),
  };

  const overallScore = average(Object.values(criteria));
  const feedbackParts = [
    `品質スコア: ${overallScore}/100`,
    missingSections.length
      ? `不足セクション: ${missingSections.join(", ")}`
      : "主要セクションは揃っています。",
    overallScore >= QUALITY_JUDGE_PASS_SCORE
      ? "専門家水準に近い完成度です。"
      : "読みやすさ・構成・情報量を中心に改善してください。",
  ];

  return {
    overallScore,
    criteria,
    legacyCriteria: toLegacyCriteria(criteria),
    passed: overallScore >= QUALITY_JUDGE_PASS_SCORE && missingSections.length <= 1,
    feedback: feedbackParts.join("\n"),
    weakSections: missingSections.slice(0, 5),
    source: "rules",
    durationMs: Date.now() - started,
  };
}

export function parseLlmQualityJudge(
  output: string,
  fallback: QualityJudgeResult,
): QualityJudgeResult {
  const started = Date.now();
  const parsed = extractJson(output);
  if (!parsed) {
    return { ...fallback, source: "hybrid", durationMs: fallback.durationMs + (Date.now() - started) };
  }

  const rawCriteria = (parsed.criteria ?? {}) as Record<string, unknown>;
  const criteria: QualityJudgeCriteria = {
    completeness: clamp(Number(rawCriteria.completeness ?? fallback.criteria.completeness)),
    readability: clamp(Number(rawCriteria.readability ?? fallback.criteria.readability)),
    persuasiveness: clamp(
      Number(rawCriteria.persuasiveness ?? fallback.criteria.persuasiveness),
    ),
    naturalness: clamp(Number(rawCriteria.naturalness ?? fallback.criteria.naturalness)),
    expertise: clamp(Number(rawCriteria.expertise ?? fallback.criteria.expertise)),
    design: clamp(Number(rawCriteria.design ?? fallback.criteria.design)),
    structure: clamp(Number(rawCriteria.structure ?? fallback.criteria.structure)),
    information: clamp(Number(rawCriteria.information ?? fallback.criteria.information)),
  };
  const overallScore = clamp(
    Number(parsed.overallScore ?? average(Object.values(criteria))),
  );
  const weakSections = Array.isArray(parsed.weakSections)
    ? parsed.weakSections.map(String).slice(0, 8)
    : fallback.weakSections;

  return {
    overallScore,
    criteria,
    legacyCriteria: toLegacyCriteria(criteria),
    passed: overallScore >= QUALITY_JUDGE_PASS_SCORE,
    feedback:
      typeof parsed.feedback === "string" && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : fallback.feedback,
    weakSections,
    source: "hybrid",
    durationMs: fallback.durationMs + (Date.now() - started),
  };
}
