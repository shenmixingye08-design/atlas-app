import type { WorkTask } from "@/lib/agents/tasks/types";
import type { DepartmentId } from "@/lib/employees/types";
import {
  getCompanyRoutingKeywords,
  getEnabledDepartments,
} from "@/lib/company-templates/context";

import { workerDepartments } from "./registry";
import type { WorkerEligibleDepartmentId } from "./types";
import { isWorkerEligibleDepartment } from "./types";

const DEPARTMENT_TAG_PATTERN = /^\s*\[([^\]]+)\]\s*(.*)$/i;

const DEPARTMENT_LABEL_PATTERN =
  /(?:^|\n)\s*(?:department|dept|team)\s*[:：]\s*([a-z0-9\s-]+)/i;

const DEPARTMENT_ALIASES: Record<string, WorkerEligibleDepartmentId> = {
  development: "development",
  dev: "development",
  engineering: "development",
  engineer: "development",
  marketing: "marketing",
  mkt: "marketing",
  sales: "sales",
  design: "design",
  research: "research",
  legal: "legal",
  finance: "finance",
  fin: "finance",
  hr: "hr",
  "human resources": "hr",
  "customer success": "customer-success",
  "customer-support": "customer-success",
  support: "customer-success",
  cs: "customer-success",
};

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveAlias(value: string): WorkerEligibleDepartmentId | null {
  const normalized = normalizeAlias(value);

  if (normalized in DEPARTMENT_ALIASES) {
    return DEPARTMENT_ALIASES[normalized];
  }

  if (isWorkerEligibleDepartment(normalized as DepartmentId)) {
    return normalized as WorkerEligibleDepartmentId;
  }

  for (const department of workerDepartments) {
    if (normalizeAlias(department.name) === normalized) {
      return department.id as WorkerEligibleDepartmentId;
    }
  }

  return null;
}

function isDepartmentEnabled(id: WorkerEligibleDepartmentId): boolean {
  return getEnabledDepartments().includes(id);
}

function getRoutingDepartments() {
  const enabled = new Set(getEnabledDepartments());
  return workerDepartments.filter((department) =>
    enabled.has(department.id as WorkerEligibleDepartmentId),
  );
}

function parseExplicitDepartment(task: WorkTask): WorkerEligibleDepartmentId | null {
  let resolved: WorkerEligibleDepartmentId | null = null;

  if (task.department) {
    resolved = resolveAlias(task.department);
  }

  if (!resolved) {
    const tagMatch = task.title.match(DEPARTMENT_TAG_PATTERN);
    if (tagMatch?.[1]) {
      resolved = resolveAlias(tagMatch[1]);
    }
  }

  if (!resolved) {
    const combined = `${task.title}\n${task.description}`;
    const labelMatch = combined.match(DEPARTMENT_LABEL_PATTERN);
    if (labelMatch?.[1]) {
      resolved = resolveAlias(labelMatch[1]);
    }
  }

  if (resolved && !isDepartmentEnabled(resolved)) {
    return null;
  }

  return resolved;
}

function scoreByKeywords(text: string): WorkerEligibleDepartmentId | null {
  const haystack = text.toLowerCase();
  const routingKeywords = getCompanyRoutingKeywords();
  let best: { id: WorkerEligibleDepartmentId; score: number } | null = null;

  for (const department of getRoutingDepartments()) {
    let score = 0;
    const departmentId = department.id as WorkerEligibleDepartmentId;
    const keywords = [
      ...department.taskKeywords,
      ...(routingKeywords[departmentId] ?? []),
    ];

    for (const keyword of keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        score += keyword.length >= 6 ? 2 : 1;
      }
    }

    if (!best || score > best.score) {
      best = score > 0 ? { id: departmentId, score } : best;
    }
  }

  return best?.score ? best.id : null;
}

/**
 * Infer the best worker department for a Planner task.
 *
 * Priority: explicit task field → `[Department]` tag → `Department:` label → keywords.
 * Returns null when ambiguous — caller should fall back to legacy Development round-robin.
 */
export function inferDepartmentFromTask(
  task: WorkTask,
): WorkerEligibleDepartmentId | null {
  const explicit = parseExplicitDepartment(task);
  if (explicit) return explicit;

  return scoreByKeywords(`${task.title} ${task.description}`);
}

/** Strip routing tags from a task title for display and prompts. */
export function stripDepartmentTagFromTitle(title: string): string {
  const match = title.match(DEPARTMENT_TAG_PATTERN);
  return match?.[2]?.trim() || title.trim();
}
