import "server-only";

import { createNotification } from "@/lib/notifications/service";

export async function notifyDeliverableBatch(
  userId: string,
  kind: "sample" | "completed" | "partial" | "review" | "zip",
  batchId: string,
  name: string,
): Promise<void> {
  const href = `/workspace/batch/${encodeURIComponent(batchId)}`;
  const copy = {
    sample: {
      title: "試作が完成しました",
      message: `「${name}」の最初の1件をご確認ください。`,
    },
    completed: {
      title: "まとめて作成が完了しました",
      message: `お待たせいたしました。「${name}」の成果物をご確認ください。`,
    },
    partial: {
      title: "一部の作成に失敗しました",
      message: `「${name}」は成功した成果物をご確認いただけます。失敗項目だけ再試行できます。`,
    },
    review: {
      title: "ご確認が必要です",
      message: `「${name}」の内容をご確認ください。`,
    },
    zip: {
      title: "一括ダウンロードの準備ができました",
      message: `「${name}」をZIPでダウンロードできます。`,
    },
  }[kind];
  await createNotification({
    audience: "user",
    userId,
    type:
      kind === "partial"
        ? "error"
        : kind === "review" || kind === "sample"
          ? "awaiting_review"
          : "completed",
    title: copy.title,
    message: copy.message,
    relatedTaskId: batchId,
    relatedService: "atlas",
    actionUrl: href,
  }).catch(() => undefined);
}
