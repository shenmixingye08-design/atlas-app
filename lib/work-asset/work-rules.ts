/**
 * VALUE 8 — work rules with explicit layers.
 * CURRENT > WORK > TASK TYPE > GLOBAL > DEFAULT
 */

export type WorkRuleLayer =
  | "current"
  | "work"
  | "task_type"
  | "global"
  | "default";

export type WorkRuleSet = {
  length?: "short" | "long" | "neutral";
  headingCount?: number | null;
  format?: "docx" | "xlsx" | "pptx" | "pdf" | null;
  tone?: "polite" | "casual" | "neutral";
  hashtagsMax?: number | null;
  currency?: "jpy" | null;
  guessNumbers?: boolean;
};

export type ResolvedWorkRule<K extends keyof WorkRuleSet> = {
  key: K;
  value: WorkRuleSet[K];
  layer: WorkRuleLayer;
};

const LAYER_ORDER: readonly WorkRuleLayer[] = [
  "current",
  "work",
  "task_type",
  "global",
  "default",
];

export function resolveWorkRule<K extends keyof WorkRuleSet>(input: {
  key: K;
  current?: WorkRuleSet[K];
  work?: WorkRuleSet[K];
  taskType?: WorkRuleSet[K];
  global?: WorkRuleSet[K];
  defaultValue: WorkRuleSet[K];
}): ResolvedWorkRule<K> {
  for (const layer of LAYER_ORDER) {
    if (layer === "default") {
      return { key: input.key, value: input.defaultValue, layer };
    }
    const value = input[layer === "task_type" ? "taskType" : layer];
    if (value !== undefined && value !== null) {
      return { key: input.key, value, layer };
    }
  }
  return { key: input.key, value: input.defaultValue, layer: "default" };
}

export function resolveWorkRules(input: {
  current?: WorkRuleSet;
  work?: WorkRuleSet;
  taskType?: WorkRuleSet;
  global?: WorkRuleSet;
}): {
  length: ResolvedWorkRule<"length">;
  headingCount: ResolvedWorkRule<"headingCount">;
  format: ResolvedWorkRule<"format">;
  tone: ResolvedWorkRule<"tone">;
} {
  return {
    length: resolveWorkRule({
      key: "length",
      current: input.current?.length,
      work: input.work?.length,
      taskType: input.taskType?.length,
      global: input.global?.length,
      defaultValue: "neutral",
    }),
    headingCount: resolveWorkRule({
      key: "headingCount",
      current: input.current?.headingCount,
      work: input.work?.headingCount,
      taskType: input.taskType?.headingCount,
      global: input.global?.headingCount,
      defaultValue: null,
    }),
    format: resolveWorkRule({
      key: "format",
      current: input.current?.format,
      work: input.work?.format,
      taskType: input.taskType?.format,
      global: input.global?.format,
      defaultValue: null,
    }),
    tone: resolveWorkRule({
      key: "tone",
      current: input.current?.tone,
      work: input.work?.tone,
      taskType: input.taskType?.tone,
      global: input.global?.tone,
      defaultValue: "neutral",
    }),
  };
}

export function describeWorkRules(resolved: ReturnType<typeof resolveWorkRules>): string[] {
  const lines: string[] = [];
  if (resolved.length.value === "short") lines.push("短め");
  if (resolved.length.value === "long") lines.push("詳しく");
  if (resolved.tone.value === "polite") lines.push("敬語");
  if (resolved.format.value === "pdf") lines.push("PDF");
  if (resolved.format.value === "docx") lines.push("Word");
  if (resolved.headingCount.value) lines.push(`見出し${resolved.headingCount.value}つ`);
  return lines;
}

export type WorkRuleGenre = "x_post" | "excel" | "word" | "report";

export function isRuleAllowedForGenre(
  genre: WorkRuleGenre,
  ruleKey: keyof WorkRuleSet,
): boolean {
  if (genre === "x_post") {
    return ruleKey !== "currency" && ruleKey !== "headingCount";
  }
  if (genre === "excel") {
    return ruleKey !== "hashtagsMax";
  }
  return true;
}
