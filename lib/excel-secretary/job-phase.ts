export type ExcelJobPhase =
  | "queued"
  | "parsing"
  | "planning"
  | "generating"
  | "validating"
  | "rendering_preview"
  | "saving"
  | "completed"
  | "needs_input"
  | "retrying"
  | "failed";

export const EXCEL_JOB_PHASES: readonly ExcelJobPhase[] = [
  "queued",
  "parsing",
  "planning",
  "generating",
  "validating",
  "rendering_preview",
  "saving",
  "completed",
  "needs_input",
  "retrying",
  "failed",
] as const;

const LABELS: Record<ExcelJobPhase, string> = {
  queued: "受付",
  parsing: "読取",
  planning: "設計",
  generating: "生成",
  validating: "検証",
  rendering_preview: "プレビュー準備",
  saving: "保存",
  completed: "完成",
  needs_input: "確認が必要",
  retrying: "再試行",
  failed: "失敗",
};

export function excelPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "準備中";
  if ((EXCEL_JOB_PHASES as readonly string[]).includes(phase)) {
    return LABELS[phase as ExcelJobPhase];
  }
  return phase;
}

/** User-facing error codes (never dump internals). */
export type ExcelUserErrorCode =
  | "input_validation_failed"
  | "unsupported_file"
  | "file_too_large"
  | "workbook_parse_failed"
  | "ai_schema_failed"
  | "formula_validation_failed"
  | "excel_generation_failed"
  | "preview_failed"
  | "storage_upload_failed"
  | "artifact_save_failed"
  | "export_failed"
  | "timeout"
  | "permission_denied";

export function userMessageForExcelCode(code: ExcelUserErrorCode): string {
  switch (code) {
    case "input_validation_failed":
      return "入力内容を確認できませんでした。内容を見直してもう一度お試しください。";
    case "unsupported_file":
      return "このファイル形式にはまだ対応していません。.xlsx / CSV / PDF / Word をご利用ください。";
    case "file_too_large":
      return "ファイルが大きすぎます。分割するか行数を減らしてからお試しください。";
    case "workbook_parse_failed":
      return "Excelの読み取りに失敗しました。ファイルが破損していないか確認してください。";
    case "ai_schema_failed":
      return "表の設計データが不正でした。もう一度依頼内容を送ってください。";
    case "formula_validation_failed":
      return "数式の参照に問題が見つかりました。修正して再生成します。";
    case "excel_generation_failed":
      return "Excelの生成に失敗しました。もう一度お試しください。";
    case "preview_failed":
      return "プレビューを表示できませんでした。ダウンロードはお試しいただけます。";
    case "storage_upload_failed":
      return "保存に失敗しました。時間をおいて再度お試しください。";
    case "artifact_save_failed":
      return "成果物の登録に失敗しました。";
    case "export_failed":
      return "書き出しに失敗しました。";
    case "timeout":
      return "処理が時間切れになりました。件数を減らすか、バックグラウンドで再実行してください。";
    case "permission_denied":
      return "このファイルを操作する権限がありません。";
  }
}
