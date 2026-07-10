import type { Automation } from "@/lib/automations/types";
import type { IntegrationCatalog } from "@/lib/integrations/types";
import {
  getDeliverableFormatLabel,
  ui,
} from "@/lib/i18n";
import type { KnowledgeEntry } from "@/lib/knowledge/types";
import type { Project, ProjectStatus } from "@/lib/projects/types";
import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";

import type {
  ActivityEvent,
  DashboardMetric,
  DepartmentEmployee,
  EmployeeActivityStatus,
  KnowledgeGrowthPoint,
  TrendDirection,
} from "./types";
import { DASHBOARD_DEPARTMENTS } from "./types";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return d >= weekAgo;
}

function isLastWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(now.getDate() - 14);
  return d >= twoWeeksAgo && d < weekAgo;
}

function trend(current: number, previous: number): { trend: TrendDirection; label: string } {
  if (current > previous) {
    return { trend: "up", label: ui.dashboard.metrics.vsLastWeek(current - previous) };
  }
  if (current < previous) {
    return { trend: "down", label: `先週比 ${current - previous}` };
  }
  return { trend: "neutral", label: ui.dashboard.metrics.steady };
}

export function formatDashboardClock(): string {
  return new Date().toLocaleString("ja-JP", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function activeDepartmentId(progress: number, status: ProjectStatus): string {
  if (status === "completed") return "ceo";
  if (status === "review") return "qa";
  if (status === "pending") return "ceo";
  if (progress < 15) return "ceo";
  if (progress < 30) return "planning";
  if (progress < 45) return "research";
  if (progress < 55) return "development";
  if (progress < 75) return "marketing";
  if (progress < 90) return "qa";
  return "ceo";
}

function statusForDepartment(
  deptId: string,
  activeId: string,
  projectStatus: ProjectStatus,
  progress: number,
): EmployeeActivityStatus {
  if (deptId !== activeId) {
    if (projectStatus === "completed" && deptId === "ceo") return "completed";
    return "idle";
  }
  if (projectStatus === "completed") return "completed";
  if (projectStatus === "review") return "reviewing";
  if (projectStatus === "running") {
    if (deptId === "ceo" && progress < 15) return "thinking";
    if (deptId === "qa") return "reviewing";
    return "working";
  }
  return "idle";
}

export function deriveEmployeeStatuses(projects: Project[]): DepartmentEmployee[] {
  const running = projects.filter((p) => p.status === "running" || p.status === "review");
  const latest = running.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];

  const activeId = latest
    ? activeDepartmentId(latest.progress, latest.status)
    : null;

  return DASHBOARD_DEPARTMENTS.map((dept) => {
    let status: EmployeeActivityStatus = "idle";
    let lastActivity: string | null = null;

    if (latest && activeId) {
      status = statusForDepartment(dept.id, activeId, latest.status, latest.progress);
      lastActivity = latest.updatedAt;
    }

    const recentCompleted = projects.find(
      (p) =>
        p.status === "completed" &&
        isToday(p.updatedAt) &&
        activeDepartmentId(p.progress, p.status) === dept.id,
    );
    if (recentCompleted && status === "idle") {
      status = "completed";
      lastActivity = recentCompleted.updatedAt;
    }

    return {
      id: dept.id,
      name: dept.name,
      icon: dept.icon,
      status,
      lastActivity,
    };
  });
}

export function deriveActivityFeed(
  projects: Project[],
  automations: Automation[],
  knowledge: KnowledgeEntry[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const project of projects) {
    const r = project.result;
    if (!r) {
      if (project.status !== "pending") {
        events.push({
          id: `project-${project.id}`,
          type: "project",
          title: project.title,
          description: ui.dashboard.activity.projectUpdated,
          timestamp: project.updatedAt,
          icon: "📁",
        });
      }
      continue;
    }

    if (r.research?.report) {
      events.push({
        id: `research-${project.id}`,
        type: "research",
        title: ui.dashboard.activity.researchCompleted,
        description: project.title,
        timestamp: project.updatedAt,
        icon: "🔍",
      });
    }

    if (r.qualityLoop?.ceoApproval?.approved) {
      events.push({
        id: `ceo-${project.id}`,
        type: "ceo",
        title: ui.dashboard.activity.ceoApproved,
        description: project.title,
        timestamp: project.updatedAt,
        icon: "👔",
      });
    }

    if (r.finalResponse && project.status === "completed") {
      events.push({
        id: `deliverable-${project.id}`,
        type: "deliverable",
        title: ui.dashboard.activity.deliverablesGenerated,
        description: project.title,
        timestamp: project.updatedAt,
        icon: "📦",
      });
      events.push({
        id: `drive-${project.id}`,
        type: "drive",
        title: ui.dashboard.activity.driveReady,
        description: project.title,
        timestamp: project.updatedAt,
        icon: "📁",
      });
    }
  }

  for (const automation of automations) {
    if (automation.lastRun) {
      events.push({
        id: `auto-${automation.id}`,
        type: "automation",
        title: ui.dashboard.activity.automationExecuted,
        description: automation.name,
        timestamp: automation.lastRun,
        icon: "🔄",
      });
    }
  }

  for (const entry of knowledge.slice(0, 5)) {
    events.push({
      id: `knowledge-${entry.id}`,
      type: "knowledge",
      title: ui.dashboard.activity.knowledgeLearned,
      description: entry.title,
      timestamp: entry.createdAt,
      icon: "🧠",
    });
  }

  return events
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 12);
}

export function deriveKnowledgeGrowth(entries: KnowledgeEntry[]): KnowledgeGrowthPoint[] {
  const days: KnowledgeGrowthPoint[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("ja-JP", { weekday: "short" });
    const count = entries.filter((e) => e.createdAt.slice(0, 10) === key).length;
    days.push({ label, count });
  }

  return days;
}

export function estimateHoursSaved(projects: Project[]): number {
  const completedThisWeek = projects.filter(
    (p) => p.status === "completed" && isThisWeek(p.updatedAt),
  );

  const ms = completedThisWeek.reduce(
    (sum, p) => sum + (p.result?.totalDurationMs ?? 0),
    0,
  );

  if (ms > 0) return Math.round((ms / 3_600_000) * 10) / 10;

  return Math.round(completedThisWeek.length * 2.5 * 10) / 10;
}

export function buildDashboardMetrics(
  projects: Project[],
  automations: Automation[],
  knowledgeTotal: number,
  connectedIntegrations: number,
): DashboardMetric[] {
  const completedToday = projects.filter(
    (p) => p.status === "completed" && isToday(p.updatedAt),
  ).length;

  const running = projects.filter((p) => p.status === "running").length;

  const qualityScores = projects
    .map((p) => p.result?.qualityLoop?.currentScore)
    .filter((s): s is number => typeof s === "number");
  const avgQuality =
    qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
      : null;

  const activeAutomations = automations.filter((a) => a.enabled).length;

  const completedThisWeek = projects.filter(
    (p) => p.status === "completed" && isThisWeek(p.updatedAt),
  ).length;
  const completedLastWeek = projects.filter(
    (p) => p.status === "completed" && isLastWeek(p.updatedAt),
  ).length;

  const knowledgeThisWeek = completedThisWeek;
  const knowledgeLastWeek = completedLastWeek;

  const hoursSaved = estimateHoursSaved(projects);
  const tCompleted = trend(completedThisWeek, completedLastWeek);
  const tKnowledge = trend(knowledgeThisWeek, knowledgeLastWeek);

  return [
    {
      id: "completed-today",
      label: ui.dashboard.metrics.completedToday,
      value: completedToday,
      subtitle: ui.dashboard.metrics.completedTodaySub,
      icon: "✓",
      trend: completedToday > 0 ? "up" : "neutral",
      trendLabel:
        completedToday > 0 ? ui.project.status.completed : ui.dashboard.metrics.steady,
    },
    {
      id: "running",
      label: ui.dashboard.metrics.running,
      value: running,
      subtitle: ui.dashboard.metrics.runningSub,
      icon: "⚡",
      trend: running > 0 ? "up" : "neutral",
      trendLabel:
        running > 0 ? ui.project.status.running : ui.dashboard.companyStatus.idle,
    },
    {
      id: "quality",
      label: ui.dashboard.metrics.qualityScore,
      value: avgQuality !== null ? `${avgQuality}%` : "—",
      subtitle: ui.dashboard.metrics.qualityScoreSub,
      icon: "◎",
      trend: avgQuality !== null && avgQuality >= 90 ? "up" : "neutral",
      trendLabel:
        avgQuality !== null
          ? ui.marketplace.presets(qualityScores.length)
          : ui.dashboard.metrics.steady,
    },
    {
      id: "automations",
      label: ui.dashboard.metrics.automations,
      value: activeAutomations,
      subtitle: ui.dashboard.metrics.automationsSub,
      icon: "🔄",
      trend: activeAutomations > 0 ? "up" : "neutral",
      trendLabel:
        activeAutomations > 0 ? ui.actions.active : ui.automations.disabled,
    },
    {
      id: "knowledge",
      label: ui.dashboard.metrics.knowledge,
      value: knowledgeTotal,
      subtitle: ui.dashboard.metrics.knowledgeSub,
      icon: "🧠",
      trend: tKnowledge.trend,
      trendLabel: tKnowledge.label,
    },
    {
      id: "integrations",
      label: ui.dashboard.metrics.integrations,
      value: connectedIntegrations,
      subtitle: ui.dashboard.metrics.integrationsSub,
      icon: "🔗",
      trend: connectedIntegrations > 0 ? "up" : "neutral",
      trendLabel:
        connectedIntegrations > 0
          ? ui.integrations.connected
          : ui.integrations.notConnected,
    },
    {
      id: "hours-saved",
      label: ui.dashboard.metrics.hoursSaved,
      value: hoursSaved,
      subtitle: ui.dashboard.metrics.hoursSavedSub,
      icon: "⏱",
      trend: tCompleted.trend,
      trendLabel: tCompleted.label,
    },
  ];
}

export function getProjectDepartmentLabel(project: Project): string {
  const id = activeDepartmentId(project.progress, project.status);
  return DASHBOARD_DEPARTMENTS.find((d) => d.id === id)?.name ?? ui.workflowPhases.ceo;
}

export function getProjectQualityScore(project: Project): number | null {
  return project.result?.qualityLoop?.currentScore ?? null;
}

export function getProjectDeliverableHint(project: Project): string {
  if (project.status !== "completed" || !project.result?.finalResponse) {
    return "—";
  }
  return ["pdf", "docx", "pptx"].map(getDeliverableFormatLabel).join(" · ");
}

export function pickRecommendedPackages(
  packages: WorkflowPackageView[],
  featuredIds: readonly string[],
): WorkflowPackageView[] {
  const featured = featuredIds
    .map((id) => packages.find((p) => p.templateId === id))
    .filter((p): p is WorkflowPackageView => p !== undefined);

  if (featured.length >= 3) return featured.slice(0, 4);

  return packages.filter((p) => !p.isInstalled).slice(0, 4);
}

export function countConnectedIntegrations(catalog: IntegrationCatalog | null): number {
  if (!catalog) return 0;
  return catalog.connections.filter((i) => i.connected).length;
}
