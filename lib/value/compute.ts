import type { Automation } from "@/lib/automations/types";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import {
  asArray,
  normalizeAutomation,
  normalizeProject,
  parseTimestamp,
} from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

import {
  CLICKS_PER_COMPLETED_JOB,
  DEFAULT_PLAN_PRICE_JPY,
  MINUTES_PER_AUTOMATION_SUCCESS,
  MINUTES_PER_COMPLETED_JOB,
  MINUTES_PER_DELIVERABLE,
  MINUTES_PER_MEMORY_APPLY,
} from "./constants";
import { formatHoursMinutes, formatYen } from "./format";
import { getMemoryApplyCount, hasSeenValuePitch } from "./store";
import type {
  AutomationRoiRow,
  CompletedWorkItem,
  MemoryRoiSnapshot,
  SecretaryReportSnapshot,
  ValueHomeSnapshot,
  ValuePeriod,
  ValueRankingBucket,
  ValueRoiSnapshot,
  WorkReductionMeter,
} from "./types";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function inRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = parseTimestamp(iso);
  if (Number.isNaN(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function periodWindow(
  period: ValuePeriod,
  now: Date,
): { from: Date; to: Date; label: string } {
  const to = now;
  if (period === "today") {
    return { from: startOfDay(now), to, label: "今日" };
  }
  if (period === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to, label: "今週" };
  }
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to, label: "今月" };
  }
  return { from: new Date(0), to, label: "合計" };
}

type CompletedUnit = {
  id: string;
  title: string;
  at: string;
  kind: "project" | "automation";
  href: string;
  success: boolean;
};

function collectCompleted(
  projects: readonly Project[],
  automations: readonly Automation[],
): CompletedUnit[] {
  const fromProjects = asArray(projects)
    .map((p) => normalizeProject(p))
    .filter((p) => p.status === "completed")
    .map((p) => ({
      id: `p:${p.id}`,
      title: p.title || "仕事",
      at: p.updatedAt,
      kind: "project" as const,
      href: `/projects/${encodeURIComponent(p.id)}`,
      success: true,
    }));

  const fromAutomations = asArray(automations)
    .map((a) => normalizeAutomation(a))
    .filter((a) => Boolean(a.lastRun))
    .map((a) => ({
      id: `a:${a.id}`,
      title: a.name || "自動化",
      at: a.lastRun as string,
      kind: "automation" as const,
      href: `/automations?id=${encodeURIComponent(a.id)}`,
      success: a.status === "success",
    }));

  return [...fromProjects, ...fromAutomations].sort(
    (a, b) => parseTimestamp(b.at) - parseTimestamp(a.at),
  );
}

function meterFor(
  period: ValuePeriod,
  units: CompletedUnit[],
  memoryApplyCount: number,
  now: Date,
): WorkReductionMeter {
  const { from, to, label } = periodWindow(period, now);
  const inPeriod = units.filter((u) => inRange(u.at, from, to));
  const jobsCompleted = inPeriod.length;
  const automationCount = inPeriod.filter((u) => u.kind === "automation").length;
  const deliverableCount = inPeriod.filter((u) => u.kind === "project").length;
  const successCount = inPeriod.filter((u) => u.success).length;
  const memoryShare =
    period === "total"
      ? memoryApplyCount
      : period === "month"
        ? Math.min(memoryApplyCount, Math.max(0, Math.round(memoryApplyCount * 0.6)))
        : period === "week"
          ? Math.min(memoryApplyCount, Math.max(0, Math.round(memoryApplyCount * 0.25)))
          : Math.min(memoryApplyCount, Math.max(0, Math.round(memoryApplyCount * 0.08)));

  const minutesSaved =
    jobsCompleted * MINUTES_PER_COMPLETED_JOB +
    automationCount * MINUTES_PER_AUTOMATION_SUCCESS +
    deliverableCount * MINUTES_PER_DELIVERABLE +
    memoryShare * MINUTES_PER_MEMORY_APPLY;

  return {
    period,
    label,
    minutesSaved,
    hoursSavedLabel: formatHoursMinutes(minutesSaved),
    clicksSaved: jobsCompleted * CLICKS_PER_COMPLETED_JOB,
    automationCount,
    deliverableCount,
    memoryApplyCount: memoryShare,
    jobsCompleted,
    successRatePercent:
      jobsCompleted > 0 ? Math.round((successCount / jobsCompleted) * 100) : null,
  };
}

export function buildValueRoi(monthMinutes: number): ValueRoiSnapshot {
  const plan = getPlanDefinition("light");
  const planPriceJpy = plan?.monthlyPriceJpy ?? DEFAULT_PLAN_PRICE_JPY;
  const monthHoursSaved = Math.round((monthMinutes / 60) * 10) / 10;
  const impliedHourlyWageJpy =
    monthHoursSaved > 0 ? Math.round(planPriceJpy / monthHoursSaved) : 0;
  const marketHourly = 2000;
  const roiMultiple =
    impliedHourlyWageJpy > 0
      ? Math.round((marketHourly / impliedHourlyWageJpy) * 10) / 10
      : null;

  return {
    planPriceJpy,
    monthMinutesSaved: monthMinutes,
    monthHoursSaved,
    monthHoursLabel: formatHoursMinutes(monthMinutes),
    impliedHourlyWageJpy,
    roiMultiple,
    summary:
      monthMinutes > 0
        ? `あなたは今月 ${formatYen(planPriceJpy)} で 約${formatHoursMinutes(monthMinutes)} の作業を削減しました。時給換算 ${formatYen(impliedHourlyWageJpy)}`
        : `月額 ${formatYen(planPriceJpy)} — 仕事が終わるほど、時給換算の価値が上がります。`,
  };
}

function buildCompletedWork(units: CompletedUnit[]): CompletedWorkItem[] {
  return units.slice(0, 12).map((unit) => ({
    id: unit.id,
    title: unit.title,
    statusLabel: unit.success ? "完了" : "要確認",
    detail:
      unit.kind === "automation"
        ? "自動化が仕事を完了"
        : "成果物を受け取り済み",
    completedAt: unit.at,
    href: unit.href,
  }));
}

function buildReport(
  meters: WorkReductionMeter[],
  units: CompletedUnit[],
  automations: readonly Automation[],
): SecretaryReportSnapshot {
  const today = meters.find((m) => m.period === "today")!;
  const week = meters.find((m) => m.period === "week")!;
  const awaiting = asArray(automations).filter((a) => {
    const status = normalizeAutomation(a).status;
    return status === "running" || status === "failed";
  }).length;
  const next = asArray(automations)
    .map((a) => normalizeAutomation(a))
    .filter((a) => a.nextRun)
    .sort(
      (a, b) => parseTimestamp(a.nextRun ?? "") - parseTimestamp(b.nextRun ?? ""),
    )[0];

  const recentFail = units.some((u) => !u.success);
  return {
    title: "AI秘書レポート",
    todayCompleted: today.jobsCompleted,
    awaitingReply: awaiting,
    nextScheduledLabel: next?.nextRun
      ? `${next.name} · ${new Date(next.nextRun).toLocaleString("ja-JP", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : null,
    improvementHint: recentFail
      ? "失敗した仕事の再実行条件を見直すと、成功率を上げられます。"
      : today.jobsCompleted > 0
        ? "同じ仕事を自動化すると、来週の手作業をさらに減らせます。"
        : "最初の仕事を1つ終わらせると、削減時間がここに現れます。",
    deadlineLabel: next?.nextRun
      ? `次回予定 ${new Date(next.nextRun).toLocaleDateString("ja-JP")}`
      : null,
    weekJobsCompleted: week.jobsCompleted,
    weekMinutesSaved: week.minutesSaved,
  };
}

function buildAutomationRoi(
  automations: readonly Automation[],
): AutomationRoiRow[] {
  return asArray(automations)
    .map((raw) => normalizeAutomation(raw))
    .map((a) => {
      const successCount = Math.max(0, a.successCount ?? 0);
      const failureCount = Math.max(0, a.failureCount ?? 0);
      const historyCount = Array.isArray(a.runHistory) ? a.runHistory.length : 0;
      const runCount = Math.max(
        successCount + failureCount,
        historyCount,
        a.lastRun ? 1 : 0,
      );
      const total = successCount + failureCount;
      const successRate =
        total > 0
          ? Math.round((successCount / total) * 100)
          : a.status === "success"
            ? 100
            : a.status === "failed"
              ? 0
              : null;
      const failureRate =
        successRate == null ? null : Math.max(0, 100 - successRate);
      const minutesSaved =
        successCount * (MINUTES_PER_AUTOMATION_SUCCESS + MINUTES_PER_COMPLETED_JOB) ||
        (a.lastRun ? MINUTES_PER_AUTOMATION_SUCCESS : 0);
      return {
        id: a.id,
        name: a.name,
        minutesSaved,
        successRatePercent: successRate,
        runCount,
        failureRatePercent: failureRate,
        href: `/automations?id=${encodeURIComponent(a.id)}`,
      };
    })
    .sort((a, b) => b.minutesSaved - a.minutesSaved)
    .slice(0, 8);
}

function buildMemoryRoi(applyCount: number): MemoryRoiSnapshot {
  // Heuristic: each apply reduces revision load; caps at 70%.
  const revisionReductionPercent = Math.min(70, applyCount * 7);
  return {
    applyCount,
    revisionReductionPercent,
    summary:
      applyCount > 0
        ? `Memoryにより、修正量が約 ${revisionReductionPercent}% 減りました。`
        : "好みを覚えるほど、やり直しが減ります。",
  };
}

function toRanking(
  rows: Array<{ id: string; title: string; valueLabel: string; href: string }>,
): ValueRankingBucket[] {
  return rows.slice(0, 5);
}

export function buildValueHomeSnapshot(input: {
  projects: readonly Project[];
  automations: readonly Automation[];
  now?: Date;
}): ValueHomeSnapshot {
  const now = input.now ?? new Date();
  const units = collectCompleted(input.projects, input.automations);
  const memoryApplyCount = getMemoryApplyCount();
  const meters = (["today", "week", "month", "total"] as const).map((period) =>
    meterFor(period, units, memoryApplyCount, now),
  );
  const today = meters.find((m) => m.period === "today")!;
  const month = meters.find((m) => m.period === "month")!;
  const roi = buildValueRoi(month.minutesSaved);
  const automationRoi = buildAutomationRoi(input.automations);
  const memoryRoi = buildMemoryRoi(memoryApplyCount);
  const completedWork = buildCompletedWork(units);

  const pricingBlurb = `${formatYen(roi.planPriceJpy)} → 仕事削減時間 → ROI（時給換算 ${
    roi.impliedHourlyWageJpy > 0 ? formatYen(roi.impliedHourlyWageJpy) : "—"
  }）`;

  return {
    hero: {
      jobsCompleted: today.jobsCompleted,
      minutesSaved: today.minutesSaved,
      hoursSavedLabel: today.hoursSavedLabel,
      deliverableCount: today.deliverableCount,
      successRatePercent: today.successRatePercent,
    },
    meters,
    roi,
    report: buildReport(meters, units, input.automations),
    completedWork,
    automationRoi,
    memoryRoi,
    rankings: {
      automations: toRanking(
        automationRoi.map((row) => ({
          id: row.id,
          title: row.name,
          valueLabel: `${row.runCount}回 · 成功率 ${row.successRatePercent ?? "—"}%`,
          href: row.href,
        })),
      ),
      timeSaved: toRanking(
        automationRoi.map((row) => ({
          id: `t-${row.id}`,
          title: row.name,
          valueLabel: formatHoursMinutes(row.minutesSaved),
          href: row.href,
        })),
      ),
      deliverables: toRanking(
        completedWork
          .filter((item) => item.id.startsWith("p:"))
          .map((item) => ({
            id: item.id,
            title: item.title,
            valueLabel: item.statusLabel,
            href: item.href,
          })),
      ),
      memory: toRanking(
        memoryApplyCount > 0
          ? [
              {
                id: "memory-main",
                title: "Memory適用",
                valueLabel: `${memoryApplyCount}回 · 修正 −${memoryRoi.revisionReductionPercent}%`,
                href: "/settings/memory",
              },
            ]
          : [
              {
                id: "memory-empty",
                title: "Memoryを育てる",
                valueLabel: "まだ適用なし",
                href: "/settings/memory",
              },
            ],
      ),
    },
    firstUsePitchSeen: hasSeenValuePitch(),
    pricingBlurb,
    generatedAt: now.toISOString(),
  };
}

export function buildWeeklySecretaryReportText(
  snapshot: ValueHomeSnapshot,
): string {
  return [
    "【今週のAI秘書レポート】",
    `終わらせた仕事: ${snapshot.report.weekJobsCompleted}件`,
    `削減時間: ${formatHoursMinutes(snapshot.report.weekMinutesSaved)}`,
    `今月のROI: ${snapshot.roi.summary}`,
  ].join("\n");
}
