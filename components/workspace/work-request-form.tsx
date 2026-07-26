"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import {
  getUploadedAttachmentIds,
  ImageAttachmentPicker,
  type LocalImageDraft,
} from "@/components/vision/image-attachment-picker";
import { RequestDocumentPicker } from "@/components/request/request-document-picker";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { assignmentImpliesImageWork } from "@/lib/vision/gate";
import type { DocumentExtractClient } from "@/lib/attachments/documents/client-upload";

export type RequestExecutionMode = "once" | "recurring" | "delegate";
export type RequestPriority = "low" | "normal" | "high";

export type WorkRequestSubmitPayload = {
  assignment: string;
  metadata: Readonly<Record<string, unknown>>;
};

type WorkRequestFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (payload: WorkRequestSubmitPayload) => void;
  isLoading: boolean;
};

/**
 * Zero-friction request form with real image/document attachments.
 * Priority / schedule stay inferred — attachments are the only extra control.
 */
export function WorkRequestForm({
  value,
  onChange,
  onSubmit,
  isLoading,
}: WorkRequestFormProps) {
  const searchParams = useSearchParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [imageDrafts, setImageDrafts] = useState<LocalImageDraft[]>([]);
  const [documents, setDocuments] = useState<DocumentExtractClient[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [preferredFormat, setPreferredFormat] = useState<
    "auto" | "xlsx" | "docx" | "pdf" | "txt"
  >("auto");

  useEffect(() => {
    if (searchParams.get("attach") === "text") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [searchParams]);

  const uploading = imageDrafts.some(
    (d) => d.status === "pending" || d.status === "uploading",
  );
  const uploadedIds = getUploadedAttachmentIds(imageDrafts);
  const failedImages = imageDrafts.filter((d) => d.status === "failed");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || uploading) return;

    if (failedImages.length > 0) {
      setAttachError("アップロードに失敗した画像があります。削除するか再試行してください。");
      return;
    }

    if (assignmentImpliesImageWork(trimmed) && uploadedIds.length === 0 && documents.length === 0) {
      setAttachError(
        "この依頼には画像またはファイルの添付が必要です。レシート・請求書・表などを添付してください。",
      );
      return;
    }

    setAttachError(null);

    const documentBlock =
      documents.length > 0
        ? [
            "",
            "【添付ファイルの抽出テキスト】",
            ...documents.map((doc, index) => {
              return [
                `--- ファイル${index + 1}: ${doc.fileName} (${doc.mimeType}) ---`,
                doc.extractedText,
              ].join("\n");
            }),
          ].join("\n")
        : "";

    onSubmit({
      assignment: `${trimmed}${documentBlock}`,
      metadata: {
        requestUi: "secretary_zero_friction_v1",
        executionPreference: "once" satisfies RequestExecutionMode,
        priority: "normal" satisfies RequestPriority,
        skipWorkMemory: false,
        preferredDeliverableFormat: preferredFormat,
        requireVisionSuccess: uploadedIds.length > 0,
        ...(uploadedIds.length > 0 ? { attachmentIds: uploadedIds } : {}),
        ...(documents.length > 0
          ? {
              documentExtracts: documents.map((doc) => ({
                id: doc.id,
                fileName: doc.fileName,
                mimeType: doc.mimeType,
                bytes: doc.bytes,
                pageOrSheetCount: doc.pageOrSheetCount,
              })),
            }
          : {}),
      },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit =
    value.trim().length > 0 && !isLoading && !uploading && failedImages.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-8 overflow-x-hidden sm:space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-sm font-medium text-accent">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.secretaryHome.askTitle}</h1>
        <p className="text-body mx-auto max-w-xl text-[var(--text-secondary)]">
          {ui.secretaryHome.zeroFrictionHint}
        </p>
      </header>

      <section className="space-y-3" aria-label={ui.work.templatesLabel}>
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_REQUEST_PRESETS.slice(0, 4).map((preset) => {
            const selected = value.trim() === preset.prompt.trim();
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  onChange(preset.prompt);
                  requestAnimationFrame(() => {
                    const textarea = textareaRef.current;
                    if (!textarea) return;
                    textarea.focus();
                    const len = preset.prompt.length;
                    textarea.setSelectionRange(len, len);
                  });
                }}
                className={cn(
                  "touch-target rounded-full border px-4 py-2 text-sm font-medium transition-all focus-ring",
                  selected
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-[var(--border-subtle)] bg-[var(--card)] text-foreground hover:border-accent/40",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      <Card padding="lg" className="space-y-4 bg-[var(--card)] shadow-[var(--shadow-md)]">
        <Textarea
          ref={textareaRef}
          id="work-request"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={ui.secretaryHome.askPlaceholder}
          rows={7}
          disabled={isLoading}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[180px] resize-y border-none bg-transparent px-0 py-0 text-lg leading-relaxed shadow-none focus:ring-0"
        />

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <p className="mb-2 text-sm font-medium text-foreground">
            {ui.work.attachmentsLabel}
          </p>
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            {ui.work.attachmentsHint}
          </p>
          <ImageAttachmentPicker
            value={imageDrafts}
            onChange={setImageDrafts}
            disabled={isLoading}
            preferReadableText
          />
          <div className="mt-4">
            <RequestDocumentPicker
              value={documents}
              onChange={setDocuments}
              disabled={isLoading}
            />
          </div>
          {(uploadedIds.length > 0 || documents.length > 0) && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              添付 {uploadedIds.length + documents.length} 件
              {uploadedIds.length > 0 ? `（画像 ${uploadedIds.length}）` : ""}
              {documents.length > 0 ? `（文書 ${documents.length}）` : ""}
            </p>
          )}
        </div>

        <label className="block text-sm">
          <span className="font-medium text-foreground">成果物形式</span>
          <select
            className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2"
            value={preferredFormat}
            disabled={isLoading}
            onChange={(event) =>
              setPreferredFormat(
                event.target.value as typeof preferredFormat,
              )
            }
          >
            <option value="auto">自動判定</option>
            <option value="xlsx">Excel</option>
            <option value="docx">Word</option>
            <option value="pdf">PDF</option>
            <option value="txt">テキスト</option>
          </select>
        </label>
      </Card>

      {attachError && (
        <p className="rounded-lg border border-[var(--error)]/30 bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error)]">
          {attachError}
        </p>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={isLoading || uploading}
          className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
        >
          {uploading ? "アップロード中…" : ui.secretaryHome.askSubmit}
        </Button>
        <p className="mt-3 text-center text-sm text-[var(--text-secondary)]">
          {ui.secretaryHome.askHint}
        </p>
      </div>
    </div>
  );
}
