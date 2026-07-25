import {
  contentHasMarkdownTable,
  shouldGenerateXlsx,
} from "@/lib/deliverables/excel-data";
import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { ArtifactFormatPlan, ArtifactType } from "./types";

const BASE_BY_TYPE: Record<
  ArtifactType,
  { formats: DeliverableFormat[]; upcoming: Array<"pptx"> }
> = {
  sales_material: { formats: ["pptx", "pdf", "docx"], upcoming: [] },
  presentation: { formats: ["pptx", "pdf"], upcoming: [] },
  proposal: { formats: ["docx", "pdf"], upcoming: ["pptx"] },
  plan: { formats: ["docx", "pdf"], upcoming: [] },
  report: { formats: ["pdf", "docx"], upcoming: [] },
  contract: { formats: ["docx", "pdf"], upcoming: [] },
  invoice: { formats: ["xlsx", "pdf", "docx"], upcoming: [] },
  minutes: { formats: ["docx", "pdf"], upcoming: [] },
  ranking: { formats: ["xlsx", "docx", "pdf"], upcoming: [] },
  list: { formats: ["xlsx", "docx", "pdf"], upcoming: [] },
  household: { formats: ["xlsx", "pdf"], upcoming: [] },
  schedule: { formats: ["xlsx", "docx", "pdf"], upcoming: [] },
  research: { formats: ["pdf", "docx"], upcoming: [] },
  manual: { formats: ["docx", "pdf"], upcoming: [] },
  blog: { formats: ["md", "docx"], upcoming: [] },
  sns: { formats: ["md", "txt"], upcoming: [] },
  general: { formats: ["docx", "pdf", "md"], upcoming: [] },
};

function uniqueFormats(formats: DeliverableFormat[]): DeliverableFormat[] {
  const seen = new Set<DeliverableFormat>();
  const result: DeliverableFormat[] = [];
  for (const format of formats) {
    if (seen.has(format)) continue;
    seen.add(format);
    result.push(format);
  }
  return result;
}

function withXlsx(formats: DeliverableFormat[]): DeliverableFormat[] {
  if (formats.includes("xlsx")) return formats;
  return ["xlsx", ...formats];
}

/**
 * Choose downloadable formats from artifact type + content shape.
 * Deterministic — no AI.
 */
export function recommendArtifactFormats(input: {
  artifactType: ArtifactType;
  assignment: string;
  content: string;
  override?: DeliverableFormat[];
}): ArtifactFormatPlan {
  if (input.override && input.override.length > 0) {
    const formats = shouldGenerateXlsx(input.assignment, input.content)
      ? withXlsx(input.override)
      : [...input.override];
    return {
      formats: uniqueFormats(formats),
      matchedRule: "user_selected_formats",
      upcomingFormats: [],
    };
  }

  const base = BASE_BY_TYPE[input.artifactType];
  let formats = [...base.formats];
  let matchedRule = `artifact:${input.artifactType}`;

  const wantsExcel =
    shouldGenerateXlsx(input.assignment, input.content) ||
    contentHasMarkdownTable(input.content) ||
    ["ranking", "list", "household", "schedule", "invoice"].includes(
      input.artifactType,
    );

  if (wantsExcel) {
    formats = withXlsx(formats);
    matchedRule = `${matchedRule}+xlsx`;
  }

  // Always offer Markdown as an internal/export option for document-like work
  // (kept off SNS-only flows to avoid clutter).
  if (
    input.artifactType !== "sns" &&
    !formats.includes("md") &&
    !formats.includes("txt")
  ) {
    formats = [...formats, "md"];
  }

  return {
    formats: uniqueFormats(formats),
    matchedRule,
    upcomingFormats: base.upcoming,
  };
}
