/**
 * Typed attachment storage / upload failures.
 * Safe for client responses — never include secrets or file bytes.
 */

export type AttachmentErrorCode =
  | "config_missing"
  | "bucket_missing"
  | "bucket_create_failed"
  | "table_missing"
  | "storage_upload_failed"
  | "metadata_insert_failed"
  | "preprocess_failed"
  | "image_corrupt"
  | "read_failed"
  | "upload_failed";

const USER_MESSAGES: Record<AttachmentErrorCode, string> = {
  config_missing:
    "画像保存の設定が不足しています（Supabase SERVICE_ROLE）。管理者に連絡してください。",
  bucket_missing:
    "画像保存用ストレージ（atlas-image-attachments）が見つかりません。管理者に連絡してください。",
  bucket_create_failed:
    "画像保存用ストレージの作成に失敗しました。管理者に連絡してください。",
  table_missing:
    "画像添付テーブルが未作成です。migration（20260726_atlas_image_attachments.sql）の適用が必要です。",
  storage_upload_failed: "画像の Storage 保存に失敗しました。もう一度お試しください。",
  metadata_insert_failed:
    "画像メタデータの保存に失敗しました。テーブル/RLS設定を確認してください。",
  preprocess_failed: "画像の前処理に失敗しました。もう一度お試しください。",
  image_corrupt:
    "この画像を読み込めませんでした。元画像が破損している可能性があります。",
  read_failed: "画像の読み込みに失敗しました。",
  upload_failed: "画像のアップロードに失敗しました",
};

export class AttachmentStorageError extends Error {
  readonly code: AttachmentErrorCode;
  readonly stage: string;
  readonly providerCode?: string;
  readonly providerMessage?: string;
  readonly diagnosticId?: string;
  readonly developerCode?: string;
  readonly failedStage?: string;

  constructor(input: {
    code: AttachmentErrorCode;
    stage: string;
    providerCode?: string;
    providerMessage?: string;
    diagnosticId?: string;
    developerCode?: string;
    failedStage?: string;
    userMessage?: string;
    cause?: unknown;
  }) {
    super(
      input.userMessage ??
        USER_MESSAGES[input.code] ??
        USER_MESSAGES.upload_failed,
    );
    this.name = "AttachmentStorageError";
    this.code = input.code;
    this.stage = input.stage;
    this.providerCode = input.providerCode;
    this.providerMessage = input.providerMessage
      ? sanitizeProviderMessage(input.providerMessage)
      : undefined;
    this.diagnosticId = input.diagnosticId;
    this.developerCode = input.developerCode;
    this.failedStage = input.failedStage;
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      stage: this.stage,
      providerCode: this.providerCode ?? null,
      diagnosticId: this.diagnosticId ?? null,
      developerCode: this.developerCode ?? null,
      failedStage: this.failedStage ?? null,
    };
  }
}

/** Strip tokens / long blobs from provider messages before logging or returning. */
export function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted_jwt]")
    .replace(/service_role/gi, "[redacted]")
    .slice(0, 240);
}

export function classifySupabaseError(
  error: { message?: string; code?: string; status?: number } | null | undefined,
  stage: string,
): AttachmentStorageError {
  const message = error?.message ?? "unknown";
  const code = error?.code ?? "";
  const lower = message.toLowerCase();

  if (
    code === "42P01" ||
    code === "PGRST205" ||
    (lower.includes("atlas_image_attachments") && lower.includes("does not exist")) ||
    lower.includes("could not find the table")
  ) {
    return new AttachmentStorageError({
      code: "table_missing",
      stage,
      providerCode: code || undefined,
      providerMessage: message,
    });
  }

  if (
    lower.includes("bucket not found") ||
    lower.includes("not found") && lower.includes("bucket") ||
    code === "NotFound" ||
    error?.status === 404 && lower.includes("bucket")
  ) {
    return new AttachmentStorageError({
      code: "bucket_missing",
      stage,
      providerCode: code || undefined,
      providerMessage: message,
    });
  }

  if (stage.startsWith("storage.")) {
    return new AttachmentStorageError({
      code: "storage_upload_failed",
      stage,
      providerCode: code || undefined,
      providerMessage: message,
    });
  }

  if (stage.startsWith("db.")) {
    return new AttachmentStorageError({
      code: "metadata_insert_failed",
      stage,
      providerCode: code || undefined,
      providerMessage: message,
    });
  }

  return new AttachmentStorageError({
    code: "upload_failed",
    stage,
    providerCode: code || undefined,
    providerMessage: message,
  });
}

export function logAttachmentError(
  error: unknown,
  context: { stage: string; userId?: string },
): void {
  if (error instanceof AttachmentStorageError) {
    console.error("[attachments] failure", {
      stage: context.stage,
      code: error.code,
      errorStage: error.stage,
      failedStage: error.failedStage ?? null,
      developerCode: error.developerCode ?? null,
      diagnosticId: error.diagnosticId ?? null,
      providerCode: error.providerCode ?? null,
      providerMessage: error.providerMessage ?? null,
      userIdPresent: Boolean(context.userId),
    });
    return;
  }

  const message =
    error instanceof Error ? sanitizeProviderMessage(error.message) : "unknown";
  console.error("[attachments] failure", {
    stage: context.stage,
    code: "upload_failed",
    message,
    userIdPresent: Boolean(context.userId),
  });
}
