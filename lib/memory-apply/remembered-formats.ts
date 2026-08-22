import "server-only";

import { applyRememberedDeliverableFormats } from "@/lib/deliverables/remembered-formats";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import { isOneShotMemoryInstruction } from "@/lib/personal-memory/intent";
import {
  createPersonalMemory,
  resolveForContext,
  updatePersonalMemory,
} from "@/lib/personal-memory/service";
import { listStoredPersonalMemories } from "@/lib/personal-memory/store";

export { applyRememberedDeliverableFormats };

const FORMAT_LABEL: Record<DeliverableFormat, string> = {
  docx: "Word",
  xlsx: "Excel",
  pptx: "PowerPoint",
  pdf: "PDF",
  md: "Markdown",
  txt: "テキスト",
};

function collectFormatsFromValues(
  values: readonly { value: Record<string, unknown>; appliesTo?: { artifactTypes?: string[] } }[],
): DeliverableFormat[] {
  const out: DeliverableFormat[] = [];
  const push = (raw: string) => {
    const value = raw.toLowerCase();
    const mapped =
      value === "docx" || value === "word"
        ? "docx"
        : value === "xlsx" || value === "excel"
          ? "xlsx"
          : value === "pptx" || value === "powerpoint"
            ? "pptx"
            : value === "pdf"
              ? "pdf"
              : null;
    if (mapped && !out.includes(mapped)) out.push(mapped);
  };
  for (const row of values) {
    const formats = row.value.formats;
    if (Array.isArray(formats)) {
      for (const item of formats) push(String(item));
    }
    for (const type of row.appliesTo?.artifactTypes ?? []) push(type);
  }
  return out;
}

export async function resolveRememberedDeliverableFormats(
  userId: string,
): Promise<DeliverableFormat[]> {
  if (!userId.trim()) return [];
  const { ledger } = await resolveForContext({
    userId,
    notes: "成果物の形式",
    allowedScopes: ["preferred_formats", "writing_style", "work_content_style"],
    artifactTypes: ["docx", "xlsx", "pptx", "pdf"],
  });
  return collectFormatsFromValues(ledger.memoryValuesResolved);
}

export async function rememberSuccessfulDeliverableFormat(input: {
  userId: string;
  format: DeliverableFormat;
  assignment: string;
}): Promise<void> {
  if (!input.userId.trim()) return;
  if (
    input.format !== "docx" &&
    input.format !== "xlsx" &&
    input.format !== "pptx" &&
    input.format !== "pdf"
  ) {
    return;
  }
  if (isOneShotMemoryInstruction(input.assignment)) return;

  const existing = listStoredPersonalMemories(input.userId).find(
    (row) =>
      row.scope === "preferred_formats" &&
      row.key === "last_export" &&
      (row.status === "active" || row.status === "candidate"),
  );
  const label = FORMAT_LABEL[input.format];
  const value = { formats: [input.format], text: `今後は${label}` };
  try {
    if (existing) {
      await updatePersonalMemory(input.userId, existing.id, {
        value,
        summary: label,
        status: "active",
      });
      return;
    }
    await createPersonalMemory(input.userId, {
      kind: "work_preference",
      scope: "preferred_formats",
      key: "last_export",
      title: "前回の成果物形式",
      summary: label,
      value,
      source: "user_explicit",
      status: "active",
      confidence: 0.8,
      appliesTo: {
        global: true,
        automationIds: [],
        artifactTypes: [input.format],
        capabilities: [],
      },
    });
  } catch {
    // Fail soft — format memory must never break generation.
  }
}
