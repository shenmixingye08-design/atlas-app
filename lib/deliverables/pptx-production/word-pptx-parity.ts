import "server-only";

import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";

import { inspectPptxProduction } from "./pptx-inspect";

export type WordPptxParityResult = {
  ok: boolean;
  reasons: string[];
  mode: "heading_to_slides";
  headingCount: number;
  slideCount: number;
};

/**
 * Word→PowerPoint structure parity (same markdown source).
 * Headings become section slides; bullets/tables/images map to slide content.
 */
export async function verifyWordPptxParity(
  content: string,
): Promise<WordPptxParityResult> {
  const reasons: string[] = [];
  const parsed = parseDeliverableContent(content);
  const headingCount = parsed.sections.length + (parsed.title ? 1 : 0);

  const file = await new PptxDeliverableGenerator().generate(
    content,
    "word-pptx-parity",
  );
  const inspect = inspectPptxProduction(file.buffer);
  if (!inspect.ok) reasons.push(...inspect.reasons.map((r) => `pptx:${r}`));

  // Title + agenda + sections + summary + closing ≈ headingCount + extras
  if (inspect.slideCount < Math.max(3, headingCount)) {
    reasons.push(
      `slide_underbuild:${inspect.slideCount}<${headingCount}`,
    );
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    mode: "heading_to_slides",
    headingCount,
    slideCount: inspect.slideCount,
  };
}
