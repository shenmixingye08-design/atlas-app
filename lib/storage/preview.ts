/**
 * Multi-format preview — download remains available when preview fails.
 */

import type { StoredDeliverable } from "@/lib/deliverables/store";
import { buildWordPreviewModel } from "@/lib/deliverables/word-preview";
import { resolveDocumentModel } from "@/lib/deliverables/document-model";
import { kindFromDeliverableFormat, kindFromMimeAndName } from "@/lib/artifact-registry/identity";
import type { ArtifactKind } from "@/lib/artifact-registry/types";

export type ArtifactPreviewResult =
  | {
      ok: true;
      kind: ArtifactKind;
      preview: Record<string, unknown>;
      downloadAvailable: true;
    }
  | {
      ok: false;
      kind: ArtifactKind;
      error: string;
      errorCode: string;
      downloadAvailable: true;
      retryable: boolean;
    };

function detectKind(stored: StoredDeliverable): ArtifactKind {
  if (stored.fileName.toLowerCase().endsWith(".csv")) return "csv";
  if (
    stored.mimeType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(stored.fileName)
  ) {
    return "image";
  }
  return kindFromDeliverableFormat(stored.format);
}

export function buildArtifactPreview(
  stored: StoredDeliverable,
): ArtifactPreviewResult {
  const kind = detectKind(stored);

  try {
    if (stored.buffer.byteLength === 0) {
      return {
        ok: false,
        kind,
        error: "ファイルが空のためプレビューできません。ダウンロードは可能です。",
        errorCode: "zero_byte",
        downloadAvailable: true,
        retryable: true,
      };
    }

    switch (kind) {
      case "docx": {
        const resolved = resolveDocumentModel({
          content: stored.sourceContent || stored.baseFileName,
          assignment: stored.baseFileName,
          title: stored.baseFileName,
        });
        const preview = buildWordPreviewModel({
          model: resolved.model,
          sizeBytes: stored.buffer.byteLength,
          status: "ready",
        });
        return {
          ok: true,
          kind,
          preview: preview as unknown as Record<string, unknown>,
          downloadAvailable: true,
        };
      }
      case "xlsx": {
        return {
          ok: true,
          kind,
          preview: {
            type: "excel",
            fileName: stored.fileName,
            sizeBytes: stored.buffer.byteLength,
            note: "表計算プレビュー（概要）",
            sheets: ["Sheet1"],
            sha256: stored.contentSha256,
          },
          downloadAvailable: true,
        };
      }
      case "pdf": {
        const head = stored.buffer.subarray(0, 8).toString("utf8");
        if (!head.startsWith("%PDF")) {
          return {
            ok: false,
            kind,
            error: "PDFヘッダが不正です。ダウンロードでご確認ください。",
            errorCode: "pdf_invalid",
            downloadAvailable: true,
            retryable: true,
          };
        }
        return {
          ok: true,
          kind,
          preview: {
            type: "pdf",
            fileName: stored.fileName,
            sizeBytes: stored.buffer.byteLength,
            header: head.slice(0, 8),
            pageEstimate: Math.max(1, Math.round(stored.buffer.byteLength / 50_000)),
          },
          downloadAvailable: true,
        };
      }
      case "pptx": {
        return {
          ok: true,
          kind,
          preview: {
            type: "powerpoint",
            fileName: stored.fileName,
            sizeBytes: stored.buffer.byteLength,
            note: "スライドプレビュー（概要）",
            sha256: stored.contentSha256,
          },
          downloadAvailable: true,
        };
      }
      case "csv": {
        const text = stored.buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter((l) => l.length > 0).slice(0, 20);
        return {
          ok: true,
          kind,
          preview: {
            type: "csv",
            fileName: stored.fileName,
            rowsPreview: lines,
            rowCountEstimate: text.split(/\r?\n/).filter(Boolean).length,
          },
          downloadAvailable: true,
        };
      }
      case "image": {
        return {
          ok: true,
          kind,
          preview: {
            type: "image",
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            sizeBytes: stored.buffer.byteLength,
            note: "画像プレビューメタデータ",
          },
          downloadAvailable: true,
        };
      }
      default: {
        const text = stored.buffer
          .subarray(0, Math.min(2000, stored.buffer.byteLength))
          .toString("utf8");
        return {
          ok: true,
          kind: kindFromMimeAndName(stored.mimeType, stored.fileName),
          preview: {
            type: "text",
            fileName: stored.fileName,
            excerpt: text.slice(0, 500),
          },
          downloadAvailable: true,
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      kind,
      error:
        error instanceof Error
          ? error.message
          : "プレビューに失敗しました。ダウンロードは利用できます。",
      errorCode: "preview_exception",
      downloadAvailable: true,
      retryable: true,
    };
  }
}
