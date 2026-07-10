import "server-only";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import { detectDeliverableFormats } from "@/lib/deliverables/detect-formats";

import { extractCompanyLearningKnowledge } from "@/lib/learning/to-knowledge";

import type { CreateKnowledgeInput, IngestWorkflowInput } from "./types";

function extractTags(assignment: string, extra: string[] = []): string[] {
  const tokens = assignment
    .toLowerCase()
    .split(/[\s、。,.;:!?()[\]{}'"\/\\|+\-]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 8);

  return [...new Set([...tokens, ...extra])];
}

function preview(text: string, max = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/** Extract knowledge entries from a completed workflow run. */
export function extractKnowledgeFromWorkflow(
  result: OrchestrationResult,
  input: IngestWorkflowInput,
): CreateKnowledgeInput[] {
  const entries: CreateKnowledgeInput[] = [];
  const tags = extractTags(input.assignment);
  const workflowId = input.workflowId;

  entries.push({
    title: `プロジェクト: ${preview(input.assignment, 80)}`,
    category: "project_summary",
    tags,
    summary: preview(result.finalResponse || getDeliverablePreviewText(result.deliverable) || input.assignment, 500),
    sourceWorkflowId: workflowId,
    reusable: true,
    confidence: result.approved ? 85 : 60,
    content: result.finalResponse,
    assignmentHint: input.assignment,
  });

  if (result.finalResponse.trim()) {
    const formats = detectDeliverableFormats(input.assignment);
    entries.push({
      title: "最終成果物",
      category: "deliverable",
      tags: [...tags, ...formats.formats.map((format) => `format:${format}`)],
      summary: preview(result.finalResponse, 600),
      sourceWorkflowId: workflowId,
      reusable: result.approved,
      confidence: result.approved ? 90 : 65,
      content: result.finalResponse,
      assignmentHint: input.assignment,
    });
  }

  if (result.research?.report) {
    const report = result.research.report;
    entries.push({
      title: "調査レポート",
      category: "research",
      tags: [...tags, "research"],
      summary: preview(report.executiveSummary || report.fullText, 500),
      sourceWorkflowId: workflowId,
      reusable: true,
      confidence: report.confidenceScore,
      content: report.fullText,
      assignmentHint: input.assignment,
    });
  }

  if (result.qualityLoop) {
    const latestReview = result.qualityLoop.reviews.at(-1);
    if (latestReview) {
      entries.push({
        title: `品質スコア ${latestReview.score}/100`,
        category: "quality",
        tags: [...tags, "qa"],
        summary: latestReview.feedback || `スコア: ${latestReview.score}/100`,
        sourceWorkflowId: workflowId,
        reusable: true,
        confidence: latestReview.score,
        content: latestReview.feedback,
        assignmentHint: input.assignment,
      });

      if (!latestReview.passed || latestReview.score < 95) {
        entries.push({
          title: "品質改善ポイント",
          category: "mistake",
          tags: [...tags, "qa", "mistake"],
          summary: preview(latestReview.feedback, 400),
          sourceWorkflowId: workflowId,
          reusable: true,
          confidence: 80,
          content: latestReview.feedback,
          assignmentHint: input.assignment,
        });
      }
    }

    if (result.qualityLoop.ceoApproval) {
      const approval = result.qualityLoop.ceoApproval;
      entries.push({
        title: approval.approved ? "CEO承認済み成果物" : "CEO修正依頼",
        category: "ceo_approval",
        tags: [...tags, "ceo"],
        summary: preview(
          approval.ceo?.result.outputText ?? approval.comments,
          400,
        ),
        sourceWorkflowId: workflowId,
        reusable: approval.approved,
        confidence: approval.approved ? 92 : 55,
        content: approval.ceo?.result.outputText ?? approval.comments,
        assignmentHint: input.assignment,
      });
    }

    if (result.qualityLoop.revisionCount > 0) {
      entries.push({
        title: "修正から学んだこと",
        category: "lesson_learned",
        tags: [...tags, "revision", "lesson"],
        summary: `${result.qualityLoop.revisionCount}回の修正が必要でした。最新QA: ${result.qualityLoop.currentScore ?? "—"}/100`,
        sourceWorkflowId: workflowId,
        reusable: true,
        confidence: 75,
        content: latestReview?.feedback,
        assignmentHint: input.assignment,
      });
    }

    if (result.approved && (result.qualityLoop.currentScore ?? 0) >= 95) {
      entries.push({
        title: "成功した進め方",
        category: "reusable_strategy",
        tags: [...tags, "strategy", "success"],
        summary: `QA ${result.qualityLoop.currentScore}/100 で承認。類似の依頼で構成とトーンを再利用できます。`,
        sourceWorkflowId: workflowId,
        reusable: true,
        confidence: result.qualityLoop.currentScore ?? 90,
        content: result.finalResponse,
        assignmentHint: input.assignment,
      });
    }
  }

  if (input.userFeedback?.trim()) {
    entries.push({
      title: "ユーザーフィードバック",
      category: "user_feedback",
      tags: [...tags, "feedback"],
      summary: preview(input.userFeedback, 400),
      sourceWorkflowId: workflowId,
      reusable: true,
      confidence: 88,
      content: input.userFeedback,
      assignmentHint: input.assignment,
    });
  }

  const failedTasks = result.executions.filter(
    (exec) => exec.workerStatus === "failed" || exec.reviewerStatus === "failed",
  );

  for (const execution of failedTasks.slice(0, 3)) {
    entries.push({
      title: `タスク ${execution.task.id} の失敗パターン`,
      category: "mistake",
      tags: [...tags, `task:${execution.task.id}`, "failure"],
      summary:
        execution.workerError ??
        execution.reviewerError ??
        `タスク「${execution.task.title}」は正常に完了しませんでした。`,
      sourceWorkflowId: workflowId,
      reusable: true,
      confidence: 70,
      assignmentHint: input.assignment,
    });
  }

  entries.push(
    ...extractCompanyLearningKnowledge(result, {
      workflowId,
      assignment: input.assignment,
    }),
  );

  return entries;
}
