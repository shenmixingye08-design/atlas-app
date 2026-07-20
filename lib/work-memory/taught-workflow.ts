/**
 * Taught workflow stored inside Work Memory template.structuredData.
 * Extends existing template records — no new persistence system.
 */

export type TaughtWorkflowStep = {
  id: string;
  title: string;
  description: string;
  ai: string;
  service: string;
  needsReview: boolean;
  canAutoRun: boolean;
};

export const TAUGHT_WORKFLOW_KIND = "taught_workflow" as const;

export const TEACH_AI_OPTIONS = [
  "MINERVOT",
  "資料作成",
  "文章作成",
  "分析",
  "整理",
] as const;

export const TEACH_SERVICE_OPTIONS = [
  { id: "atlas", label: "MINERVOT" },
  { id: "google_drive", label: "Google Drive" },
  { id: "gmail", label: "Gmail" },
  { id: "google_calendar", label: "Google Calendar" },
  { id: "sns", label: "SNS" },
  { id: "manual", label: "手動" },
] as const;

export function createEmptyTaughtStep(
  index = 0,
): TaughtWorkflowStep {
  return {
    id: `step-${Date.now()}-${index}`,
    title: "",
    description: "",
    ai: "MINERVOT",
    service: "atlas",
    needsReview: false,
    canAutoRun: true,
  };
}

export function isTaughtWorkflowData(
  data: Record<string, unknown> | null | undefined,
): boolean {
  return data?.kind === TAUGHT_WORKFLOW_KIND;
}

export function parseTaughtSteps(
  data: Record<string, unknown> | null | undefined,
): TaughtWorkflowStep[] {
  if (!data || data.kind !== TAUGHT_WORKFLOW_KIND) return [];
  const raw = data.steps;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return null;
      return {
        id:
          typeof row.id === "string" && row.id.trim()
            ? row.id
            : `step-${index + 1}`,
        title,
        description:
          typeof row.description === "string" ? row.description.trim() : "",
        ai: typeof row.ai === "string" && row.ai.trim() ? row.ai : "MINERVOT",
        service:
          typeof row.service === "string" && row.service.trim()
            ? row.service
            : "atlas",
        needsReview: row.needsReview === true,
        canAutoRun: row.canAutoRun !== false,
      } satisfies TaughtWorkflowStep;
    })
    .filter((step): step is TaughtWorkflowStep => step !== null);
}

export function buildTaughtAssignment(input: {
  title: string;
  description: string;
  steps: TaughtWorkflowStep[];
}): string {
  const lines: string[] = [];
  lines.push(`【仕事】${input.title.trim()}`);
  if (input.description.trim()) {
    lines.push(input.description.trim());
  }
  lines.push("");
  lines.push("【教えていただいた流れ】");
  input.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.title}`);
    if (step.description) lines.push(`   ${step.description}`);
    lines.push(`   利用AI: ${step.ai} / サービス: ${serviceLabel(step.service)}`);
    lines.push(
      `   確認: ${step.needsReview ? "必要" : "不要"} / 自動実行: ${step.canAutoRun ? "可" : "不可"}`,
    );
  });
  return lines.join("\n").trim();
}

export function serviceLabel(serviceId: string): string {
  return (
    TEACH_SERVICE_OPTIONS.find((item) => item.id === serviceId)?.label ??
    serviceId
  );
}

export function buildTaughtStructuredData(input: {
  title: string;
  description: string;
  steps: TaughtWorkflowStep[];
  autoUpdate?: boolean;
}): Record<string, unknown> {
  const assignmentPattern = buildTaughtAssignment(input);
  return {
    kind: TAUGHT_WORKFLOW_KIND,
    version: 1,
    assignmentPattern,
    stepCount: input.steps.length,
    autoUpdate: input.autoUpdate === true,
    steps: input.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      ai: step.ai,
      service: step.service,
      needsReview: step.needsReview,
      canAutoRun: step.canAutoRun,
    })),
  };
}

export function assignmentFromLearnedMemory(memory: {
  title: string;
  summary: string;
  structuredData: Record<string, unknown>;
}): string {
  const pattern = memory.structuredData?.assignmentPattern;
  if (typeof pattern === "string" && pattern.trim()) return pattern.trim();
  const steps = parseTaughtSteps(memory.structuredData);
  if (steps.length > 0) {
    return buildTaughtAssignment({
      title: memory.title,
      description: memory.summary,
      steps,
    });
  }
  return memory.summary.trim() || memory.title.trim();
}
