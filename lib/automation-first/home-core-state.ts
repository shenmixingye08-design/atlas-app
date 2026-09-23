/**
 * Home "AI core" status — derived only from real home data.
 * Never invent progress: every state maps to counts the home already loaded.
 */

export type HomeCoreStateKind =
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

export type HomeCoreStateInput = {
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
