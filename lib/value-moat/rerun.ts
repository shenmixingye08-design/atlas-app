/**
 * VALUE 4 — history is an asset. Rerun the work shape, not the old artifact.
 * Always mint a new job id. Refresh period/date; never freeze last month's data.
 */

export type RerunSource = {
  previousJobId: string;
  workRequest: string;
  title?: string | null;
  format?: string | null;
  integration?: string | null;
  status: "completed" | "failed" | "running" | string;
};

export type HistoryRerunPlan = {
  newJobId: string;
  previousJobId: string;
  assignment: string;
  reusedFormat: string | null;
  reusedIntegration: string | null;
  copyArtifact: false;
  reuseWorkShape: true;
  allowed: boolean;
  reason: string | null;
};

const MONTH_RE = /(\d{1,2})\s*月/;
const YEAR_MONTH_RE = /(\d{4})[/-](\d{1,2})/;

export function mintRerunJobId(nowMs = Date.now()): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `rerun_${rand}`;
}

export function refreshPeriodInAssignment(
  text: string,
  now: Date = new Date(),
): string {
  let next = text;
  const yearMonth = next.match(YEAR_MONTH_RE);
  if (yearMonth) {
    const year = Number.parseInt(yearMonth[1]!, 10);
    const month = Number.parseInt(yearMonth[2]!, 10);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    if (year !== currentYear || month !== currentMonth) {
      next = next.replace(
        YEAR_MONTH_RE,
        `${currentYear}-${String(currentMonth).padStart(2, "0")}`,
      );
    }
  } else {
    const month = next.match(MONTH_RE);
    if (month) {
      const previous = Number.parseInt(month[1]!, 10);
      const current = now.getMonth() + 1;
      if (previous !== current && previous >= 1 && previous <= 12) {
        next = next.replace(MONTH_RE, `${current}月`);
      }
    }
  }
  return next
    .replace(/先週と同じ形式で/, "同じ形式で")
    .replace(/もう一度作って$/, "")
    .trim();
}

export function planHistoryRerun(
  source: RerunSource,
  now: Date = new Date(),
): HistoryRerunPlan {
  if (source.status !== "completed") {
    return {
      newJobId: mintRerunJobId(now.getTime()),
      previousJobId: source.previousJobId,
      assignment: source.workRequest,
      reusedFormat: source.format ?? null,
      reusedIntegration: source.integration ?? null,
      copyArtifact: false,
      reuseWorkShape: true,
      allowed: false,
      reason: "成功した仕事だけ再実行できます",
    };
  }
  const newJobId = mintRerunJobId(now.getTime());
  return {
    newJobId,
    previousJobId: source.previousJobId,
    assignment: refreshPeriodInAssignment(source.workRequest, now),
    reusedFormat: source.format ?? null,
    reusedIntegration: source.integration ?? null,
    copyArtifact: false,
    reuseWorkShape: true,
    allowed: true,
    reason: null,
  };
}

export function buildHistoryRerunHref(plan: HistoryRerunPlan): string {
  const params = new URLSearchParams({
    assignment: plan.assignment,
    rerunFrom: plan.previousJobId,
    jobId: plan.newJobId,
  });
  if (plan.reusedFormat) params.set("format", plan.reusedFormat);
  return `/workspace?${params.toString()}`;
}
