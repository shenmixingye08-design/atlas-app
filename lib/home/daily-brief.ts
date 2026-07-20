import { getTodaysAutomations, isAutomationScheduledForToday } from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import { isSameCalendarDayInZone, DEFAULT_AUTOMATION_TIMEZONE } from "@/lib/automations/schedule";
import {
  getRecommendedAutomations,
  getRecommendedIntegrations,
} from "@/lib/onboarding";
import {
  asArray,
  normalizeAutomation,
  normalizeProject,
  normalizeProjects,
} from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";
import { loadUserWorkProfile } from "@/lib/user-profile";
import { getTopFrequentJobs } from "@/lib/user-profile/learning";

import {
  formatAutomationScheduledTime,
  getWorkCategoryIcon,
  inferWorkCategory,
  inferWorkCategoryFromAutomation,
  inferWorkCategoryFromProject,
  type WorkCategoryId,
} from "./monthly-achievements";

export type DailyBriefGreetingPeriod = "morning" | "afternoon" | "evening";

export type DailyBriefYesterdayStats = {
  sns: number;
  blog: number;
  sales: number;
  email: number;
  automations: number;
  hoursSaved: number;
  hasData: boolean;
};

export type DailyBriefScheduledItem = {
  id: string;
  icon: string;
  label: string;
  subtitle: string;
  automationId?: string;
  href?: string;
};

export type DailyBriefEmployeeStatus = "active" | "idle" | "reviewing";

export type DailyBriefEmployee = {
  id: string;
  icon: string;
  role: string;
  status: DailyBriefEmployeeStatus;
  todayTasks: number;
};

export type DailyBriefRecommendation = {
  id: string;
  icon: string;
  label: string;
  href: string;
};

export type DailyBrief = {
  greetingPeriod: DailyBriefGreetingPeriod;
  headline: string;
  yesterday: DailyBriefYesterdayStats;
  todayScheduled: DailyBriefScheduledItem[];
  employees: DailyBriefEmployee[];
  recommendations: DailyBriefRecommendation[];
  dailyTip: string;
  learningInsight: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AI_EMPLOYEE_DEFS = [
  { id: "sns", icon: "📱", role: "SNS担当", categories: ["sns"] as WorkCategoryId[] },
  { id: "blog", icon: "📝", role: "ブログ担当", categories: ["blog"] as WorkCategoryId[] },
  { id: "sales", icon: "📄", role: "資料担当", categories: ["sales"] as WorkCategoryId[] },
  { id: "secretary", icon: "📧", role: "秘書", categories: ["email"] as WorkCategoryId[] },
] as const;

const DAILY_TIPS = [
  "今日は昨日より1件多く仕事をこなせそうです。",
  "専属AI秘書の準備が完了しています。",
  "SNS担当が新しいアイデアを用意しています。",
  "営業資料担当がテンプレートを学習しました。",
  "今日もMINERVOTが仕事を進めます。",
  "昨日の成果を踏まえ、今日の仕事を最適化しました。",
  "あなたの仕事の好みを反映した提案を用意しています。",
] as const;

const CATEGORY_LABELS: Record<WorkCategoryId, string> = {
  sns: "SNS投稿",
  blog: "ブログ",
  sales: "営業資料",
  email: "メール",
  drive: "ファイル整理",
  general: "自動化",
};

export function getGreetingPeriod(hour: number): DailyBriefGreetingPeriod {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  return "evening";
}

function yesterdayDate(now: Date): Date {
  return new Date(now.getTime() - MS_PER_DAY);
}

function wasCompletedOnDay(
  iso: string | null | undefined,
  day: Date,
  timeZone = DEFAULT_AUTOMATION_TIMEZONE,
): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return isSameCalendarDayInZone(parsed, day, timeZone);
}

function countYesterdayByCategory(
  items: Array<{ text: string; completedAt: string | null }>,
  category: WorkCategoryId,
  now: Date,
): number {
  const day = yesterdayDate(now);
  return items.filter(
    (item) =>
      item.completedAt &&
      wasCompletedOnDay(item.completedAt, day) &&
      inferWorkCategory(item.text) === category,
  ).length;
}

export function computeYesterdayStats(
  projectsInput: readonly Project[],
  automationsInput: readonly Automation[],
  now: Date = new Date(),
): DailyBriefYesterdayStats {
  const projects = asArray(projectsInput).map((p) => normalizeProject(p));
  const automations = asArray(automationsInput).map((a) => normalizeAutomation(a));
  const day = yesterdayDate(now);

  const completedProjects = projects
    .filter(
      (p) => p.status === "completed" && wasCompletedOnDay(p.updatedAt, day),
    )
    .map((p) => ({
      text: `${p.title} ${p.workRequest}`,
      completedAt: p.updatedAt,
    }));

  const completedAutomations = automations
    .filter(
      (a) =>
        a.status === "success" &&
        a.lastRun &&
        wasCompletedOnDay(a.lastRun, day),
    )
    .map((a) => ({
      text: `${a.name} ${a.workflow.assignment}`,
      completedAt: a.lastRun,
    }));

  const items = [...completedProjects, ...completedAutomations];
  const sns = countYesterdayByCategory(items, "sns", now);
  const blog = countYesterdayByCategory(items, "blog", now);
  const sales = countYesterdayByCategory(items, "sales", now);
  const email = countYesterdayByCategory(items, "email", now);
  const automationsCount = completedAutomations.length;
  const total = items.length;
  const hoursSaved = total > 0 ? Math.max(1, Math.round(total * 0.5)) : 0;

  return {
    sns,
    blog,
    sales,
    email,
    automations: automationsCount,
    hoursSaved,
    hasData: total > 0,
  };
}

export function buildTodayScheduled(
  automationsInput: readonly Automation[],
  projectsInput: readonly Project[],
  now: Date = new Date(),
): DailyBriefScheduledItem[] {
  const automations = asArray(automationsInput).map((a) => normalizeAutomation(a));
  const projects = normalizeProjects(projectsInput);
  const items: DailyBriefScheduledItem[] = [];

  for (const { automation, completed } of getTodaysAutomations(automations, now)) {
    if (completed) continue;
    const category = inferWorkCategoryFromAutomation(automation);
    const time = formatAutomationScheduledTime(automation);
    items.push({
      id: `auto:${automation.id}`,
      icon: getWorkCategoryIcon(category),
      label: CATEGORY_LABELS[category] ?? automation.name,
      subtitle: time ? `予定 ${time}` : automation.name,
      automationId: automation.id,
    });
  }

  for (const project of projects) {
    if (project.status !== "pending" && project.status !== "running") continue;
    const category = inferWorkCategoryFromProject(project);
    items.push({
      id: `project:${project.id}`,
      icon: getWorkCategoryIcon(category),
      label: project.title,
      subtitle: CATEGORY_LABELS[category],
      href: `/projects/${project.id}`,
    });
  }

  return items.slice(0, 6);
}

function countTodayTasksForCategories(
  categories: readonly WorkCategoryId[],
  automations: Automation[],
  projects: Project[],
  now: Date,
): number {
  let count = 0;
  for (const automation of automations) {
    if (!isAutomationScheduledForToday(automation, now)) continue;
    const cat = inferWorkCategoryFromAutomation(automation);
    if (categories.includes(cat)) count += 1;
  }
  for (const project of projects) {
    if (project.status !== "running" && project.status !== "pending") continue;
    const cat = inferWorkCategoryFromProject(project);
    if (categories.includes(cat)) count += 1;
  }
  return count;
}

function resolveEmployeeStatus(
  categories: readonly WorkCategoryId[],
  automations: Automation[],
  projects: Project[],
): DailyBriefEmployeeStatus {
  for (const automation of automations) {
    const cat = inferWorkCategoryFromAutomation(automation);
    if (!categories.includes(cat)) continue;
    if (automation.status === "running") return "active";
    if (
      automation.status === "success" &&
      automation.executionLevel === "approve_then_run"
    ) {
      return "reviewing";
    }
  }
  for (const project of projects) {
    const cat = inferWorkCategoryFromProject(project);
    if (!categories.includes(cat)) continue;
    if (project.status === "running") return "active";
    if (project.status === "review") return "reviewing";
  }
  return "idle";
}

export function buildAiEmployeeStatuses(
  automationsInput: readonly Automation[],
  projectsInput: readonly Project[],
  now: Date = new Date(),
): DailyBriefEmployee[] {
  const automations = asArray(automationsInput).map((a) => normalizeAutomation(a));
  const projects = normalizeProjects(projectsInput);

  return AI_EMPLOYEE_DEFS.map((def) => ({
    id: def.id,
    icon: def.icon,
    role: def.role,
    status: resolveEmployeeStatus(def.categories, automations, projects),
    todayTasks: countTodayTasksForCategories(
      def.categories,
      automations,
      projects,
      now,
    ),
  }));
}

export function buildRecommendations(
  profile = loadUserWorkProfile(),
): DailyBriefRecommendation[] {
  const results: DailyBriefRecommendation[] = [];

  for (const item of getRecommendedIntegrations(profile)) {
    results.push({
      id: `integration:${item.serviceId}`,
      icon: item.icon,
      label: `${item.serviceName}を連携`,
      href: item.href,
    });
  }

  for (const item of getRecommendedAutomations(profile)) {
    results.push({
      id: item.id,
      icon: "🔁",
      label: item.label,
      href: item.href,
    });
  }

  const seen = new Set<string>();
  return results
    .filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    })
    .slice(0, 3);
}

export function getDailyTip(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  return DAILY_TIPS[dayOfYear % DAILY_TIPS.length] ?? DAILY_TIPS[0];
}

export function buildLearningInsight(profile = loadUserWorkProfile()): string {
  const top = getTopFrequentJobs(profile, 2);
  if (top.length === 0) {
    return "仕事を登録すると、MINERVOTがあなたの傾向を学習します。";
  }

  const primary = top[0]!;
  const label = primary.label;

  if (/sns|投稿/i.test(label)) {
    return "最近SNS投稿が増えています。";
  }
  if (/ブログ|blog/i.test(label)) {
    return "ブログ作成を優先表示しています。";
  }
  if (/営業|資料/i.test(label)) {
    return "営業資料を優先表示しています。";
  }
  if (/メール/i.test(label)) {
    return "メール整理の頻度が上がっています。";
  }

  const preferred = profile.onboarding?.preferredTasks?.[0];
  if (preferred === "sales_material") return "営業資料を優先表示しています。";
  if (preferred === "sns") return "最近SNS投稿が増えています。";

  if (profile.updatedAt && profile.frequentlyUsedJobs.length > 0) {
    const updated = new Date(profile.updatedAt);
    if (Date.now() - updated.getTime() < MS_PER_DAY) {
      return "昨日学習した内容を反映しました。";
    }
  }

  return `最近「${label}」の利用が増えています。`;
}

export function buildHeadline(
  todayScheduled: DailyBriefScheduledItem[],
  profile = loadUserWorkProfile(),
  now: Date = new Date(),
): string {
  const snsCount = todayScheduled.filter((item) => item.icon === "📱").length;
  if (snsCount > 0) {
    return `今日はSNS投稿を${snsCount}件予定しています。`;
  }

  const blogCount = todayScheduled.filter((item) => item.icon === "📝").length;
  if (blogCount > 0) {
    return "ブログ公開の準備ができています。";
  }

  const salesPreferred =
    profile.onboarding?.preferredTasks?.includes("sales_material") ||
    profile.onboarding?.firstTaskCategory === "sales_material";
  if (salesPreferred) {
    return "営業資料を優先表示しました。";
  }

  if (profile.updatedAt) {
    const updated = new Date(profile.updatedAt);
    if (now.getTime() - updated.getTime() < MS_PER_DAY * 2) {
      return "昨日学習した内容を反映しました。";
    }
  }

  if (todayScheduled.length > 0) {
    return `今日は${todayScheduled.length}件の仕事を予定しています。`;
  }

  return "今日もMINERVOTが仕事を進めます。";
}

export function buildDailyBrief(input: {
  automations: readonly Automation[];
  projects: readonly Project[];
  now?: Date;
}): DailyBrief {
  const now = input.now ?? new Date();
  const profile = loadUserWorkProfile();
  const yesterday = computeYesterdayStats(input.projects, input.automations, now);
  const todayScheduled = buildTodayScheduled(input.automations, input.projects, now);

  return {
    greetingPeriod: getGreetingPeriod(now.getHours()),
    headline: buildHeadline(todayScheduled, profile, now),
    yesterday,
    todayScheduled,
    employees: buildAiEmployeeStatuses(input.automations, input.projects, now),
    recommendations: buildRecommendations(profile),
    dailyTip: getDailyTip(now),
    learningInsight: buildLearningInsight(profile),
  };
}

export function getEmployeeStatusLabel(status: DailyBriefEmployeeStatus): string {
  switch (status) {
    case "active":
      return "稼働中";
    case "reviewing":
      return "確認中";
    default:
      return "待機中";
  }
}

export { CATEGORY_LABELS };
