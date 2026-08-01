import "server-only";

import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { previewWorkbook } from "@/lib/excel-secretary/export";
import { ArtifactPlatformError } from "./errors";
import { getUnifiedArtifact } from "./register";
import type { ArtifactFormat } from "./types";

export type UnifiedPreview = {
  format: ArtifactFormat;
  ok: boolean;
  kind: "text" | "table" | "pages" | "slides" | "image" | "unavailable";
  title: string;
  downloadUrl: string;
  fileSize: number;
  sizeWarning?: string;
  pages?: Array<{ index: number; text: string }>;
  table?: { headers: string[]; rows: string[][]; truncated: boolean };
  imageDataUrl?: string;
  message?: string;
  lazy: boolean;
};

const LARGE_FILE_BYTES = 5 * 1024 * 1024;

export async function buildUnifiedPreview(input: {
  artifactId: string;
  userId: string;
  maxPages?: number;
}): Promise<UnifiedPreview> {
  const artifact = await getUnifiedArtifact(input.artifactId, input.userId);
  if (!artifact) {
    throw new ArtifactPlatformError(
      "source_artifact_not_found",
      input.artifactId
    );
  }
  if (artifact.userId !== input.userId) {
    throw new ArtifactPlatformError("permission_denied", "owner mismatch");
  }

  const base = {
    format: artifact.format,
    title: artifact.title,
    downloadUrl: artifact.downloadUrl,
    fileSize: artifact.fileSize,
    sizeWarning:
      artifact.fileSize > LARGE_FILE_BYTES
        ? "大きなファイルです。先頭のみプレビューします。"
        : undefined,
    lazy: artifact.fileSize > LARGE_FILE_BYTES,
  };

  try {
    const stored = await getStoredDeliverableForUser(
      artifact.id,
      input.userId
    );
    if (!stored?.buffer?.byteLength) {
      return {
        ...base,
        ok: false,
        kind: "unavailable",
        message: "プレビュー用データがありません。ダウンロードは可能です。",
      };
    }

    const maxPages = input.maxPages ?? (base.lazy ? 3 : 20);
    const buf = stored.buffer;

    switch (artifact.format) {
      case "docx": {
        const extracted = await mammoth.extractRawText({ buffer: buf });
        const text = extracted.value || "";
        const chunks = text.split(/\n{2,}/).slice(0, maxPages);
        return {
          ...base,
          ok: true,
          kind: "pages",
          pages: chunks.map((t, i) => ({
            index: i + 1,
            text: t.slice(0, 4000),
          })),
        };
      }
      case "pdf": {
        const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
        const count = pdf.getPageCount();
        const pages = Array.from({ length: Math.min(count, maxPages) }, (_, i) => ({
          index: i + 1,
          text: `ページ ${i + 1} / ${count}`,
        }));
        return { ...base, ok: true, kind: "pages", pages };
      }
      case "xlsx": {
        const preview = await previewWorkbook(buf, artifact.title);
        const sheet = preview.sheets[0];
        const maxRows = base.lazy ? 50 : 200;
        const rows = (sheet?.rows ?? []).slice(0, maxRows);
        return {
          ...base,
          ok: true,
          kind: "table",
          table: {
            headers: sheet?.headers ?? [],
            rows,
            truncated: (sheet?.rowCount ?? 0) > rows.length,
          },
        };
      }
      case "csv": {
        const text = buf.toString("utf8").replace(/^\uFEFF/, "");
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = (lines[0] ?? "").split(",");
        const rows = lines.slice(1, base.lazy ? 51 : 201).map((l) => l.split(","));
        return {
          ...base,
          ok: true,
          kind: "table",
          table: {
            headers,
            rows,
            truncated: lines.length > rows.length + 1,
          },
        };
      }
      case "pptx": {
        // Lightweight: list slide markers from OOXML text if present
        const raw = buf.toString("utf8");
        const titles = [...raw.matchAll(/a:t>([^<]{1,80})</g)]
          .map((m) => m[1]!)
          .filter((t) => t.trim())
          .slice(0, maxPages * 3);
        const pages = Array.from({ length: Math.min(maxPages, 12) }, (_, i) => ({
          index: i + 1,
          text: titles[i] ?? `スライド ${i + 1}`,
        }));
        return { ...base, ok: true, kind: "slides", pages };
      }
      case "png":
      case "jpg": {
        const mime = artifact.format === "png" ? "image/png" : "image/jpeg";
        const b64 = buf.toString("base64");
        return {
          ...base,
          ok: true,
          kind: "image",
          imageDataUrl: `data:${mime};base64,${b64.slice(0, base.lazy ? 200_000 : undefined)}`,
        };
      }
      case "md":
      case "markdown":
      case "txt":
      case "json": {
        return {
          ...base,
          ok: true,
          kind: "text",
          pages: [
            {
              index: 1,
              text: buf.toString("utf8").slice(0, base.lazy ? 8000 : 40_000),
            },
          ],
        };
      }
      default:
        return {
          ...base,
          ok: false,
          kind: "unavailable",
          message: "この形式のプレビューは未対応です。ダウンロードをご利用ください。",
        };
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      kind: "unavailable",
      message:
        error instanceof ArtifactPlatformError
          ? error.userMessage
          : "プレビューに失敗しました。ダウンロードは可能です。",
    };
  }
}
