import type { DeliverableFormat } from "@/lib/deliverables/types";

/** Unified artifact formats (superset of durable DeliverableFormat). */
export type ArtifactFormat =
  | DeliverableFormat
  | "csv"
  | "png"
  | "jpg"
  | "json"
  | "markdown";

export type ArtifactStatus =
  | "draft"
  | "generating"
  | "validating"
  | "completed"
  | "needs_input"
  | "failed"
  | "deleted";

export type PreviewStatus =
  | "pending"
  | "ready"
  | "failed"
  | "skipped"
  | "unavailable";

export type ValidationStatus =
  | "pending"
  | "passed"
  | "failed"
  | "skipped";

export type ConversionQuality =
  | "high"
  | "needs_review"
  | "low_confidence"
  | "unsupported";

export type ConversionType =
  | "revision"
  | "format_conversion"
  | "regenerate"
  | "import"
  | "export"
  | null;

export type ArtifactLineageMeta = {
  rootArtifactId?: string | null;
  sourceArtifactId?: string | null;
  revisionNumber?: number;
  conversionType?: ConversionType;
  createdFrom?: string;
  requestId?: string | null;
  jobId?: string | null;
  title?: string;
  description?: string;
  previewStatus?: PreviewStatus;
  validationStatus?: ValidationStatus;
  status?: ArtifactStatus;
  quality?: ConversionQuality;
  changeReason?: string | null;
  changeSummary?: string | null;
  versionGroupId?: string | null;
  isLatest?: boolean;
  softDeleted?: boolean;
  deletedAt?: string | null;
};

export type UnifiedArtifact = {
  id: string;
  userId: string;
  jobId: string | null;
  requestId: string | null;
  title: string;
  description: string;
  format: ArtifactFormat;
  mimeType: string;
  storagePath: string | null;
  fileName: string;
  fileSize: number;
  status: ArtifactStatus;
  sourceArtifactId: string | null;
  rootArtifactId: string;
  revisionNumber: number;
  conversionType: ConversionType;
  createdFrom: string;
  metadata: ArtifactLineageMeta & Record<string, unknown>;
  previewStatus: PreviewStatus;
  validationStatus: ValidationStatus;
  versionGroupId: string | null;
  isLatest: boolean;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type ConvertArtifactInput = {
  sourceArtifactId: string;
  targetFormat: ArtifactFormat;
  userId: string;
  options?: {
    revisionReason?: string;
    title?: string;
    idempotencyKey?: string | null;
    requestId?: string | null;
    jobId?: string | null;
  };
};

export type ConvertArtifactResult = {
  ok: boolean;
  artifact: UnifiedArtifact | null;
  quality: ConversionQuality;
  warnings: string[];
  errors: Array<{
    code: string;
    message: string;
    stage: string;
    retriable: boolean;
    diagnosticId: string;
  }>;
  reused?: boolean;
};

export type ArtifactJobPhase =
  | "queued"
  | "validating_input"
  | "planning"
  | "generating"
  | "converting"
  | "validating_output"
  | "rendering_preview"
  | "uploading"
  | "saving_artifact"
  | "completed"
  | "needs_input"
  | "retrying"
  | "failed"
  | "cancelled";

export type ArtifactUserErrorCode =
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
