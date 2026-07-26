import { exportWithFallback } from "../export/fallback"
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types"
import { createDeliverableFile } from "./shared"

// Re-export for older tests
export { subsetIndexForCodePoint } from "../fonts/japanese-pdf-fonts"

/**
 * PDF from Structured Document via pdf-lib (not screenshot / not UI HTML).
 * Blank or near-empty PDFs are rejected — never returned as success.
 */
export class PdfDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pdf" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const result = await exportWithFallback({
      source: content,
      format: "pdf",
      titleHint: baseFileName,
    });

    if (!result.ok || !result.buffer) {
      throw new Error(
        result.failureReason ??
          "PDF export validation failed — refusing to return a blank file",
      );
    }

    return createDeliverableFile("pdf", baseFileName, result.buffer, false);
  }
}
