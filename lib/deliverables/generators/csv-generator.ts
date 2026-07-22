import "server-only";

import {
  analysisToCsv,
  suggestAnalysisFileBaseName,
} from "@/lib/image-analysis/excel";
import type { ImageAnalysisResult } from "@/lib/image-analysis/types";
import { parseImageAnalysisJson } from "@/lib/image-analysis/schemas";

import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function extractJsonAnalysis(content: string): ImageAnalysisResult | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    const validated = parseImageAnalysisJson(parsed);
    return validated.ok ? validated.data : null;
  } catch {
    return null;
  }
}

function csvFromMarkdownTables(content: string): string | null {
  const parsed = parseDeliverableContent(content);
  for (const section of parsed.sections) {
    const table = section.blocks.find(
      (block): block is Extract<ContentBlock, { type: "table" }> =>
        block.type === "table",
    );
    if (!table) continue;
    const lines = [
      table.headers.map(escapeCsv).join(","),
      ...table.rows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")),
    ];
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }
  return null;
}

export class CsvDeliverableGenerator implements DeliverableGenerator {
  readonly format = "csv" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const fromJson = extractJsonAnalysis(content);
    if (fromJson) {
      const csv = analysisToCsv(fromJson);
      return createDeliverableFile(
        "csv",
        suggestAnalysisFileBaseName(fromJson) || baseFileName,
        Buffer.from(csv, "utf8"),
        false,
      );
    }

    const fromTables = csvFromMarkdownTables(content);
    if (fromTables) {
      return createDeliverableFile(
        "csv",
        baseFileName,
        Buffer.from(fromTables, "utf8"),
        false,
      );
    }

    const fallback = `\uFEFF結果,詳細\r\n表データが見つかりませんでした,\r\n`;
    return createDeliverableFile(
      "csv",
      baseFileName,
      Buffer.from(fallback, "utf8"),
      false,
    );
  }
}

export async function generateCsvFromImageAnalysis(
  analysis: ImageAnalysisResult,
  baseFileName?: string,
): Promise<GeneratedDeliverableFile> {
  const csv = analysisToCsv(analysis);
  return createDeliverableFile(
    "csv",
    baseFileName || suggestAnalysisFileBaseName(analysis),
    Buffer.from(csv, "utf8"),
    false,
  );
}
