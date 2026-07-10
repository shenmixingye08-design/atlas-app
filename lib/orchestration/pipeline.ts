/** Static workflow phase metadata for UI display (no prompts). */
export const WORKFLOW_PHASES = [
  { id: "ceo", label: "CEO", action: "リクエストを分析" },
  { id: "research", label: "調査", action: "外部調査を実施" },
  { id: "planner-plan", label: "企画", action: "実行計画を作成" },
  { id: "planner-tasks", label: "企画", action: "タスクに分解" },
  { id: "worker", label: "制作", action: "タスクを実行" },
  { id: "reviewer", label: "確認", action: "品質を確認" },
  { id: "quality-assurance", label: "品質確認", action: "スコアリング" },
  { id: "ceo-approval", label: "CEO", action: "最終承認" },
] as const;

export type WorkflowPhaseId = (typeof WORKFLOW_PHASES)[number]["id"];
