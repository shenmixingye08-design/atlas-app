"use client";

import { DOCUMENT_ATTACHMENT_LIMITS } from "./types";

export type DocumentExtractClient = {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  extractedText: string;
  pageOrSheetCount: number | null;
  warnings: string[];
};

const ACCEPT_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "ppt",
  "pptx",
  "txt",
  "rtf",
]);

export function filterDocumentFiles(files: File[]): File[] {
  return files
    .filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      return ACCEPT_EXT.has(ext) || file.type.startsWith("text/") || file.type.includes("pdf") || file.type.includes("officedocument") || file.type.includes("msword") || file.type.includes("ms-excel") || file.type.includes("ms-powerpoint") || file.type.includes("csv");
    })
    .slice(0, DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest);
}

export async function uploadDocumentsToAtlas(
  files: File[],
  options?: { signal?: AbortSignal },
): Promise<{ documents: DocumentExtractClient[]; warnings: string[] }> {
  const docs = filterDocumentFiles(files);
  if (docs.length === 0) {
    return { documents: [], warnings: [] };
  }

  const form = new FormData();
  for (const file of docs) {
    form.append("files", file, file.name);
  }

  const response = await fetch("/api/attachments/documents", {
    method: "POST",
    body: form,
    signal: options?.signal,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    documents?: DocumentExtractClient[];
    warnings?: string[];
  };

  if (!response.ok) {
    throw new Error(payload.error || "ファイルのアップロードに失敗しました");
  }

  return {
    documents: payload.documents ?? [],
    warnings: payload.warnings ?? [],
  };
}
