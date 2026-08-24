import "server-only";

import { requireAndConsumeAiJob } from "@/lib/billing/access";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

import { composeItemSourceContent } from "./compose";
import type { DeliverableBatch, DeliverableBatchItem } from "./types";

export async function generateDeliverableBatchItemArtifact(input: {
  userId: string;
  batch: DeliverableBatch;
  item: DeliverableBatchItem;
  assignment: string;
  origin: string;
}): Promise<{
  ok: boolean;
  artifactId?: string;
  fileName?: string;
  sourceContent?: string;
  error?: string;
}> {
  const claimKey = `deliverable-batch:${input.batch.id}:${input.item.id}:${input.item.retryCount}`;
  const denied = await requireAndConsumeAiJob(
    input.userId,
    "deliverables_generate",
    claimKey,
  );
  if (denied) {
    return { ok: false, error: "今月のAI利用上限に達しています。" };
  }

  const item = {
    ...input.item,
    individualInstruction:
      input.item.individualInstruction.trim() ||
      (input.item.inputReference
        ? `添付「${input.item.inputReference}」の内容だけを使う。見えない事実は書かない。`
        : input.item.individualInstruction),
  };
  const sourceContent = composeItemSourceContent(
    input.batch.common,
    item,
    input.batch.sampleStyleNote,
  );
  if (sourceContent.trim().length < 80) {
    return { ok: false, error: "成果物の本文が短すぎます。指示を足してください。" };
  }

  const jobId = `dlvbatch_${input.item.id}_${input.item.retryCount}`;
  const result = await generateDeliverables(
    {
      assignment: input.assignment,
      finalDeliverable: sourceContent,
      title: input.item.title,
      formats: [input.batch.format],
    },
    input.origin,
    {
      userId: input.userId,
      jobId,
      contentAlreadyApproved: true,
      suppressWordReadyNotification: true,
    },
  );

  const deliverable = result.deliverables.find(
    (item) => item.format === input.batch.format && !item.isPlaceholder,
  );
  if (!deliverable) {
    const reason = result.failures[0]?.reasons.join(" ") || "成果物を作成できませんでした。";
    return { ok: false, error: reason, sourceContent };
  }

  const stored = await getStoredDeliverableForUser(deliverable.id, input.userId);
  if (!stored || stored.buffer.byteLength <= 0) {
    return {
      ok: false,
      error: "成果物ファイルを保存できませんでした。",
      sourceContent,
    };
  }

  return {
    ok: true,
    artifactId: deliverable.id,
    fileName: deliverable.fileName,
    sourceContent,
  };
}
