import type { CanonicalLifecycleStatus } from "./types";

/** Single user-facing status vocabulary for all Automation generations. */
export const CANONICAL_STATUS_LABEL: Record<CanonicalLifecycleStatus, string> = {
  active: "有効",
  paused: "一時停止",
  running: "実行中",
  scheduled: "実行予定",
  completed: "完了",
  failed: "失敗",
  needs_review: "確認待ち",
  draft: "下書き",
  archived: "削除済み",
};

export function formatCanonicalStatus(
  status: CanonicalLifecycleStatus,
): string {
  return CANONICAL_STATUS_LABEL[status];
}

/** Delete confirmation copy — soft delete / archive, not silent hide. */
export const DELETE_CONFIRM_MESSAGE_JA =
  "この自動化を削除します。一覧から消え、今後は自動実行されません。よろしいですか？";

export const DELETE_SEMANTICS_HINT_JA =
  "削除は一覧からの除去と実行停止です（停止だけの一時停止とは異なります）。";
