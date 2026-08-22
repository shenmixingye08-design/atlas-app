"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { Button } from "@/components/ui/button";
import { ImagePreviewList } from "@/components/vision/image-preview-list";
import {
  filterImageFiles,
  ClientImageUploadError,
  uploadImagesToAtlas,
  type UploadedAttachmentClient,
} from "@/lib/attachments/client-upload";
import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import {
  logVisionPipeline,
  newVisionTraceId,
} from "@/lib/vision/pipeline-log";

export type LocalImageDraft = {
  localId: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?: string;
  developerCode?: string;
  diagnosticId?: string;
  uploaded?: UploadedAttachmentClient;
};

type ImageAttachmentPickerProps = {
  value: LocalImageDraft[];
  onChange: (next: LocalImageDraft[]) => void;
  disabled?: boolean;
  className?: string;
  preferReadableText?: boolean;
  /** Lets parent route image drops from other UI zones into this uploader. */
  addFilesRef?: MutableRefObject<((files: FileList | File[]) => void) | null>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function getUploadedAttachmentIds(drafts: LocalImageDraft[]): string[] {
  return drafts
    .filter((item) => item.status === "uploaded" && item.uploaded)
    .map((item) => item.uploaded!.id);
}

export function ImageAttachmentPicker({
  value,
  onChange,
  disabled,
  className,
  preferReadableText = true,
  addFilesRef,
}: ImageAttachmentPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const addFiles = useCallback(
    (list: FileList | File[], options?: { forceReprocess?: boolean }) => {
      if (disabled) return;
      const selected = Array.from(list);
      const images = filterImageFiles(selected);
      const selectTraceId = newVisionTraceId();
      logVisionPipeline({
        stage: "image_select",
        ok: images.length > 0,
        traceId: selectTraceId,
        fileCount: images.length,
        fileName: images[0]?.name ?? selected[0]?.name ?? null,
        mimeType: images[0]?.type || selected[0]?.type || null,
        byteLength: images[0]?.size ?? selected[0]?.size ?? null,
        dropReason:
          images.length === 0 ? "selected_files_filtered_out" : null,
      });
      if (images.length === 0) return;
      const remaining =
        ATTACHMENT_LIMITS.maxImagesPerRequest - valueRef.current.length;
      if (remaining <= 0) return;

      const nextDrafts: LocalImageDraft[] = images.slice(0, remaining).map((file) => ({
        localId: `local_${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending",
        progress: 0,
      }));

      let current = [...valueRef.current, ...nextDrafts];
      onChange(current);

      void (async () => {
        for (const draft of nextDrafts) {
          const traceId = newVisionTraceId();
          current = current.map((item) =>
            item.localId === draft.localId
              ? { ...item, status: "uploading" as const, progress: 40 }
              : item,
          );
          onChange(current);
          try {
            const result = await uploadImagesToAtlas([draft.file], {
              preferReadableText,
              traceId,
              forceReprocess: Boolean(options?.forceReprocess),
            });
            const uploaded = result.attachments[0];
            if (!uploaded?.id) {
              logVisionPipeline({
                stage: "image_dropped",
                ok: false,
                traceId,
                dropReason: "upload_returned_no_attachment_id",
                fileName: draft.file.name,
              });
              throw new Error("画像のアップロードに失敗しました");
            }
            current = current.map((item) =>
              item.localId === draft.localId
                ? {
                    ...item,
                    status: "uploaded" as const,
                    progress: 100,
                    uploaded,
                  }
                : item,
            );
          } catch (error) {
            let message =
              error instanceof Error
                ? error.message
                : "画像のアップロードに失敗しました";
            const uploadError =
              error instanceof ClientImageUploadError ? error : null;
            // Surface server diagnostics for infra failures (table/bucket/config).
            if (
              message.includes("table_missing") ||
              message.includes("config_missing") ||
              message.includes("bucket_missing")
            ) {
              try {
                const diag = await fetch("/api/attachments/diagnostics");
                if (diag.ok) {
                  const body = (await diag.json()) as {
                    blockingCode?: string | null;
                    migrationHint?: string | null;
                  };
                  if (body.blockingCode || body.migrationHint) {
                    message = [
                      message,
                      body.blockingCode ? `原因: ${body.blockingCode}` : null,
                      body.migrationHint ?? null,
                    ]
                      .filter(Boolean)
                      .join(" / ");
                  }
                }
              } catch {
                /* keep original message */
              }
            }
            current = current.map((item) =>
              item.localId === draft.localId
                ? {
                    ...item,
                    status: "failed" as const,
                    progress: 0,
                    error: message,
                    developerCode: uploadError?.developerCode ?? undefined,
                    diagnosticId: uploadError?.diagnosticId ?? undefined,
                  }
                : item,
            );
          }
          onChange(current);
        }
      })();
    },
    [disabled, onChange, preferReadableText],
  );

  useEffect(() => {
    if (!addFilesRef) return;
    addFilesRef.current = addFiles;
    return () => {
      addFilesRef.current = null;
    };
  }, [addFiles, addFilesRef]);

  const remove = (localId: string) => {
    const target = value.find((item) => item.localId === localId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((item) => item.localId !== localId));
  };

  const retry = (localId: string) => {
    const target = value.find((item) => item.localId === localId);
    if (!target) return;
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    const remaining = value.filter((item) => item.localId !== localId);
    valueRef.current = remaining;
    onChange(remaining);
    addFiles([target.file], { forceReprocess: true });
  };

  const uploadedCount = getUploadedAttachmentIds(value).length;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "rounded-xl border border-dashed border-[var(--border-subtle)] p-4 transition",
          isDragging && "border-accent bg-accent/5",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 touch-manipulation"
            disabled={disabled}
            onClick={() => galleryRef.current?.click()}
            aria-label={ui.work.attachPickImage}
          >
            {ui.work.attachPickImage}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 touch-manipulation"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            aria-label={ui.work.attachTakePhoto}
          >
            {ui.work.attachTakePhoto}
          </Button>
          <p className="text-xs text-[var(--text-secondary)]">
            JPEG / PNG / WEBP（最大{ATTACHMENT_LIMITS.maxImagesPerRequest}枚・
            {Math.round(ATTACHMENT_LIMITS.maxOriginalBytes / (1024 * 1024))}MB）
            ／ HEICは変換可能な場合のみ
          </p>
        </div>
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <ImagePreviewList
        items={value.map((item) => ({
          id: item.localId,
          previewUrl: item.previewUrl,
          fileName: item.file.name,
          sizeLabel: formatBytes(item.file.size),
          status: item.status,
          progress: item.progress,
          error: item.error,
          developerCode: item.developerCode,
          diagnosticId: item.diagnosticId,
        }))}
        onRemove={remove}
        onRetry={retry}
      />

      {uploadedCount > 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          アップロード済み {uploadedCount} 枚（文章を入力して送信すると解析します）
        </p>
      )}
    </div>
  );
}
