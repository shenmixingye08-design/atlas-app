import { parseDeliverableContent } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile } from "./shared";

function escapeCsvCell(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function tableToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      headers.map((_, index) => escapeCsvCell(row[index] ?? "")).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

/** CSV generator — first table wins; falls back to section titles as rows. */
export class CsvDeliverableGenerator implements DeliverableGenerator {
  readonly format = "csv" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const parsed = parseDeliverableContent(content);

    for (const section of parsed.sections) {
      for (const block of section.blocks) {
        if (block.type === "table" && block.headers.length > 0) {
          const csv = tableToCsv(block.headers, block.rows);
          // UTF-8 BOM for Excel Japanese compatibility
          const buffer = Buffer.from(`\uFEFF${csv}`, "utf-8");
          return createDeliverableFile("csv", baseFileName, buffer, false);
        }
      }
    }

    const fallbackRows = parsed.sections.map((section) => [
      section.title,
      section.blocks
        .map((block) => {
          if (block.type === "paragraph") return block.text;
          if (block.type === "bulletList" || block.type === "numberedList") {
            return block.items.join(" / ");
          }
          return "";
        })
        .filter(Boolean)
        .join(" "),
    ]);
    const csv = tableToCsv(["項目", "内容"], fallbackRows);
    const buffer = Buffer.from(`\uFEFF${csv}`, "utf-8");
    return createDeliverableFile("csv", baseFileName, buffer, false);
  }
}
