import {
  getCompanyQualityPassThreshold,
  resolveCompanyTemplateIdFromMetadata,
} from "@/lib/company-templates/context";

/** Minimum overall score (0–100) required before CEO final approval. */
export const QUALITY_PASS_THRESHOLD = 95;

/** Maximum revision cycles when QA score is below threshold. */
export const MAX_QUALITY_REVISIONS = 3;

export type QualityCriterionKey =
  | "accuracy"
  | "completeness"
  | "logic"
  | "readability"
  | "professionalism"
  | "visualStructure";

export type QualityCriterionScores = Record<QualityCriterionKey, number>;

export type ParsedQualityReview = {
  overallScore: number;
  criteria: QualityCriterionScores;
  feedback: string;
  tasksNeedingRevision: number[];
  rawOutput: string;
};

const DEFAULT_CRITERIA: QualityCriterionScores = {
  accuracy: 0,
  completeness: 0,
  logic: 0,
  readability: 0,
  professionalism: 0,
  visualStructure: 0,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function averageCriteria(criteria: QualityCriterionScores): number {
  const values = Object.values(criteria);
  if (values.length === 0) return 0;
  return clampScore(values.reduce((sum, score) => sum + score, 0) / values.length);
}

function normalizeCriteria(
  input: Partial<Record<string, number>> | undefined,
): QualityCriterionScores {
  if (!input) return { ...DEFAULT_CRITERIA };

  return {
    accuracy: clampScore(input.accuracy ?? input.Accuracy ?? 0),
    completeness: clampScore(input.completeness ?? input.Completeness ?? 0),
    logic: clampScore(input.logic ?? input.Logic ?? 0),
    readability: clampScore(input.readability ?? input.Readability ?? 0),
    professionalism: clampScore(
      input.professionalism ?? input.Professionalism ?? 0,
    ),
    visualStructure: clampScore(
      input.visualStructure ??
        input.visual_structure ??
        input["visual structure"] ??
        0,
    ),
  };
}

function extractJsonBlock(output: string): unknown | null {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? output.trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseTasksNeedingRevision(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Number.parseInt(String(item), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function parseScoreFromText(output: string): number | null {
  const patterns = [
    /overall\s*score\s*[:：]\s*(\d{1,3})/i,
    /total\s*score\s*[:：]\s*(\d{1,3})/i,
    /score\s*[:：]\s*(\d{1,3})\s*\/\s*100/i,
    /(\d{1,3})\s*\/\s*100/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1]) {
      return clampScore(Number.parseInt(match[1], 10));
    }
  }

  return null;
}

/** Parse structured QA output into scores and revision hints. */
export function parseQualityReviewOutput(output: string): ParsedQualityReview {
  const rawOutput = output.trim();
  const parsed = extractJsonBlock(rawOutput) as
    | {
        overallScore?: number;
        overall_score?: number;
        score?: number;
        criteria?: Partial<Record<string, number>>;
        feedback?: string;
        tasksNeedingRevision?: unknown;
        tasks_needing_revision?: unknown;
      }
    | null;

  if (parsed) {
    const criteria = normalizeCriteria(parsed.criteria);
    const overallScore = clampScore(
      parsed.overallScore ??
        parsed.overall_score ??
        parsed.score ??
        averageCriteria(criteria),
    );

    return {
      overallScore,
      criteria,
      feedback:
        parsed.feedback?.trim() ||
        rawOutput.replace(/```[\s\S]*?```/g, "").trim(),
      tasksNeedingRevision: parseTasksNeedingRevision(
        parsed.tasksNeedingRevision ?? parsed.tasks_needing_revision,
      ),
      rawOutput,
    };
  }

  const fallbackScore = parseScoreFromText(rawOutput) ?? 0;

  return {
    overallScore: fallbackScore,
    criteria: { ...DEFAULT_CRITERIA, readability: fallbackScore },
    feedback: rawOutput,
    tasksNeedingRevision: [],
    rawOutput,
  };
}

export function resolveQualityPassThreshold(
  metadata?: Readonly<Record<string, unknown>>,
): number {
  const fromMetadata = metadata?.qualityCriteria;
  if (
    typeof fromMetadata === "object" &&
    fromMetadata !== null &&
    "passThreshold" in fromMetadata &&
    typeof (fromMetadata as { passThreshold: unknown }).passThreshold === "number"
  ) {
    return (fromMetadata as { passThreshold: number }).passThreshold;
  }

  return getCompanyQualityPassThreshold(
    resolveCompanyTemplateIdFromMetadata(metadata),
  );
}

export function qualityReviewPassed(
  score: number,
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  return score >= resolveQualityPassThreshold(metadata);
}
