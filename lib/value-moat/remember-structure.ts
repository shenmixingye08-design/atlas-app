/**
 * Persist work shape after a successful artifact — structure only, no row values.
 */

import "server-only";

import { isOneShotMemoryInstruction } from "@/lib/personal-memory/intent";
import {
  createPersonalMemory,
  updatePersonalMemory,
} from "@/lib/personal-memory/service";
import { listStoredPersonalMemories } from "@/lib/personal-memory/store";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";

import {
  extractExcelColumnsFromInstruction,
  extractWordWorkShape,
  type ExcelWorkShape,
  type WordWorkShape,
} from "@/lib/value-moat/structure-reuse";

function upsertShape(input: {
  userId: string;
  scope: PersonalMemoryScope;
  key: string;
  title: string;
  summary: string;
  value: Record<string, unknown>;
  artifactType: string;
}): Promise<void> {
  const existing = listStoredPersonalMemories(input.userId).find(
    (row) =>
      row.scope === input.scope &&
      row.key === input.key &&
      (row.status === "active" || row.status === "candidate"),
  );
  if (existing) {
    return updatePersonalMemory(input.userId, existing.id, {
      value: input.value,
      summary: input.summary,
      status: "active",
    }).then(() => undefined);
  }
  return createPersonalMemory(input.userId, {
    kind: "template_preference",
    scope: input.scope,
    key: input.key,
    title: input.title,
    summary: input.summary,
    value: input.value,
    source: "user_explicit",
    status: "active",
    confidence: 0.8,
    appliesTo: {
      global: false,
      automationIds: [],
      artifactTypes: [input.artifactType],
      capabilities: [],
    },
  }).then(() => undefined);
}

export async function rememberSuccessfulWorkShape(input: {
  userId: string;
  format: "docx" | "xlsx" | "pptx" | "pdf";
  assignment: string;
  content?: string;
  excelShape?: ExcelWorkShape | null;
  wordShape?: WordWorkShape | null;
}): Promise<void> {
  if (!input.userId.trim()) return;
  if (isOneShotMemoryInstruction(input.assignment)) return;

  try {
    if (input.format === "xlsx") {
      const columns =
        input.excelShape?.columns ??
        extractExcelColumnsFromInstruction(input.assignment);
      if (columns.length >= 2) {
        await upsertShape({
          userId: input.userId,
          scope: "excel_template",
          key: "column_order",
          title: "前回のExcel列構成",
          summary: columns.join(" / "),
          value: {
            columnOrder: columns,
            columns,
            freezePane: input.excelShape?.freezePane ?? null,
            filterEnabled: input.excelShape?.filterEnabled ?? false,
            formulaPatterns: input.excelShape?.formulaPatterns ?? [],
            text: `列は${columns.join(" / ")}`,
          },
          artifactType: "xlsx",
        });
      }
    }

    if (input.format === "docx" || input.format === "pdf") {
      const shape =
        input.wordShape ??
        (input.content
          ? extractWordWorkShape({ content: input.content })
          : null);
      const headingMatch = input.assignment.match(/見出し\s*(?:は|を)?\s*(\d+)\s*つ/);
      const headingCount =
        shape?.headingCount ??
        (headingMatch ? Number.parseInt(headingMatch[1]!, 10) : null);
      if (headingCount || shape?.bulletTendency || shape?.hasTable) {
        await upsertShape({
          userId: input.userId,
          scope: input.format === "pdf" ? "pdf_layout" : "word_template",
          key: "work_shape",
          title: input.format === "pdf" ? "前回のPDF構成" : "前回のWord構成",
          summary: headingCount ? `見出し${headingCount}つ` : "前回の構成",
          value: {
            headingCount,
            headings: Boolean(headingCount),
            hasTable: shape?.hasTable ?? false,
            structure: shape?.bulletTendency === "bullets" ? "bullets" : "headings",
            text: headingCount ? `見出し${headingCount}つ` : "前回の構成",
          },
          artifactType: input.format,
        });
      }
    }
  } catch {
    // Fail soft — structure memory must never break generation.
  }
}
