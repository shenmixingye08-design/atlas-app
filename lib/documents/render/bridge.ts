import type { DocumentModel } from "@/lib/documents/schema/document-model.zod";
import type {
  ContentBlock,
  ParsedDeliverable,
  ParsedSection,
} from "@/lib/deliverables/parse-content";
import { documentModelToMarkdown } from "@/lib/documents/normalize";

function blockFromSectionBlock(
  block: DocumentModel["sections"][number]["blocks"][number],
): ContentBlock | null {
  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", text: block.text };
    case "bullets":
      return { type: "bulletList", items: block.items };
    case "table":
      return { type: "table", headers: block.headers, rows: block.rows };
    case "callout":
      return { type: "paragraph", text: `[${block.variant}] ${block.text}` };
    default:
      return null;
  }
}

/** Bridge DocumentModel → ParsedDeliverable for existing Word/PDF generators. */
export function documentModelToParsedDeliverable(
  model: DocumentModel,
): ParsedDeliverable {
  const sections: ParsedSection[] = model.sections.map((section) => ({
    title: section.heading,
    level: section.level,
    blocks: section.blocks
      .map(blockFromSectionBlock)
      .filter((block): block is ContentBlock => block !== null),
  }));

  if (model.actionItems?.length) {
    sections.push({
      title: "アクションアイテム",
      level: 2,
      blocks: [
        {
          type: "bulletList",
          items: model.actionItems.map(
            (item) =>
              `${item.text}${item.assignee ? `（${item.assignee}）` : ""}${item.dueDate ? ` — ${item.dueDate}` : ""}`,
          ),
        },
      ],
    });
  }

  const topLevel = sections.filter((section) => section.level <= 2);

  return {
    title: model.title,
    subtitle: model.subtitle,
    sections,
    includeTableOfContents: topLevel.length >= 2,
  };
}

/** Legacy text export path. */
export function documentModelToExportText(model: DocumentModel): string {
  return documentModelToMarkdown(model);
}
