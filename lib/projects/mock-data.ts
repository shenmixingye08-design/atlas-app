import type { AgentRunResult } from "@/lib/agents/types";
import type {
  AgentPhaseResult,
  OrchestrationResult,
  TaskExecutionResult,
} from "@/lib/orchestration/types";
import type { WorkTask } from "@/lib/agents/tasks/types";
import type { AgentId } from "@/lib/agents/types";
import { DEFAULT_WORKFLOW_EMPLOYEE_IDS } from "@/lib/employees/registry";
import {
  buildFinalResponseSummary,
  buildDeliverable,
} from "@/lib/orchestration/deliverable-builder";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

import type { Project, ProjectStatus } from "./types";

const ALL_EMPLOYEES = [...DEFAULT_WORKFLOW_EMPLOYEE_IDS];

const AGENT_LABELS: Record<AgentId, string> = {
  ceo: "CEO",
  planner: "企画",
  worker: "制作",
  reviewer: "確認",
};

function mockAgentResult(agentId: AgentId, outputText: string): AgentRunResult {
  return {
    agentId,
    role: agentId,
    name: AGENT_LABELS[agentId] ?? agentId,
    outputText,
    responseId: `resp_mock_${agentId}_${Date.now()}`,
    status: "completed",
    model: "gpt-5.5",
  };
}

function mockPhase(
  agentId: AgentId,
  outputText: string,
  durationMs: number,
): AgentPhaseResult {
  return {
    result: mockAgentResult(agentId, outputText),
    durationMs,
  };
}

function mockExecution(
  task: WorkTask,
  workerOutput: string,
  reviewOutput: string,
  approved: boolean,
  assignedEmployeeId: string = "development-senior-dev",
): TaskExecutionResult {
  return {
    task,
    assignedEmployeeId,
    worker: mockPhase("worker", workerOutput, 4200),
    workerStatus: "completed",
    reviewer: mockPhase("reviewer", reviewOutput, 2100),
    reviewerStatus: "completed",
    approved,
  };
}

function buildMockResult(
  assignment: string,
  tasks: WorkTask[],
  executions: TaskExecutionResult[],
  approved: boolean,
): OrchestrationResult {
  const deliverableText = executions
    .filter((e) => e.worker)
    .map(
      (e) =>
        `## タスク ${e.task.id}: ${e.task.title}\n\n${e.worker!.result.outputText}`,
    )
    .join("\n\n---\n\n");

  const workflowDeliverable = buildDeliverable({
    assignment,
    executions,
  });

  const reviewComments = executions
    .filter((e) => e.reviewer)
    .map(
      (e) =>
        `## タスク ${e.task.id} — 確認\n\n${e.reviewer!.result.outputText}`,
    )
    .join("\n\n---\n\n");

  return {
    assignment,
    status: "completed",
    workflow: hydrateWorkflowState({
      status: "completed",
      approved,
      ceo: {},
      plannerPlan: {},
      executions,
      deliverable: workflowDeliverable,
    }),
    ceo: mockPhase(
      "ceo",
      `## 目的\n${assignment}\n\n## 優先事項\n1. 正確性と完成度\n2. 経営陣向けの簡潔さ\n\n## 成功基準\n- 要件をすべて満たす\n- 即座に共有可能な形式`,
      3100,
    ),
    plannerPlan: mockPhase(
      "planner",
      `## 概要\n3フェーズで進行します。\n\n## 進め方\n1. データ収集\n2. 分析・構成\n3. ドキュメント作成\n\n## リスク\n- データ不足の可能性`,
      2800,
    ),
    plannerTasks: mockPhase(
      "planner",
      `## 実行計画\n${tasks.length}つの独立タスクに分解しました。\n\n## タスク\n${tasks.map((t) => `タスク ${t.id}: ${t.title} — ${t.description}`).join("\n")}`,
      2400,
    ),
    tasks,
    executions,
    deliverable: workflowDeliverable,
    reviewComments,
    approved,
    finalResponse: approved
      ? buildFinalResponseSummary(workflowDeliverable) || deliverableText
      : `${buildFinalResponseSummary(workflowDeliverable) || deliverableText}\n\n---\n\n## 確認サマリー\n\n${reviewComments}`,
    totalDurationMs: 45000,
  };
}

const Q1_TASKS: WorkTask[] = [
  {
    id: 1,
    title: "データ収集",
    description: "Q1売上データを地域別に収集・整理する",
  },
  {
    id: 2,
    title: "分析レポート",
    description: "トレンド分析と主要KPIを算出する",
  },
  {
    id: 3,
    title: "サマリー作成",
    description: "経営陣向け1ページサマリーを作成する",
  },
];

const Q1_EXECUTIONS = mockExecution(
  Q1_TASKS[0],
  "地域別Q1売上:\n- 東日本: ¥42M (+12%)\n- 西日本: ¥38M (+8%)\n- 海外: ¥15M (+22%)",
  "Summary: データ完全性OK\n判定: 承認",
  true,
);

const Q1_RESULT = buildMockResult(
  "Q1の売上データを分析し、経営陣向けの1ページサマリーを作成してください",
  Q1_TASKS,
  [
    Q1_EXECUTIONS,
    mockExecution(
      Q1_TASKS[1],
      "主要KPI:\n- 総売上: ¥95M (+11% YoY)\n- 粗利率: 34%\n- 新規顧客: 1,240社",
      "サマリー: KPI計算正確\n判定: 承認",
      true,
    ),
    mockExecution(
      Q1_TASKS[2],
      "# Q1 売上サマリー\n\nQ1総売上は¥95M、前年比+11%成長。海外展開が成長ドライバー。",
      "サマリー: 要件充足\n判定: 承認",
      true,
    ),
  ],
  true,
);

const MARKETING_TASKS: WorkTask[] = [
  {
    id: 1,
    title: "ターゲット分析",
    description: "B2B SaaS向けターゲットセグメントを定義する",
  },
  {
    id: 2,
    title: "キャンペーン案",
    description: "3チャネルのマーケティングキャンペーン案を作成する",
  },
];

const MARKETING_RESULT = buildMockResult(
  "新製品ローンチ向けのB2Bマーケティングキャンペーン計画を作成してください",
  MARKETING_TASKS,
  [
    mockExecution(
      MARKETING_TASKS[0],
      "ターゲット: 中堅企業のIT決裁者 (500-5000名規模)\nペルソナ: CTO / IT部長",
      "サマリー: セグメント明確\n判定: 承認",
      true,
    ),
    mockExecution(
      MARKETING_TASKS[1],
      "1. LinkedIn広告\n2. ウェビナーシリーズ\n3. パートナー共同PR",
      "サマリー: 予算根拠が不足\n判定: 要修正\n推奨: 各チャネルの予算見積を追加",
      false,
    ),
  ],
  false,
);

const HANDBOOK_PARTIAL: OrchestrationResult = {
  assignment: "従業員ハンドブックのリモートワーク規定セクションを更新してください",
  status: "completed",
  workflow: hydrateWorkflowState({
    status: "completed",
    approved: false,
    ceo: {},
    plannerPlan: {},
    executions: [],
    deliverable: emptyDeliverable(),
  }),
  ceo: mockPhase(
    "ceo",
    "## 目的\nリモートワーク規定の全面更新\n\n## 優先事項\n1. 法規制準拠\n2. 明確なガイドライン",
    2900,
  ),
  plannerPlan: mockPhase(
    "planner",
    "## 概要\n規定改定を3タスクで実行",
    2600,
  ),
  plannerTasks: mockPhase(
    "planner",
    "## 実行計画\n3タスクに分解\n\n## タスク\nタスク 1: 現行規定の調査 — 既存リモートワーク規定を分析する\nタスク 2: 新規定の起草 — 法規制に準拠した規定案を作成する\nタスク 3: レビュー用ドラフト — 最終ドラフトを作成する",
    2400,
  ),
  tasks: [
    {
      id: 1,
      title: "現行規定の調査",
      description: "既存リモートワーク規定を分析する",
    },
    {
      id: 2,
      title: "新規定の起草",
      description: "法規制に準拠した規定案を作成する",
    },
    {
      id: 3,
      title: "レビュー用ドラフト",
      description: "最終ドラフトを作成する",
    },
  ],
  executions: [],
  deliverable: emptyDeliverable(),
  reviewComments: "",
  approved: false,
  finalResponse: "",
  totalDurationMs: 12000,
};

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const SEED_PROJECTS: Project[] = [
  {
    id: "proj_q1_sales",
    title: "Q1 売上サマリー",
    workRequest:
      "Q1の売上データを分析し、経営陣向けの1ページサマリーを作成してください",
    status: "completed",
    progress: 100,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(12),
    assignedEmployees: ALL_EMPLOYEES,
    result: Q1_RESULT,
  },
  {
    id: "proj_marketing",
    title: "マーケティングキャンペーン計画",
    workRequest:
      "新製品ローンチ向けのB2Bマーケティングキャンペーン計画を作成してください",
    status: "review",
    progress: 90,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(1),
    assignedEmployees: ALL_EMPLOYEES,
    result: MARKETING_RESULT,
  },
  {
    id: "proj_handbook",
    title: "従業員ハンドブック更新",
    workRequest:
      "従業員ハンドブックのリモートワーク規定セクションを更新してください",
    status: "running",
    progress: 45,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(0),
    assignedEmployees: ["ceo-office-atlas-ceo", "planning-lead-planner"],
    result: HANDBOOK_PARTIAL,
  },
  {
    id: "proj_website",
    title: "サイトリデザイン要件",
    workRequest:
      "コーポレートサイトリデザインの要件定義書を作成してください",
    status: "pending",
    progress: 0,
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
    assignedEmployees: ALL_EMPLOYEES,
    result: null,
  },
];

export function progressForStatus(status: ProjectStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "running":
      return 45;
    case "review":
      return 90;
    case "completed":
      return 100;
  }
}
