import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import type { GeneratedDeliverableFile } from "@/lib/deliverables/types";
import type { ArtifactEvalCase } from "@/lib/artifact-durability/types";

export async function generateForCase(
  c: ArtifactEvalCase
): Promise<GeneratedDeliverableFile> {
  const base = c.title.replace(/\s+/g, "_").slice(0, 40);
  switch (c.format) {
    case "docx":
      return new DocxDeliverableGenerator().generate(c.content, base, {
        assignment: c.assignment,
        title: c.title,
      });
    case "xlsx":
      return new XlsxDeliverableGenerator().generate(c.content, base, {
        assignment: c.assignment,
      });
    case "pdf":
      return new PdfDeliverableGenerator().generate(c.content, base);
    case "pptx":
      // Prefer assignment text so PPTX secretary builds unique outlines per case.
      return new PptxDeliverableGenerator().generate(
        `${c.assignment}\n\n${c.content}`,
        base
      );
    default:
      throw new Error(`unsupported format ${(c as ArtifactEvalCase).format}`);
  }
}
