import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile } from "./shared";

/** Markdown deliverable — UTF-8 export text saved as-is. */
export class MarkdownDeliverableGenerator implements DeliverableGenerator {
  readonly format = "md" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const body = content.trimEnd() ? `${content.trimEnd()}\n` : "";
    return createDeliverableFile("md", baseFileName, Buffer.from(body, "utf-8"), false);
  }
}
