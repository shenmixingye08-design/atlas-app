import "server-only";

/**
 * Build notification deep-link for a completed artifact.
 * Prefer /artifacts detail deep-link while keeping legacy download URL available.
 */
export function artifactNotificationActionUrl(artifactId: string): string {
  return `/artifacts?id=${encodeURIComponent(artifactId)}`;
}

export function artifactCompletedNotificationPayload(input: {
  artifactId: string;
  title: string;
  kind: "created" | "converted" | "revised" | "needs_input" | "failed";
  jobId?: string | null;
}) {
  const labels = {
    created: "成果物が完成しました",
    converted: "形式変換が完了しました",
    revised: "再編集版が完成しました",
    needs_input: "成果物の作成に追加情報が必要です",
    failed: "成果物の処理に失敗しました",
  } as const;

  return {
    title: labels[input.kind],
    body: input.title,
    actionUrl: artifactNotificationActionUrl(input.artifactId),
    deliverableId: input.artifactId,
    jobId: input.jobId ?? null,
    // Only "created/converted/revised" should be marked complete by callers.
    isComplete: input.kind === "created" || input.kind === "converted" || input.kind === "revised",
  };
}
