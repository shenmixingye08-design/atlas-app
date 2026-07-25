import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { ArtifactType } from "./types";

const VALID: ReadonlySet<string> = new Set([
  "pdf",
  "docx",
  "pptx",
  "md",
  "txt",
  "xlsx",
]);

export type ArtifactFormatRecommendation = {
  recommended: DeliverableFormat[];
  other: DeliverableFormat[];
  formats: DeliverableFormat[];
  matchedRule: string;
};

function asFormats(values: readonly string[] | undefined): DeliverableFormat[] {
  if (!values) return [];
  return values.filter((value): value is DeliverableFormat => VALID.has(value));
}

function unique(formats: DeliverableFormat[]): DeliverableFormat[] {
  const seen = new Set<DeliverableFormat>();
  const result: DeliverableFormat[] = [];
  for (const format of formats) {
    if (seen.has(format)) continue;
    seen.add(format);
    result.push(format);
  }
  return result;
}

const TYPE_FALLBACK: Record<
  ArtifactType,
  { recommended: DeliverableFormat[]; other: DeliverableFormat[] }
> = {
  sales_material: { recommended: ["docx", "pdf", "pptx"], other: ["md"] },
  presentation: { recommended: ["pptx", "pdf"], other: ["docx"] },
  proposal: { recommended: ["docx", "pdf"], other: ["pptx", "md"] },
  plan: { recommended: ["docx", "pdf"], other: ["pptx", "md"] },
  report: { recommended: ["pdf", "docx"], other: ["md"] },
  contract: { recommended: ["docx", "pdf"], other: [] },
  invoice: { recommended: ["xlsx", "pdf"], other: ["docx"] },
  minutes: { recommended: ["docx", "pdf"], other: ["md"] },
  ranking: { recommended: ["docx", "pdf", "xlsx"], other: ["md"] },
  list: { recommended: ["xlsx"], other: ["pdf", "docx"] },
  household: { recommended: ["xlsx"], other: ["pdf"] },
  schedule: { recommended: ["xlsx", "docx", "pdf"], other: [] },
  research: { recommended: ["pdf", "docx"], other: ["md", "xlsx"] },
  manual: { recommended: ["docx", "pdf"], other: ["md"] },
  blog: { recommended: ["md", "docx"], other: ["pdf"] },
  sns: { recommended: ["md", "txt"], other: [] },
  youtube_script: { recommended: ["docx", "md"], other: ["pdf"] },
  estimate: { recommended: ["xlsx", "pdf", "docx"], other: [] },
  general: { recommended: ["docx", "pdf"], other: ["md"] },
};

/**
 * Recommend primary vs other download formats.
 * Never blindly list every format.
 */
export function recommendArtifactFormats(input: {
  artifactType: ArtifactType;
  assignment: string;
  content: string;
  override?: DeliverableFormat[];
  templateFormats?: {
    recommended: DeliverableFormat[];
    other: DeliverableFormat[];
  };
  excelApplicable?: boolean;
}): ArtifactFormatRecommendation {
  if (input.override && input.override.length > 0) {
    return {
      recommended: unique(input.override),
      other: [],
      formats: unique(input.override),
      matchedRule: "user_selected_formats",
    };
  }

  const fallback = TYPE_FALLBACK[input.artifactType] ?? TYPE_FALLBACK.general;
  let recommended = asFormats(input.templateFormats?.recommended);
  let other = asFormats(input.templateFormats?.other);

  if (recommended.length === 0) {
    recommended = [...fallback.recommended];
    other = [...fallback.other];
  }

  if (input.excelApplicable === false) {
    recommended = recommended.filter((format) => format !== "xlsx");
    other = other.filter((format) => format !== "xlsx");
  } else if (
    input.excelApplicable === true &&
    !recommended.includes("xlsx") &&
    !other.includes("xlsx")
  ) {
    if (
      ["ranking", "list", "household", "schedule", "invoice", "estimate"].includes(
        input.artifactType,
      )
    ) {
      recommended = unique(["xlsx", ...recommended]);
    }
  }

  // PowerPoint only when slide-oriented
  const slideOk =
    input.artifactType === "sales_material" ||
    input.artifactType === "presentation" ||
    input.artifactType === "proposal" ||
    input.artifactType === "plan" ||
    /スライド|写真付き|パワーポイント|営業資料|土地活用/.test(input.assignment);

  if (!slideOk) {
    recommended = recommended.filter((format) => format !== "pptx");
    other = other.filter((format) => format !== "pptx");
  }

  // SNS: keep copy/markdown only
  if (input.artifactType === "sns") {
    recommended = ["md", "txt"];
    other = [];
  }

  other = other.filter((format) => !recommended.includes(format));

  return {
    recommended: unique(recommended),
    other: unique(other),
    formats: unique([...recommended, ...other]),
    matchedRule: `artifact:${input.artifactType}`,
  };
}
