import { exportWithFallback } from "../export/fallback"
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types"
import { createDeliverableFile } from "./shared"

/** Word (.docx) from Structured Document — never embeds raw JSON. */
export class DocxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "docx" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const result = await exportWithFallback({
      source: content,
      format: "docx",
      titleHint: baseFileName,
    });

    if (!result.ok || !result.buffer) {
      throw new Error(
        result.failureReason ??
          "Word export validation failed — refusing to return a corrupt file",
      );
    }

    return createDeliverableFile("docx", baseFileName, result.buffer, false);
  }
}

/** @deprecated Use {@link DocxDeliverableGenerator}. */
export const DocxPlaceholderGenerator = DocxDeliverableGenerator;
