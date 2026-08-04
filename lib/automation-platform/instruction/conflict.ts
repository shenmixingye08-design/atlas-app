import type {
  AutomationInstruction,
  InstructionAssumption,
  InstructionConflict,
  ResolvedInstruction,
  StructuredOptions,
} from "@/lib/automation-platform/types";

type NegationRule = {
  field: string;
  /** structured option keys that enable a capability */
  structuredTruthyKeys: string[];
  /** freeform patterns that reject that capability */
  freeformRejectPatterns: RegExp[];
  message: string;
};

const NEGATION_RULES: readonly NegationRule[] = [
  {
    field: "formats.pdf",
    structuredTruthyKeys: ["generatePdf", "pdf", "formats.pdf"],
    freeformRejectPatterns: [
      /PDF[はを]?不要/i,
      /PDFなし/i,
      /PDFは作らな/i,
      /pdf\s*(not|no|不要)/i,
    ],
    message: "構造化項目ではPDF生成が有効ですが、備考ではPDF不要と読めます。",
  },
  {
    field: "formats.excel",
    structuredTruthyKeys: ["generateExcel", "excel", "formats.excel"],
    freeformRejectPatterns: [
      /Excel[はを]?不要/i,
      /エクセル[はを]?不要/,
      /Excelなし/i,
    ],
    message:
      "構造化項目ではExcel生成が有効ですが、備考ではExcel不要と読めます。",
  },
  {
    field: "formats.word",
    structuredTruthyKeys: ["generateWord", "word", "formats.word"],
    freeformRejectPatterns: [
      /Word[はを]?不要/i,
      /ワード[はを]?不要/,
      /Wordなし/i,
    ],
    message:
      "構造化項目ではWord生成が有効ですが、備考ではWord不要と読めます。",
  },
  {
    field: "destination.x",
    structuredTruthyKeys: ["postToX", "destination.x", "x"],
    freeformRejectPatterns: [
      /X[へに]?投稿し?ない/,
      /ツイート不要/,
      /投稿不要/,
      /Xは不要/,
    ],
    message: "構造化項目ではX投稿が有効ですが、備考では投稿しない意図があります。",
  },
  {
    field: "notify",
    structuredTruthyKeys: ["notifyOnSuccess", "notification"],
    freeformRejectPatterns: [/通知不要/, /通知しない/, /連絡不要/],
    message: "構造化項目では通知が有効ですが、備考では通知不要と読めます。",
  },
];

function readStructuredFlag(
  options: StructuredOptions,
  key: string,
): unknown {
  if (key.includes(".")) {
    const [head, ...rest] = key.split(".");
    const nested = options[head];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return (nested as Record<string, unknown>)[rest.join(".")];
    }
  }
  return options[key];
}

function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function detectInstructionConflicts(
  instruction: AutomationInstruction,
): InstructionConflict[] {
  const notes = instruction.freeformNotes ?? "";
  if (!notes.trim()) return [];

  const conflicts: InstructionConflict[] = [];
  for (const rule of NEGATION_RULES) {
    const matchedReject = rule.freeformRejectPatterns.find((pattern) =>
      pattern.test(notes),
    );
    if (!matchedReject) continue;

    for (const key of rule.structuredTruthyKeys) {
      const value = readStructuredFlag(instruction.structuredOptions, key);
      if (isTruthy(value)) {
        conflicts.push({
          field: rule.field,
          structuredValue: value,
          freeformSignal: matchedReject.source,
          message: rule.message,
        });
        break;
      }
    }
  }

  return conflicts;
}

/**
 * Resolve instruction layers without silently picking a side on conflicts.
 * Priority: structured (explicit) > freeform > automation saved > memory > default
 * Conflicts set requiresUserConfirmation=true.
 */
export function resolveInstruction(input: {
  instruction: AutomationInstruction;
  automationSaved?: StructuredOptions;
  memoryValues?: StructuredOptions;
  systemDefaults?: StructuredOptions;
}): ResolvedInstruction {
  const conflicts = detectInstructionConflicts(input.instruction);
  const assumptions: InstructionAssumption[] = [];

  const merged: Record<string, unknown> = {
    ...(input.systemDefaults ?? {}),
  };

  for (const [key, value] of Object.entries(input.memoryValues ?? {})) {
    if (merged[key] === undefined) {
      merged[key] = value;
      assumptions.push({
        field: key,
        value,
        reason: "Filled from allowed user memory",
        source: "memory",
      });
    }
  }

  for (const [key, value] of Object.entries(input.automationSaved ?? {})) {
    merged[key] = value;
  }

  // freeform does not auto-write structured keys — only surfaces conflicts
  for (const [key, value] of Object.entries(
    input.instruction.structuredOptions,
  )) {
    merged[key] = value;
  }

  return {
    structuredOptions: input.instruction.structuredOptions,
    freeformNotes: input.instruction.freeformNotes,
    merged,
    assumptions,
    conflicts,
    requiresUserConfirmation: conflicts.length > 0,
  };
}
