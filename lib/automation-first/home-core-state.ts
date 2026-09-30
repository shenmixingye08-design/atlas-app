/**
 * Home "AI core" status — derived only from real home data.
 * Never invent progress: every state maps to counts the home already loaded.
 */

import type { AutomationRun } from "@/lib/automation-platform/types";

export type HomeCoreStateKind =
  | "completed"
  | "checking"
  | "attention"
  | "running"
  | "scheduled"
  | "idle";

export type HomeCoreState = {
  kind: HomeCoreStateKind;
  /** Short status label shown next to the core. */
  label: string;
  /** One supporting line (may be null). */
  detail: string | null;
  /** Where the status line leads (null = not a link). */
  href: string | null;
};

/** A run observed as running earlier in this session that has now succeeded. */
export type HomeCompletedRun = {
  runId: string;
  title: string;
  artifactLabel: string | null;
  href: string;
};

/** Poll interval while work is running (only then; never when idle). */
export const HOME_LIVE_REFRESH_MS = 20_000;
/** How long the completion moment stays on the core. */
export const HOME_COMPLETED_HOLD_MS = 6_000;

const ACTIVE_RUN_STATUSES = new Set<AutomationRun["status"]>([
  "running",
  "queued",
  "retrying",
  "preparing",
]);

export function activeRunIds(runs: readonly AutomationRun[]): Set<string> {
  return new Set(
    runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).map((run) => run.id),
  );
}

/**
 * Only a run we saw active before and that is now fully `succeeded` counts.
 * Partial success / failure never celebrates (attention covers those).
 */
export function findNewlyCompletedRun(
  previouslyActive: ReadonlySet<string>,
  runs: readonly AutomationRun[],
): HomeCompletedRun | null {
  if (previouslyActive.size === 0) return null;
  const run = runs.find(
    (item) => previouslyActive.has(item.id) && item.status === "succeeded",
  );
  if (!run) return null;
  const artifact = run.artifacts[0] ?? null;
  return {
    runId: run.id,
    title: run.automationName,
    artifactLabel: artifact?.label ?? null,
    href: `/automations/runs/${encodeURIComponent(run.id)}${
      artifact ? `#artifact-${encodeURIComponent(artifact.id)}` : ""
    }`,
  };
}

export type HomeCoreStateInput = {
  /** Set briefly after a run finishes while the home is open. */
  justCompleted?: HomeCompletedRun | null;
  /** Ops data is still loading and nothing is known yet. */
  checking: boolean;
  attentionCount: number;
  runningCount: number;
  /** First running job title, when known. */
  runningTitle?: string | null;
  nextRun?: { name: string; whenLabel: string | null } | null;
  entrustedCount: number;
};

export function deriveHomeCoreState(input: HomeCoreStateInput): HomeCoreState {
  if (input.justCompleted) {
    return {
      kind: "completed",
      label: `「${input.justCompleted.title}」が完成しました`,
      detail: input.justCompleted.artifactLabel ?? "結果を確認できます",
      href: input.justCompleted.href,
    };
  }
  if (input.checking) {
    return {
      kind: "checking",
      label: "状況を確認しています",
      detail: null,
      href: null,
    };
  }
  if (input.attentionCount > 0) {
    return {
      kind: "attention",
      label: `確認が必要な仕事が${input.attentionCount}件あります`,
      detail: "確認いただければ、続きはMINERVOTが進めます",
      href: "#af-attention-heading",
    };
  }
  if (input.runningCount > 0) {
    return {
      kind: "running",
      label: `${input.runningCount}件の仕事を進めています`,
      detail: input.runningTitle ? `いま:${input.runningTitle}` : null,
      href: "/today",
    };
  }
  if (input.nextRun) {
    return {
      kind: "scheduled",
      label: "次の仕事に備えています",
      detail: input.nextRun.whenLabel
        ? `${input.nextRun.whenLabel} に「${input.nextRun.name}」`
        : `次は「${input.nextRun.name}」`,
      href: "/today",
    };
  }
  if (input.entrustedCount > 0) {
    return {
      kind: "idle",
      label: `${input.entrustedCount}件の仕事をお預かりしています`,
      detail: "予定の時間になると自動で動き出します",
      href: null,
    };
  }
  return {
    kind: "idle",
    label: "準備ができています",
    detail: "仕事を渡すと、成果物まで進めます",
    href: null,
  };
}
