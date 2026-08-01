export type PptxJobPhase =
  | "queued"
  | "analyzing"
  | "outlining"
  | "generating_content"
  | "designing"
  | "rendering_visuals"
  | "creating_pptx"
  | "validating"
  | "rendering_preview"
  | "converting_pdf"
  | "saving"
  | "completed"
  | "needs_input"
  | "retrying"
  | "failed";

export const PPTX_JOB_PHASES: readonly PptxJobPhase[] = [
  "queued",
  "analyzing",
  "outlining",
  "generating_content",
  "designing",
  "rendering_visuals",
  "creating_pptx",
  "validating",
  "rendering_preview",
  "converting_pdf",
  "saving",
  "completed",
  "needs_input",
  "retrying",
  "failed",
] as const;

const LABELS: Record<PptxJobPhase, string> = {
  queued: "受付",
  analyzing: "内容を整理中",
  outlining: "構成を作成中",
  generating_content: "スライドを生成中",
  designing: "デザインを調整中",
  rendering_visuals: "グラフを作成中",
  creating_pptx: "ファイルを作成中",
  validating: "ファイルを確認中",
  rendering_preview: "プレビュー準備中",
  converting_pdf: "PDF変換中",
  saving: "保存中",
  completed: "完成",
  needs_input: "確認が必要",
  retrying: "再試行",
  failed: "失敗",
};

export function pptxPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "準備中";
  if ((PPTX_JOB_PHASES as readonly string[]).includes(phase)) {
    return LABELS[phase as PptxJobPhase];
  }
  return phase;
}

export type PptxUserErrorCode =
  | "input_validation_failed"
  | "unsupported_file"
  | "file_too_large"
  | "source_parse_failed"
  | "ai_schema_failed"
  | "outline_generation_failed"
  | "content_generation_failed"
  | "image_generation_failed"
  | "chart_generation_failed"
  | "layout_validation_failed"
  | "pptx_generation_failed"
  | "preview_failed"
  | "pdf_conversion_failed"
  | "storage_upload_failed"
  | "artifact_save_failed"
  | "permission_denied"
  | "timeout";

export function userMessageForPptxCode(code: PptxUserErrorCode): string {
  switch (code) {
    case "input_validation_failed":
      return "入力内容を確認できませんでした。内容を見直してもう一度お試しください。";
    case "unsupported_file":
      return "このファイル形式にはまだ対応していません。";
    case "file_too_large":
      return "ファイルが大きすぎます。分割するか枚数を減らしてください。";
    case "source_parse_failed":
      return "元資料の読み取りに失敗しました。";
    case "ai_schema_failed":
      return "スライド設計データが不正でした。もう一度依頼内容を送ってください。";
    case "outline_generation_failed":
      return "構成の作成に失敗しました。";
    case "content_generation_failed":
      return "スライド本文の作成に失敗しました。";
    case "image_generation_failed":
      return "画像の配置に失敗しました。資料本文は保持されています。";
    case "chart_generation_failed":
      return "グラフの作成に失敗しました。数値表は残しています。";
    case "layout_validation_failed":
      return "レイアウト検証で問題が見つかりました。構成を調整して再生成します。";
    case "pptx_generation_failed":
      return "PowerPointの生成に失敗しました。もう一度お試しください。";
    case "preview_failed":
      return "プレビューを表示できませんでした。ダウンロードはお試しいただけます。";
    case "pdf_conversion_failed":
      return "PDF変換に失敗しました。PowerPointファイルは保持されています。";
    case "storage_upload_failed":
      return "保存に失敗しました。時間をおいて再度お試しください。";
    case "artifact_save_failed":
      return "成果物の登録に失敗しました。";
    case "permission_denied":
      return "このファイルを操作する権限がありません。";
    case "timeout":
      return "処理が時間切れになりました。スライド数を減らすか再実行してください。";
  }
}
