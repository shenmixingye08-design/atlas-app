import type {
  DeliverableFormat,
  GeneratedDeliverableFile,
} from "../types";
import {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_MIME_TYPES,
} from "../types";
import { buildFileName } from "../filename";

export function createDeliverableFile(
  format: DeliverableFormat,
  baseFileName: string,
  buffer: Buffer,
  isPlaceholder: boolean,
): GeneratedDeliverableFile {
  return {
    format,
    fileName: buildFileName(baseFileName, DELIVERABLE_EXTENSIONS[format]),
    mimeType: DELIVERABLE_MIME_TYPES[format],
    buffer,
    isPlaceholder,
  };
}

export function formatGeneratedDate(): string {
  return new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
