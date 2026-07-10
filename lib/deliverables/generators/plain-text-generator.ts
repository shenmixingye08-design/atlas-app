import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile } from "./shared";

/** Plain text deliverable — production-ready. */
export class PlainTextDeliverableGenerator implements DeliverableGenerator {
  readonly format = "txt" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    return createDeliverableFile(
      "txt",
      baseFileName,
      Buffer.from(content, "utf-8"),
      false,
    );
  }
}
