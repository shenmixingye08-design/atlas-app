import type { WorkTask } from "@/lib/agents/tasks/types";

import type { ParseTasksResult } from "./types";

const MAX_TASKS = 10;

const TASK_LINE_PATTERNS = [
  /^Task\s+(\d+)[:.)]\s*(.+)$/gim,
  /^[-*]\s*Task\s+(\d+)[:.)]\s*(.+)$/gim,
  /^#{1,3}\s*Task\s+(\d+)[:.)]?\s*(.+)$/gim,
] as const;

const NUMBERED_LINE_PATTERN = /^(\d+)[.)]\s+(.+)$/gm;
const BULLET_LINE_PATTERN = /^[-*]\s+(.+)$/gm;

function splitTitleDescription(raw: string): { title: string; description: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { title: "Untitled task", description: "" };
  }

  for (const separator of [" — ", " – ", " - ", ": "]) {
    const index = trimmed.indexOf(separator);
    if (index > 0) {
      const title = trimmed.slice(0, index).trim();
      const description = trimmed.slice(index + separator.length).trim();
      if (title && description) {
        return { title, description };
      }
    }
  }

  return { title: trimmed, description: trimmed };
}

function parseTaskLine(id: number, raw: string): WorkTask {
  const { title, description } = splitTitleDescription(raw);

  return {
    id,
    title: title || `Task ${id}`,
    description: description || title || `Task ${id}`,
  };
}

function parseWithPatterns(output: string): WorkTask[] {
  const tasksById = new Map<number, WorkTask>();

  for (const pattern of TASK_LINE_PATTERNS) {
    pattern.lastIndex = 0;

    for (const match of output.matchAll(pattern)) {
      const id = Number.parseInt(match[1], 10);
      if (!Number.isFinite(id) || id < 1) continue;

      tasksById.set(id, parseTaskLine(id, match[2]));
    }
  }

  return [...tasksById.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, task]) => task);
}

function extractTasksSection(output: string): string | null {
  const match = output.match(
    /##\s*Tasks?\b([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i,
  );

  return match?.[1]?.trim() ?? null;
}

function parseNumberedLines(section: string): WorkTask[] {
  const lines = [...section.matchAll(NUMBERED_LINE_PATTERN)];

  return lines
    .slice(0, MAX_TASKS)
    .map((match, index) => parseTaskLine(index + 1, match[2]));
}

function parseBulletLines(section: string): WorkTask[] {
  const lines = [...section.matchAll(BULLET_LINE_PATTERN)];

  return lines
    .slice(0, MAX_TASKS)
    .map((match, index) => parseTaskLine(index + 1, match[1]));
}

function normalizeTaskIds(tasks: WorkTask[]): WorkTask[] {
  return tasks.slice(0, MAX_TASKS).map((task, index) => ({
    ...task,
    id: index + 1,
  }));
}

function createFallbackTask(assignment: string): WorkTask {
  return {
    id: 1,
    title: "Execute assignment",
    description: assignment.trim() || "Complete the requested work.",
  };
}

function createSplitFallbackTasks(assignment: string, output: string): WorkTask[] {
  const section = extractTasksSection(output) ?? output;
  const bulletTasks = parseBulletLines(section);

  if (bulletTasks.length >= 2) {
    return normalizeTaskIds(bulletTasks);
  }

  const numberedTasks = parseNumberedLines(section);
  if (numberedTasks.length >= 2) {
    return normalizeTaskIds(numberedTasks);
  }

  const paragraphs = section
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20);

  if (paragraphs.length >= 2) {
    return normalizeTaskIds(
      paragraphs.slice(0, MAX_TASKS).map((part, index) => parseTaskLine(index + 1, part)),
    );
  }

  return [createFallbackTask(assignment)];
}

/**
 * Parses numbered tasks from Planner decomposition output.
 * Falls back to section heuristics, then a single task carrying the assignment.
 */
export function parseTasksFromPlannerOutput(
  output: string,
  fallbackAssignment: string,
): ParseTasksResult {
  const trimmedOutput = output.trim();

  if (!trimmedOutput) {
    return {
      tasks: [createFallbackTask(fallbackAssignment)],
      source: "fallback_single",
      warning: "Planner task output was empty; created a single fallback task.",
    };
  }

  const parsed = normalizeTaskIds(parseWithPatterns(trimmedOutput));
  if (parsed.length > 0) {
    return {
      tasks: parsed,
      source: "parsed",
    };
  }

  const splitFallback = createSplitFallbackTasks(fallbackAssignment, trimmedOutput);
  if (splitFallback.length > 1) {
    return {
      tasks: splitFallback,
      source: "fallback_split",
      warning:
        "Could not parse explicit Task N lines; split Planner output into multiple fallback tasks.",
    };
  }

  return {
    tasks: splitFallback,
    source: "fallback_single",
    warning:
      "Could not parse Planner task list; created a single fallback task from the assignment.",
  };
}
