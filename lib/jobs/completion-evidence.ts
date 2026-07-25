import type { JobStatus } from "./types";

export type CompletionEvidenceInput = {
  templateId?: string;
  orchestrationStatus: string;
  approved: boolean;
  deliverableCount: number;
  snsPostFailure: string | null;
  tweetId?: string | null;
  tweetUrl?: string | null;
  artifactId?: string | null;
  storageUrl?: string | null;
};

export type CompletionEvidenceResult = {
  status: JobStatus;
  resultSummary: string | null;
  externalResultId: string | null;
  externalResultUrl: string | null;
  artifactId: string | null;
  lastErrorMessage: string | null;
};

/** Require proof before marking completed — not AI finish alone. */
export function evaluateCompletionEvidence(
  input: CompletionEvidenceInput,
): CompletionEvidenceResult {
  if (input.orchestrationStatus === "failed" || input.snsPostFailure) {
    return {
      status: "failed",
      resultSummary: null,
      externalResultId: null,
      externalResultUrl: null,
      artifactId: null,
      lastErrorMessage: input.snsPostFailure ?? "処理に失敗しました",
    };
  }

  if (input.orchestrationStatus !== "completed") {
    return {
      status: "failed",
      resultSummary: null,
      externalResultId: null,
      externalResultUrl: null,
      artifactId: null,
      lastErrorMessage: "処理が完了しませんでした",
    };
  }

  if (!input.approved) {
    return {
      status: "waiting_for_approval",
      resultSummary: "確認待ち",
      externalResultId: null,
      externalResultUrl: null,
      artifactId: input.artifactId ?? null,
      lastErrorMessage: null,
    };
  }

  if (input.templateId === "sns_post") {
    if (input.tweetId && input.tweetUrl) {
      return {
        status: "completed",
        resultSummary: "Xへの投稿が完了しました",
        externalResultId: input.tweetId,
        externalResultUrl: input.tweetUrl,
        artifactId: input.artifactId ?? null,
        lastErrorMessage: null,
      };
    }
    return {
      status: "partially_completed",
      resultSummary: "内容は作成済み — X投稿の証拠がありません",
      externalResultId: null,
      externalResultUrl: null,
      artifactId: input.artifactId ?? null,
      lastErrorMessage: null,
    };
  }

  if (input.deliverableCount > 0 && input.storageUrl) {
    return {
      status: "completed",
      resultSummary: "成果物を生成・保存しました",
      externalResultId: null,
      externalResultUrl: input.storageUrl,
      artifactId: input.artifactId ?? null,
      lastErrorMessage: null,
    };
  }

  if (input.deliverableCount > 0) {
    return {
      status: "partially_completed",
      resultSummary: "成果物は生成済み — 保存先URLがありません",
      externalResultId: null,
      externalResultUrl: null,
      artifactId: input.artifactId ?? null,
      lastErrorMessage: null,
    };
  }

  return {
    status: "completed",
    resultSummary: "自動化が完了しました",
    externalResultId: null,
    externalResultUrl: null,
    artifactId: input.artifactId ?? null,
    lastErrorMessage: null,
  };
}
