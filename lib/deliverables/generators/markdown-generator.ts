import {
  normalizeToStructuredDocument,
  structuredDocumentToMarkdown,
} from "../document/normalize"
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types"

import { createDeliverableFile } from "./shared"

/** Markdown export from the same Structured Document pipeline. */
export class MarkdownDeliverableGenerator implements DeliverableGenerator {
  readonly format = "md" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const normalized = normalizeToStructuredDocument(content, {
      titleHint: baseFileName,
    });
    const markdown = structuredDocumentToMarkdown(normalized.document);
    return createDeliverableFile(
      "md",
      baseFileName,
      Buffer.from(markdown, "utf8"),
      false,
    );
  }
}
