/**
 * VALUE 12 — execution proof. Never invent provider success.
 */

export type ReceiptResult =
  | "succeeded"
  | "failed"
  | "internal_complete"
  | "awaiting_approval";

export type ReceiptProofKind = "provider" | "artifact" | "internal" | "none";

export type ReceiptSideEffect = {
  provider: "x" | "gmail" | "google_calendar" | "wordpress" | "none";
  action: string;
  resourceId: string | null;
  label: string;
};

export type ReceiptArtifact = {
  id: string;
  fileName: string;
  format: string;
  createdAt: string | null;
  sizeBytes: number | null;
  downloadable: boolean;
  qualityGate: string | null;
};

export type ExecutionReceipt = {
  workName: string;
  executionId: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: string[];
  result: ReceiptResult;
  proofKind: ReceiptProofKind;
  sideEffects: ReceiptSideEffect[];
  artifact: ReceiptArtifact | null;
  nextRunAt: string | null;
  gmailSent: boolean;
  summary: string;
};

export type ReceiptEvidence = {
  workName: string;
  executionId: string;
  startedAt?: string | null;
  completedAt?: string | null;
  steps?: string[];
  nextRunAt?: string | null;
  providerFailed?: boolean;
  awaitingApproval?: boolean;
  x?: { tweetId?: string | null; tweetUrl?: string | null; postedAt?: string | null; text?: string | null };
  gmail?: { draftId?: string | null; sentMessageId?: string | null };
  calendar?: { eventId?: string | null; when?: string | null; title?: string | null };
  wordpress?: { postId?: string | null; status?: string | null; url?: string | null };
  artifact?: Partial<ReceiptArtifact> | null;
};

export function buildExecutionReceipt(evidence: ReceiptEvidence): ExecutionReceipt {
  const sideEffects: ReceiptSideEffect[] = [];
  let proofKind: ReceiptProofKind = "none";
  let result: ReceiptResult = "failed";
  let gmailSent = false;

  if (evidence.providerFailed) {
    return {
      workName: evidence.workName,
      executionId: evidence.executionId,
      startedAt: evidence.startedAt ?? null,
      completedAt: evidence.completedAt ?? null,
      steps: evidence.steps ?? [],
      result: "failed",
      proofKind: "none",
      sideEffects: [],
      artifact: null,
      nextRunAt: evidence.nextRunAt ?? null,
      gmailSent: false,
      summary: "外部への実行は完了していません",
    };
  }

  if (evidence.awaitingApproval) {
    return {
      workName: evidence.workName,
      executionId: evidence.executionId,
      startedAt: evidence.startedAt ?? null,
      completedAt: evidence.completedAt ?? null,
      steps: evidence.steps ?? [],
      result: "awaiting_approval",
      proofKind: "none",
      sideEffects: [],
      artifact: evidence.artifact?.id
        ? {
            id: evidence.artifact.id,
            fileName: evidence.artifact.fileName ?? "成果物",
            format: evidence.artifact.format ?? "unknown",
            createdAt: evidence.artifact.createdAt ?? null,
            sizeBytes: evidence.artifact.sizeBytes ?? null,
            downloadable: Boolean(evidence.artifact.downloadable),
            qualityGate: evidence.artifact.qualityGate ?? null,
          }
        : null,
      nextRunAt: evidence.nextRunAt ?? null,
      gmailSent: false,
      summary: "承認待ちです。送信完了ではありません",
    };
  }

  if (evidence.x?.tweetId) {
    sideEffects.push({
      provider: "x",
      action: "post",
      resourceId: evidence.x.tweetId,
      label: evidence.x.tweetUrl
        ? `X投稿 ${evidence.x.tweetId}`
        : `X投稿ID ${evidence.x.tweetId}`,
    });
    proofKind = "provider";
    result = "succeeded";
  }

  if (evidence.gmail?.sentMessageId) {
    gmailSent = true;
    sideEffects.push({
      provider: "gmail",
      action: "send",
      resourceId: evidence.gmail.sentMessageId,
      label: `メール送信 ${evidence.gmail.sentMessageId}`,
    });
    proofKind = "provider";
    result = "succeeded";
  } else if (evidence.gmail?.draftId) {
    sideEffects.push({
      provider: "gmail",
      action: "draft",
      resourceId: evidence.gmail.draftId,
      label: `下書き作成 ${evidence.gmail.draftId}`,
    });
    if (proofKind === "none") {
      proofKind = "provider";
      result = "succeeded";
    }
  }

  if (evidence.calendar?.eventId) {
    sideEffects.push({
      provider: "google_calendar",
      action: "create",
      resourceId: evidence.calendar.eventId,
      label: evidence.calendar.title
        ? `予定「${evidence.calendar.title}」`
        : `予定 ${evidence.calendar.eventId}`,
    });
    proofKind = "provider";
    result = "succeeded";
  }

  if (evidence.wordpress?.postId) {
    sideEffects.push({
      provider: "wordpress",
      action: evidence.wordpress.status ?? "draft",
      resourceId: evidence.wordpress.postId,
      label: evidence.wordpress.url
        ? `WordPress ${evidence.wordpress.postId}`
        : `WordPress ID ${evidence.wordpress.postId}`,
    });
    proofKind = "provider";
    result = "succeeded";
  }

  const artifact = evidence.artifact?.id
    ? {
        id: evidence.artifact.id,
        fileName: evidence.artifact.fileName ?? "成果物",
        format: evidence.artifact.format ?? "unknown",
        createdAt: evidence.artifact.createdAt ?? null,
        sizeBytes: evidence.artifact.sizeBytes ?? null,
        downloadable: Boolean(evidence.artifact.downloadable),
        qualityGate: evidence.artifact.qualityGate ?? null,
      }
    : null;

  if (artifact && proofKind === "none") {
    proofKind = "artifact";
    result = "succeeded";
  }

  if (proofKind === "none") {
    result = "internal_complete";
    proofKind = "internal";
  }

  const summary =
    result === "internal_complete"
      ? "MINERVOT内部では完了。外部サービスへの成功証拠はありません"
      : result === "succeeded" && proofKind === "artifact"
        ? "成果物を保存しました"
        : result === "succeeded"
          ? "外部実行の証拠があります"
          : "完了していません";

  return {
    workName: evidence.workName,
    executionId: evidence.executionId,
    startedAt: evidence.startedAt ?? null,
    completedAt: evidence.completedAt ?? null,
    steps: evidence.steps ?? [],
    result,
    proofKind,
    sideEffects,
    artifact,
    nextRunAt: evidence.nextRunAt ?? null,
    gmailSent,
    summary,
  };
}

export function receiptHasProviderProof(receipt: ExecutionReceipt): boolean {
  return receipt.proofKind === "provider" && receipt.result === "succeeded";
}
