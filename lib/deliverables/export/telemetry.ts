import type { SourceFormat } from "../document/types"
import { RENDERER_VERSION } from "../document/types"

export type DeliverableExportTelemetry = {
  sourceFormat: SourceFormat
  normalizedSuccessfully: boolean
  normalizationWarnings: string[]
  canonicalHtmlLength: number
  wordFileSize: number | null
  wordTextLength: number | null
  pdfFileSize: number | null
  pdfPageCount: number | null
  pdfExtractedTextLength: number | null
  exportValidationResult: "pass" | "fail" | "skipped"
  retryCount: number
  failureReason: string | null
  rendererVersion: string
  format: string
  recordedAt: string
}

type Scope = typeof globalThis & {
  __atlasDeliverableExportTelemetry?: DeliverableExportTelemetry[]
}

function bucket(): DeliverableExportTelemetry[] {
  const s = globalThis as Scope
  if (!s.__atlasDeliverableExportTelemetry) {
    s.__atlasDeliverableExportTelemetry = []
  }
  return s.__atlasDeliverableExportTelemetry
}

export function resetExportTelemetryForTests(): void {
  ;(globalThis as Scope).__atlasDeliverableExportTelemetry = []
}

export function recordExportTelemetry(
  entry: Omit<DeliverableExportTelemetry, "recordedAt" | "rendererVersion"> & {
    rendererVersion?: string
  },
): DeliverableExportTelemetry {
  const row: DeliverableExportTelemetry = {
    ...entry,
    rendererVersion: entry.rendererVersion ?? RENDERER_VERSION,
    recordedAt: new Date().toISOString(),
  }
  bucket().unshift(row)
  if (bucket().length > 500) bucket().length = 500
  return row
}

export function listExportTelemetry(limit = 100): DeliverableExportTelemetry[] {
  return bucket().slice(0, limit)
}
