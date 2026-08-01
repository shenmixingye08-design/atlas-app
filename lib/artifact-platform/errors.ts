export type ArtifactErrorCode =
  | "source_artifact_not_found"
  | "permission_denied"
  | "unsupported_conversion"
  | "invalid_target_format"
  | "input_validation_failed"
  | "source_file_corrupted"
  | "source_file_missing"
  | "generation_failed"
  | "conversion_failed"
  | "output_validation_failed"
  | "preview_failed"
  | "storage_upload_failed"
  | "artifact_save_failed"
  | "revision_save_failed"
  | "download_failed"
  | "signed_url_failed"
  | "file_too_large"
  | "timeout"
  | "duplicate_request"
  | "cancelled";

const USER_MESSAGES: Record<ArtifactErrorCode, string> = {
  source_artifact_not_found: "元の成果物が見つかりませんでした。",
  permission_denied: "この成果物への操作権限がありません。",
  unsupported_conversion: "この形式変換には現時点で対応していません。",
  invalid_target_format: "変換先の形式が正しくありません。",
  input_validation_failed: "入力内容の確認で問題が見つかりました。",
  source_file_corrupted: "元ファイルが破損している可能性があります。",
  source_file_missing: "元ファイルがストレージ上に見つかりませんでした。",
  generation_failed: "成果物の作成に失敗しました。",
  conversion_failed: "形式変換に失敗しました。",
  output_validation_failed: "作成結果の検証に失敗したため、完成扱いにはできません。",
  preview_failed: "プレビューの表示に失敗しました。ダウンロードは可能です。",
  storage_upload_failed: "ファイルの保存に失敗しました。",
  artifact_save_failed: "成果物情報の保存に失敗しました。",
  revision_save_failed: "版情報の保存に失敗しました。",
  download_failed: "ダウンロードに失敗しました。",
  signed_url_failed: "ダウンロード用URLの発行に失敗しました。",
  file_too_large: "ファイルサイズが上限を超えています。",
  timeout: "処理が時間内に完了しませんでした。",
  duplicate_request: "同じ処理が既に実行中、または完了済みです。",
  cancelled: "処理はキャンセルされました。",
};

export class ArtifactPlatformError extends Error {
  readonly code: ArtifactErrorCode;
  readonly userMessage: string;
  readonly developerDetail: string;
  readonly meta: Record<string, unknown>;

  constructor(
    code: ArtifactErrorCode,
    developerDetail: string,
    meta: Record<string, unknown> = {}
  ) {
    super(`[${code}] ${developerDetail}`);
    this.name = "ArtifactPlatformError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
    this.developerDetail = developerDetail;
    this.meta = meta;
  }

  toClientJson() {
    return {
      error: this.userMessage,
      code: this.code,
      diagnosticId: typeof this.meta.diagnosticId === "string" ? this.meta.diagnosticId : undefined,
    };
  }

  toLogJson() {
    return {
      code: this.code,
      developerDetail: this.developerDetail,
      meta: this.meta,
    };
  }
}

export function userMessageFor(code: ArtifactErrorCode): string {
  return USER_MESSAGES[code];
}
