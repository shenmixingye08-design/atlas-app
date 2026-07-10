import type { Automation } from "@/lib/automations/types";
import {
  asArray,
  normalizeAutomation,
  normalizeProject,
} from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

export type WorkCategoryId =
  | "sns"
  | "blog"
  | "sales"
  | "email"
  | "drive"
  | "general";

export type MonthlyAchievementStats = {
  monthLabel: string;
  snsPosts: number;
  blogPosts: number;
  salesMaterials: number;
  emailReplies: number;
  hoursSaved: number;
};

const CATEGORY_KEYWORDS: Record<WorkCategoryId, RegExp> = {
  sns: /sns|x投稿|twitter|ツイート|投稿|instagram|インスタ/i,
  blog: /ブログ|blog|wordpress|記事/i,
  sales: /営業資料|プレゼン|ppt|powerpoint|提案/i,
  email: /メール|gmail|返信|mail/i,
  drive: /drive|ファイル|保存|整理/i,
  general: /./,
};

const CATEGORY_ICONS: Record<WorkCategoryId, string> = {
  sns: "📱",
  blog: "📝",
  sales: "📊",
  email: "✉️",
  drive: "📁",
  general: "📋",
};

const CATEGORY_ACTIVITY: Record<WorkCategoryId, string> = {
  sns: "SNS投稿を作成中",
  blog: "ブログ生成中",
  sales: "営業資料を作成中",
  email: "メール返信を作成中",
  drive: "Google Driveへ保存中",
  general: "仕事を進めています",
};

function isSameMonth(iso: string, now: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

export function inferWorkCategory(text: string): WorkCategoryId {
  const normalized = text.trim();
  for (const category of [
    "sns",
    "blog",
    "sales",
    "email",
    "drive",
  ] as const) {
    if (CATEGORY_KEYWORDS[category].test(normalized)) {
      return category;
    }
  }
  return "general";
}

export function getWorkCategoryIcon(category: WorkCategoryId): string {
  return CATEGORY_ICONS[category];
}

export function getWorkActivityLabel(category: WorkCategoryId): string {
  return CATEGORY_ACTIVITY[category];
}

export function formatAutomationScheduledTime(automation: Automation): string | null {
  const normalized = normalizeAutomation(automation);
  if (normalized.schedule.kind !== "schedule") return null;
  const preset = normalized.schedule.preset;
  if (!preset || typeof preset.hour !== "number" || typeof preset.minute !== "number") {
    return null;
  }
  const { hour, minute } = preset;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function countCompletedThisMonth(
  items: Array<{ text: string; completedAt: string | null }>,
  category: WorkCategoryId,
  now: Date,
): number {
  return items.filter(
    (item) =>
      item.completedAt &&
      isSameMonth(item.completedAt, now) &&
      inferWorkCategory(item.text) === category,
  ).length;
}

export function computeMonthlyAchievements(
  projectsInput: readonly Project[],
  automationsInput: readonly Automation[],
  now: Date = new Date(),
): MonthlyAchievementStats {
  const projects = asArray(projectsInput).map((project) => normalizeProject(project));
  const automations = asArray(automationsInput).map((automation) =>
    normalizeAutomation(automation),
  );

  const completedProjects = projects
    .filter(
      (project) =>
        project.status === "completed" && isSameMonth(project.updatedAt, now),
    )
    .map((project) => ({
      text: `${project.title} ${project.workRequest}`,
      completedAt: project.updatedAt,
    }));

  const completedAutomations = automations
    .filter(
      (automation) =>
        automation.lastRun &&
        isSameMonth(automation.lastRun, now) &&
        automation.status === "success",
    )
    .map((automation) => ({
      text: `${automation.name} ${automation.workflow.assignment}`,
      completedAt: automation.lastRun,
    }));

  const completedItems = [...completedProjects, ...completedAutomations];

  const snsPosts = countCompletedThisMonth(completedItems, "sns", now);
  const blogPosts = countCompletedThisMonth(completedItems, "blog", now);
  const salesMaterials = countCompletedThisMonth(completedItems, "sales", now);
  const emailReplies = countCompletedThisMonth(completedItems, "email", now);

  const totalCompleted = completedItems.length;
  const hoursSaved = Math.max(
    1,
    Math.round(totalCompleted * 0.75 + snsPosts * 0.25 + emailReplies * 0.2),
  );

  return {
    monthLabel: now.toLocaleDateString("ja-JP", { year: "numeric", month: "long" }),
    snsPosts,
    blogPosts,
    salesMaterials,
    emailReplies,
    hoursSaved,
  };
}

export function inferWorkCategoryFromAutomation(automation: Automation): WorkCategoryId {
  const normalized = normalizeAutomation(automation);
  const templateId = normalized.executionFlow.templateId;
  if (templateId === "sns_post") return "sns";
  if (templateId === "blog") return "blog";
  if (templateId === "sales_material") return "sales";
  return inferWorkCategory(`${normalized.name} ${normalized.workflow.assignment}`);
}

export function inferWorkCategoryFromProject(project: Project): WorkCategoryId {
  const normalized = normalizeProject(project);
  return inferWorkCategory(`${normalized.title} ${normalized.workRequest}`);
}
