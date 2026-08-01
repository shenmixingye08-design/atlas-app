import "server-only";

import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";
import {
  createPptxFromAssignment,
  looksLikePptxZip,
} from "@/lib/pptx-secretary";

/**
 * Production PowerPoint generator — delegates to PPTX Secretary
 * (structured outline → validated model → pptxgenjs).
 */
export class PptxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pptx" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const assignment =
      content
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("#")) ||
      baseFileName ||
      "プレゼン資料を作って";

    const result = await createPptxFromAssignment({
      assignment: /スライド|プレゼン|資料|提案|研修|報告/.test(assignment)
        ? assignment
        : `${baseFileName || "プレゼン資料"}を作って`,
      contentMarkdown: content,
    });

    if (!result.ok || !result.buffer || !looksLikePptxZip(result.buffer)) {
      throw new Error(
        result.errors[0]?.message || "PowerPointの生成に失敗しました",
      );
    }

    return createDeliverableFile(
      "pptx",
      baseFileName || result.fileName.replace(/\.pptx$/i, ""),
      result.buffer,
      false,
    );
  }
}

/** @deprecated Use {@link PptxDeliverableGenerator}. */
export const PptxPlaceholderGenerator = PptxDeliverableGenerator;
