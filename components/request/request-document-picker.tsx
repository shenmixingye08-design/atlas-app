"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  filterDocumentFiles,
  uploadDocumentsToAtlas,
  type DocumentExtractClient,
} from "@/lib/attachments/documents/client-upload";
import { DOCUMENT_ATTACHMENT_LIMITS } from "@/lib/attachments/documents/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type RequestDocumentPickerProps = {
  value: DocumentExtractClient[];
  onChange: (next: DocumentExtractClient[]) => void;
  disabled?: boolean;
  className?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function RequestDocumentPicker({
  value,
  onChange,
  disabled,
  className,
}: RequestDocumentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (list: FileList | File[]) => {
    if (disabled || busy) return;
    const docs = filterDocumentFiles(Array.from(list));
    if (docs.length === 0) {
      setError("対応していないファイル形式です（PDF / Word / Excel / CSV / PowerPoint / テキスト）");
      return;
    }
    const remaining =
      DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest - value.length;
    if (remaining <= 0) {
      setError(`添付は最大${DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest}件までです`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await uploadDocumentsToAtlas(docs.slice(0, remaining));
      // Dedupe by fileName+bytes
      const merged = [...value];
      for (const doc of result.documents) {
        if (
          merged.some(
            (item) =>
              item.fileName === doc.fileName && item.bytes === doc.bytes,
          )
        ) {
          continue;
        }
        merged.push(doc);
      }
      onChange(merged.slice(0, DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest));
      if (result.warnings[0]) setError(result.warnings[0]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ファイルのアップロードに失敗しました",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 touch-manipulation"
          disabled={disabled || busy}
          isLoading={busy}
          onClick={() => inputRef.current?.click()}
          aria-label={ui.work.attachPickFile}
        >
          {ui.work.attachPickFile}
        </Button>
        <p className="self-center text-xs text-[var(--text-secondary)]">
          PDF / Word / Excel / CSV / PowerPoint / テキスト（最大
          {DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest}件・
          {Math.round(DOCUMENT_ATTACHMENT_LIMITS.maxOriginalBytes / (1024 * 1024))}
          MB）
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,application/pdf,text/plain,text/csv"
        disabled={disabled || busy}
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((doc) => (
            <li
              key={doc.id}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {doc.fileName}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {doc.mimeType} · {formatBytes(doc.bytes)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || busy}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== doc.id))
                }
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
