import type { WorkTask } from "@/lib/agents/tasks/types";

import type { ParseTasksResult } from "./types";

export type UnifiedPlannerOutput = {
  plan: string;
  deliverableType: string;
  tasks: WorkTask[];
  rawOutput: string;
};

function extractJsonBlock(output: string): unknown | null {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? output.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseTasksFromJson(value: unknown): WorkTask[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const description =
        typeof record.description === "string" ? record.description.trim() : title;
      if (!title) return null;
      return { id: index + 1, title, description };
    })
    .filter((t): t is WorkTask => t !== null);
}

/** Parse unified planner JSON or fall back to legacy task parser. */
export function parseUnifiedPlannerOutput(
  outputText: string,
  assignment: string,
  fallbackParse: (text: string, assignment: string) => ParseTasksResult,
): UnifiedPlannerOutput & { parseResult: ParseTasksResult } {
  const parsed = extractJsonBlock(outputText) as
    | {
        plan?: string;
        deliverableType?: string;
        tasks?: unknown;
      }
    | null;

  if (parsed?.plan && Array.isArray(parsed.tasks)) {
    const tasks = parseTasksFromJson(parsed.tasks);
    if (tasks.length > 0) {
      return {
        plan: String(parsed.plan).trim(),
        deliverableType: String(parsed.deliverableType ?? "document").trim(),
        tasks,
        rawOutput: outputText,
        parseResult: { tasks, source: "parsed" },
      };
    }
  }

  const legacy = fallbackParse(outputText, assignment);
  return {
    plan: outputText.slice(0, 1500),
    deliverableType: "document",
    tasks: legacy.tasks,
    rawOutput: outputText,
    parseResult: legacy,
  };
}
