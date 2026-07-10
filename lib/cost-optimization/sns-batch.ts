/** SNS batch generation window — null means daily single post. */
export type SnsBatchDays = 7 | 30;

export const SNS_BATCH_OPTIONS: readonly {
  days: SnsBatchDays;
  label: string;
}[] = [
  { days: 7, label: "7日分まとめて生成" },
  { days: 30, label: "30日分まとめて生成" },
] as const;

export function normalizeSnsBatchDays(
  value: SnsBatchDays | null | undefined,
): SnsBatchDays | null {
  if (value === 7 || value === 30) return value;
  return null;
}

export function buildSnsBatchAssignment(
  baseAssignment: string,
  batchDays: SnsBatchDays | null,
): string {
  if (!batchDays) return baseAssignment;

  return `${baseAssignment.trim()}

【エコモード — SNSまとめ生成】
${batchDays}日分の投稿文案を一度に作成してください。
各日の投稿は日付ラベル（Day 1, Day 2, …）付きで出力し、予約投稿用に保存できる形式にしてください。
同じテーマの連続投稿として、内容の重複を避けつつ一貫したトーンを保ってください。`;
}

export type ScheduledPostDraft = {
  id: string;
  automationId: string;
  automationName: string;
  batchDays: SnsBatchDays;
  content: string;
  scheduledFor: string | null;
  createdAt: string;
};
