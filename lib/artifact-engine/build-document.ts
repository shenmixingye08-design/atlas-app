import {
  buildStructuredDocument,
  cleanDeliverableSource,
  stripInlineMarkdown,
} from "@/lib/deliverables/document-model";
import { formatGeneratedDate } from "@/lib/deliverables/generators/shared";
import type { DeliverableFormat } from "@/lib/deliverables/types";

import type {
  ArtifactBlock,
  ArtifactDocument,
  ArtifactSection,
} from "./document";
import { detectArtifactType } from "./detect-artifact-type";
import { buildExcelPayload } from "./excel-schema";
import { detectQualityGaps } from "./quality-gaps";
import type { OrgAssistProfile } from "./org-assist-store";
import {
  buildFormatStates,
  resolveCompletionStatus,
} from "./completion";
import { buildStructurePlan } from "./structure-plan";
import { selectArtifactTemplate } from "./templates/select";
import type { ArtifactTemplateId } from "./templates/types";
import { CATEGORY_BY_ARTIFACT_TYPE } from "./templates/registry";
import { recommendArtifactFormats } from "./recommend-formats";

const LEAK_PATTERN =
  /\b(type|summary|content|markdown)\s*[:=]\s*["'{]|```|^\s*#\s|^\s*---\s*$/m;

function toArtifactBlocks(
  blocks: ReturnType<typeof buildStructuredDocument>["sections"][number]["blocks"],
): ArtifactBlock[] {
  const result: ArtifactBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        result.push({
          type: "paragraph",
          text: stripInlineMarkdown(block.text),
        });
        break;
      case "bulletList":
        result.push({
          type: "bulletList",
          items: block.items.map(stripInlineMarkdown),
        });
        break;
      case "numberedList":
        result.push({
          type: "numberedList",
          items: block.items.map(stripInlineMarkdown),
        });
        break;
      case "table":
        result.push({
          type: "table",
          headers: block.headers.map(stripInlineMarkdown),
          rows: block.rows.map((row) => row.map(stripInlineMarkdown)),
        });
        break;
      case "callout":
        result.push({
          type: "callout",
          variant: block.variant,
          text: stripInlineMarkdown(block.text),
        });
        break;
      case "imagePlaceholder":
        result.push({
          type: "imagePlaceholder",
          caption: stripInlineMarkdown(block.caption),
        });
        break;
      case "keyCard":
        result.push({
          type: "keyCard",
          title: stripInlineMarkdown(block.title),
          items: block.items.map(stripInlineMarkdown),
        });
        break;
      default:
        break;
    }
  }
  return result;
}

function looksLikeJsonBlob(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return /"type"\s*:|"markdown"\s*:|"content"\s*:/.test(trimmed);
  }
}

export type BuildArtifactDocumentInput = {
  assignment: string;
  content: string;
  title?: string;
  templateOverride?: ArtifactTemplateId;
  orgProfile?: OrgAssistProfile | null;
  generatedFiles?: Array<{
    format: DeliverableFormat;
    downloadUrl?: string;
    fileName?: string;
    sizeBytes?: number;
  }>;
  failedFormats?: DeliverableFormat[];
};

/**
 * Build the canonical ArtifactDocument IR.
 * Never returns raw AI JSON / Markdown chrome for display.
 */
export function buildArtifactDocument(
  input: BuildArtifactDocumentInput,
): ArtifactDocument {
  const cleaned = cleanDeliverableSource(input.content || "");
  const safeContent = looksLikeJsonBlob(cleaned) ? "" : cleaned;

  const detected = detectArtifactType({
    assignment: input.assignment,
    content: safeContent || input.content,
    title: input.title,
  });

  const selection = selectArtifactTemplate(
    {
      assignment: input.assignment,
      content: safeContent,
      title: input.title,
      artifactType: detected.artifactType,
    },
    input.templateOverride,
  );

  const headingCountHint = (safeContent.match(/^#{1,3}\s+/gm) ?? []).length;
  const hasTablesHint = /\|.+\|/.test(safeContent);
  const hasImagesHint = /!\[|画像|写真/.test(safeContent);

  const structure = buildStructurePlan({
    artifactType: detected.artifactType,
    template: selection.template,
    headingCount: headingCountHint,
    hasTables: hasTablesHint,
    hasImages: hasImagesHint,
    contentLength: safeContent.length,
  });

  const structured = buildStructuredDocument({
    content: safeContent || "（本文を整理できませんでした。依頼内容を少し具体的にしてください。）",
    assignment: input.assignment,
    title: input.title,
    designTemplate: selection.template.id,
    authorLabel: "MINERVOT",
    includeTableOfContents: structure.toc,
    forceNoCover: !structure.cover,
  });

  const hasTables = structured.sections.some((section) =>
    section.blocks.some((block) => block.type === "table"),
  );
  const hasImages = structured.sections.some((section) =>
    section.blocks.some((block) => block.type === "imagePlaceholder"),
  );

  // Refresh structure with actual parsed counts
  const structureFinal = buildStructurePlan({
    artifactType: detected.artifactType,
    template: selection.template,
    headingCount: structured.sections.filter((section) => section.level <= 2).length,
    hasTables,
    hasImages,
    contentLength: safeContent.length,
  });

  const sections: ArtifactSection[] = structured.sections.map((section) => ({
    role: section.role,
    title: section.title,
    level: section.level,
    pageBreakBefore: structureFinal.pageBreaks ? section.pageBreakBefore : false,
    blocks: toArtifactBlocks(section.blocks),
  }));

  if (structureFinal.contact) {
    const contactSection = sections.find((section) =>
      /問い合わせ|お問い合わせ|連絡/.test(section.title),
    );
    if (!contactSection) {
      sections.push({
        role: "contact",
        title: "お問い合わせ",
        level: 2,
        blocks: [
          {
            type: "contact",
            fields: [
              { label: "会社名", value: input.orgProfile?.companyName || "（未登録）" },
              { label: "担当", value: input.orgProfile?.contactName || "（未登録）" },
              { label: "電話", value: input.orgProfile?.contactPhone || input.orgProfile?.companyPhone || "（未登録）" },
            ],
          },
        ],
      });
    }
  }

  if (structureFinal.imageFrames && !hasImages && selection.template.id === "a4_leaflet") {
    const offer = sections.find((section) => /提案|活用|サービス|課題/.test(section.title));
    (offer ?? sections[0])?.blocks.push({
      type: "imagePlaceholder",
      caption: "物件・活用イメージ写真",
    });
  }

  const tables = sections.flatMap((section) =>
    section.blocks
      .filter((block): block is Extract<ArtifactBlock, { type: "table" }> => block.type === "table")
      .map((block) => ({
        title: section.title,
        headers: block.headers,
        rows: block.rows,
      })),
  );

  const images = sections.flatMap((section) =>
    section.blocks
      .filter(
        (block): block is Extract<ArtifactBlock, { type: "imagePlaceholder" }> =>
          block.type === "imagePlaceholder",
      )
      .map((block) => ({ caption: block.caption })),
  );

  const callouts = sections.flatMap((section) =>
    section.blocks
      .filter(
        (block): block is Extract<ArtifactBlock, { type: "callout" }> =>
          block.type === "callout",
      )
      .map((block) => ({ variant: block.variant, text: block.text })),
  );

  const excel = buildExcelPayload({
    artifactType: detected.artifactType,
    assignment: input.assignment,
    content: safeContent,
  });

  const formatPlan = recommendArtifactFormats({
    artifactType: detected.artifactType,
    assignment: input.assignment,
    content: safeContent,
    templateFormats: {
      recommended: selection.template.recommendedFormats as DeliverableFormat[],
      other: selection.template.otherFormats as DeliverableFormat[],
    },
    excelApplicable: excel.applicable,
  });

  const missingFields = detectQualityGaps({
    artifactType: detected.artifactType,
    content: safeContent,
    profile: input.orgProfile,
  });

  const notApplicable: DeliverableFormat[] = [];
  if (!excel.applicable) notApplicable.push("xlsx");

  const formatStates = buildFormatStates({
    recommended: formatPlan.recommended,
    other: formatPlan.other,
    generated: input.generatedFiles ?? [],
    failed: input.failedFormats,
    notApplicable,
  });

  const summarySection = sections.find((section) =>
    /概要|要約|サマリー|まとめ/.test(section.title),
  );
  const summary =
    summarySection?.blocks.find((block) => block.type === "paragraph" && "text" in block)?.text;

  const leakDetected =
    LEAK_PATTERN.test(safeContent) === false
      ? looksLikeJsonBlob(input.content)
      : /"type"\s*:|"markdown"\s*:/.test(input.content);

  const completionStatus = resolveCompletionStatus({
    hasStructuredDocument: sections.length > 0 && Boolean(structured.title),
    hasTemplate: Boolean(selection.template.id),
    hasPreview: true,
    formatStates,
    missingFields,
    leakDetected: looksLikeJsonBlob(input.content) && !safeContent,
  });

  return {
    title: structured.title,
    subtitle: structured.subtitle,
    summary,
    artifactType: detected.artifactType,
    artifactLabel: detected.label,
    templateId: selection.template.id,
    templateCategory:
      CATEGORY_BY_ARTIFACT_TYPE[detected.artifactType] ?? selection.template.category,
    templateLabel: selection.template.label,
    designId: selection.template.id,
    structure: structureFinal,
    sections,
    tables,
    images,
    callouts,
    metadata: {
      createdAtLabel: structured.meta.createdAtLabel || formatGeneratedDate(),
      authorLabel: structured.meta.authorLabel,
      fields: structured.meta.fields,
    },
    recommendedFormats: formatPlan.recommended,
    otherFormats: formatPlan.other,
    formatStates,
    completionStatus:
      leakDetected && !safeContent ? "failed" : completionStatus,
    missingFields,
    excelNotApplicable: !excel.applicable,
    excelNotApplicableReason: excel.reason,
  };
}
