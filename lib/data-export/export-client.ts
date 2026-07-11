"use client";

import { addBackupHistoryEntry } from "./backup-history-store";
import { collectAtlasExportData } from "./collect-data";
import { blobToBase64, downloadBlob, uint8ArrayToBase64 } from "./download";
import { uploadBackupToDriveClient } from "./drive-client";
import {
  buildExportFileName,
  bundleToCsv,
  bundleToJson,
  bundleToMarkdown,
  bundleToZip,
  formatToMimeType,
} from "./formatters";
import type {
  ExportFormat,
  ExportProgress,
  ExportSectionSelection,
} from "./types";

export type ExportAtlasDataInput = {
  format: ExportFormat;
  sections?: ExportSectionSelection;
  destination?: "download" | "google_drive";
  onProgress?: (progress: ExportProgress) => void;
};

export type ExportAtlasDataResult = {
  fileName: string;
  sizeBytes: number;
  historyId: string;
};

export async function exportAtlasData(
  input: ExportAtlasDataInput,
): Promise<ExportAtlasDataResult> {
  const destination = input.destination ?? "download";

  input.onProgress?.({ stage: "collecting", percent: 0 });
  const bundle = await collectAtlasExportData({
    sections: input.sections,
    onProgress: input.onProgress,
  });

  input.onProgress?.({ stage: "formatting", percent: 10 });

  let blob: Blob;
  let fileName = buildExportFileName(input.format);

  switch (input.format) {
    case "json":
      blob = new Blob([bundleToJson(bundle)], {
        type: formatToMimeType("json"),
      });
      break;
    case "csv":
      blob = new Blob([bundleToCsv(bundle)], {
        type: formatToMimeType("csv"),
      });
      break;
    case "markdown":
      blob = new Blob([bundleToMarkdown(bundle)], {
        type: formatToMimeType("markdown"),
      });
      break;
    case "zip": {
      const zip = bundleToZip(bundle);
      blob = new Blob([new Uint8Array(zip)], { type: formatToMimeType("zip") });
      break;
    }
  }

  const sizeBytes = blob.size;
  input.onProgress?.({ stage: "formatting", percent: 80 });

  const historyId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    if (destination === "download") {
      input.onProgress?.({ stage: "downloading", percent: 95 });
      downloadBlob(blob, fileName);
    } else {
      input.onProgress?.({ stage: "uploading", percent: 90 });
      const base64 =
        input.format === "zip"
          ? uint8ArrayToBase64(new Uint8Array(await blob.arrayBuffer()))
          : await blobToBase64(blob);

      const upload = await uploadBackupToDriveClient({
        fileName,
        base64,
        mimeType: formatToMimeType(input.format),
      });

      if (upload.status !== "ready") {
        throw new Error(upload.message);
      }
    }

    addBackupHistoryEntry({
      id: historyId,
      createdAt,
      format: input.format,
      sizeBytes,
      status: "success",
      destination,
      fileName,
    });

    input.onProgress?.({ stage: "downloading", percent: 100 });

    const { reportClientAuditEvent } = await import(
      "@/lib/owner/audit-log/client"
    );
    reportClientAuditEvent({
      action: "data_export",
      targetId: fileName,
      result: "success",
      reason: `${input.format}:${destination}`,
    });

    return { fileName, sizeBytes, historyId };
  } catch (error) {
    addBackupHistoryEntry({
      id: historyId,
      createdAt,
      format: input.format,
      sizeBytes,
      status: "failed",
      destination,
      fileName,
      errorMessage:
        error instanceof Error ? error.message : "Export failed",
    });
    const { reportClientAuditEvent } = await import(
      "@/lib/owner/audit-log/client"
    );
    reportClientAuditEvent({
      action: "data_export",
      targetId: fileName,
      result: "failure",
      reason: error instanceof Error ? error.message : "Export failed",
    });
    throw error;
  }
}
