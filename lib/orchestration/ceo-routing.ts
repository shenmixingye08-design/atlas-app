import type { AgentPhaseResult } from "./types";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import { classifyDeliverableType } from "./deliverable-classification";

/** Deterministic CEO routing — no LLM. */
export function buildDeterministicCeoPhase(
  assignment: string,
  knowledge?: KnowledgeRetrievalResult | null,
  deliverableType?: DeliverableType,
): AgentPhaseResult {
  const type = deliverableType ?? classifyDeliverableType(assignment);
  const firstLine = assignment.split("\n")[0]?.trim() ?? assignment;

  const priorities = [
    "正確性と完成度",
    "依頼内容への直接対応",
    "即座に共有可能な形式",
  ];

  const knowledgeNote = knowledge?.ceoContext?.trim()
    ? `\n\n## 参考ナレッジ\n${knowledge.ceoContext.slice(0, 500)}`
    : "";

  const outputText = [
    "## 目的",
    firstLine,
    "",
    "## 優先事項",
    ...priorities.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## 成果物タイプ",
    type,
    "",
    "## 成功基準",
    "- 構造化された成果物（title, summary, markdown, metadata）",
    "- 品質基準を満たす完成度",
    "",
    "## ルーティング",
    "Planner → Worker → QA → 各部門レビュー",
    knowledgeNote,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    result: {
      agentId: "ceo",
      role: "ceo",
      name: "Atlas CEO",
      outputText,
      responseId: `ceo-rules-${crypto.randomUUID()}`,
      status: "completed",
      model: "atlas-rules",
    },
    durationMs: 0,
  };
}

/** Deterministic CEO approval — no LLM. */
export function buildDeterministicCeoApproval(
  assignment: string,
  qualityScore: number,
  qaPassed: boolean,
): { approved: boolean; comments: string; phase: AgentPhaseResult } {
  const approved = qaPassed && qualityScore >= 75;
  const comments = approved
    ? `VERDICT: APPROVED\n\n「${assignment.slice(0, 80)}」の成果物を承認しました。品質スコア: ${qualityScore}/100。`
    : `VERDICT: NEEDS REVIEW\n\n品質スコア ${qualityScore}/100 — 要確認としてユーザーに提示します。`;

  const phase: AgentPhaseResult = {
    result: {
      agentId: "ceo",
      role: "ceo",
      name: "Atlas CEO",
      outputText: comments,
      responseId: `ceo-approval-rules-${crypto.randomUUID()}`,
      status: "completed",
      model: "atlas-rules",
    },
    durationMs: 0,
  };

  return { approved, comments, phase };
}
