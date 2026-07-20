import type { Automation } from "@/lib/automations/types";
import {
  getWorkCategoryIcon,
  inferWorkCategory,
  type WorkCategoryId,
} from "@/lib/home/monthly-achievements";
import { ui } from "@/lib/i18n";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { mapExecutionsToAiEmployees } from "@/lib/team-collaboration/map-ai-employees";
import type { Project } from "@/lib/projects/types";
import type { UserMemory } from "@/lib/user-memory/types";

import { getActivityMetadata } from "./metadata-store";
import type { ActivityHistoryItem, ActivityHistoryStatus } from "./types";

const CATEGORY_LABELS: Record<WorkCategoryId, string> = {
  sns: ui.activityHistory.categories.sns,
  blog: ui.activityHistory.categories.blog,
  sales: ui.activityHistory.categories.sales,
  email: ui.activityHistory.categories.email,
  drive: ui.activityHistory.categories.drive,
  general: ui.activityHistory.categories.general,
};

const SERVICE_PATTERNS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "google", label: "Google", pattern: /google|gmail|calendar|drive/i },
  { id: "x", label: "X", pattern: /sns|x投稿|twitter|ツイート/i },
  { id: "wordpress", label: "WordPress", pattern: /wordpress|ブログ|blog/i },
  { id: "stripe", label: "Stripe", pattern: /stripe|請求|課金/i },
];

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}分${rem}秒` : `${minutes}分`;
}

export { formatDuration };

function extractServices(text: string, result: OrchestrationResult | null): string[] {
  const haystack = `${text} ${result?.deliverable?.type ?? ""}`;
  const found = SERVICE_PATTERNS.filter((entry) => entry.pattern.test(haystack)).map(
    (entry) => entry.label,
  );
  return found.length > 0 ? found : ["MINERVOT"];
}

function extractEmployees(result: OrchestrationResult | null): string[] {
  if (!result) return [];
  const employees = mapExecutionsToAiEmployees(result, { isComplete: true })
    .filter((e) => e.status === "completed" || e.status === "running")
    .map((e) => e.name);
  return [...new Set(employees)];
}

function mapProjectStatus(project: Project): ActivityHistoryStatus {
  if (project.result?.status === "failed") return "failed";
  return project.status;
}

function inferMemoryLearned(
  category: WorkCategoryId,
  completedAt: string,
  memories: UserMemory[],
  metadataFlag: boolean,
): boolean {
  if (metadataFlag) return true;

  const categoryMap: Partial<Record<WorkCategoryId, UserMemory["category"][]>> = {
    sns: ["sns"],
    blog: ["blog"],
    sales: ["sales"],
    email: ["email"],
    drive: ["google"],
    general: ["writing", "other"],
  };

  const targets = categoryMap[category] ?? ["other"];
  const completed = new Date(completedAt).getTime();

  return memories.some((memory) => {
    if (!targets.includes(memory.category)) return false;
    const updated = new Date(memory.updatedAt).getTime();
    return updated >= completed - 120_000;
  });
}

function buildFromProject(
  project: Project,
  memories: UserMemory[],
): ActivityHistoryItem | null {
  if (!project.result && project.status === "pending") return null;

  const category = inferWorkCategory(`${project.title} ${project.workRequest}`);
  const metadata = getActivityMetadata(project.id);
  const completedAt = project.updatedAt;
  const result = project.result;

  return {
    id: `project-${project.id}`,
    source: "project",
    projectId: project.id,
    automationId: null,
    completedAt,
    title: project.title,
    workRequest: project.workRequest,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    status: mapProjectStatus(project),
    durationMs: result?.totalDurationMs ?? 0,
    employees: extractEmployees(result),
    services: extractServices(project.workRequest, result),
    deliverablePreview: result
      ? getDeliverablePreviewText(result.deliverable).slice(0, 280)
      : null,
    deliverableType: result?.deliverable?.type ?? null,
    result,
    error: project.error ?? result?.error ?? null,
    metadata: {
      ...metadata,
      memoryLearned: inferMemoryLearned(
        category,
        completedAt,
        memories,
        metadata.memoryLearned,
      ),
    },
  };
}

function buildFromAutomation(automation: Automation): ActivityHistoryItem | null {
  if (!automation.lastRun) return null;

  const text = `${automation.name} ${automation.workflow.assignment}`;
  const category = inferWorkCategory(text);
  const metadata = getActivityMetadata(`automation-${automation.id}`);

  return {
    id: `automation-${automation.id}`,
    source: "automation",
    projectId: null,
    automationId: automation.id,
    completedAt: automation.lastRun,
    title: automation.name,
    workRequest: automation.workflow.assignment,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    status: automation.enabled ? "completed" : "review",
    durationMs: 0,
    employees: [],
    services: extractServices(text, null),
    deliverablePreview: null,
    deliverableType: null,
    result: null,
    error: null,
    metadata,
  };
}

export function buildActivityHistoryItems(input: {
  projects: Project[];
  automations: Automation[];
  memories?: UserMemory[];
}): ActivityHistoryItem[] {
  const memories = input.memories ?? [];

  const projectItems = input.projects
    .map((project) => buildFromProject(project, memories))
    .filter((item): item is ActivityHistoryItem => item !== null);

  const automationItems = input.automations
    .map(buildFromAutomation)
    .filter((item): item is ActivityHistoryItem => item !== null);

  return [...projectItems, ...automationItems].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
}

export function getCategoryIcon(category: WorkCategoryId): string {
  return getWorkCategoryIcon(category);
}
