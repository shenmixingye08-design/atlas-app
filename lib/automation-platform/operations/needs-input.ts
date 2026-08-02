import type { AutomationRun } from "@/lib/automation-platform/types";

/**
 * Map technical needs_input signals to concrete user-facing guidance.
 * Never return only "追加情報が必要です".
 */
export function describeNeedsInput(run: AutomationRun): string {
  const failed = run.steps.find((step) => step.id === run.failedStepId);
  const raw =
    failed?.errorMessage ??
    run.lastErrorMessage ??
    failed?.outputSummary ??
    "";
  const haystack = `${raw} ${failed?.name ?? ""} ${failed?.capabilityId ?? ""}`.toLowerCase();

  if (/(メール|gmail|recipient|送信先|to@|mailto)/i.test(haystack)) {
    return "メール送信先が設定されていません";
  }
  if (/(dropbox|保存先|folder|フォルダ)/i.test(haystack)) {
    return "Dropboxの保存先フォルダを選択してください";
  }
  if (/(期間|period|date range|対象日|売上)/i.test(haystack)) {
    return "売上データの対象期間を指定してください";
  }
  if (/(再接続|reconnect|token|oauth|連携)/i.test(haystack)) {
    return "外部連携の再接続が必要です。連携設定を確認してください";
  }
  if (/(承認|approval)/i.test(haystack)) {
    return "実行内容の確認が必要です";
  }
  if (raw.trim().length > 0 && !/追加情報/i.test(raw)) {
    return raw.trim().slice(0, 200);
  }
  if (failed?.name) {
    return `「${failed.name}」の続行に必要な情報が不足しています`;
  }
  return "続行に必要な設定が不足しています。不足項目を入力して再開してください";
}
