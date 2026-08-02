export type ValuePeriod = "today" | "week" | "month" | "total";

export type WorkReductionMeter = {
  period: ValuePeriod;
  label: string;
  minutesSaved: number;
  hoursSavedLabel: string;
  clicksSaved: number;
  automationCount: number;
  deliverableCount: number;
  memoryApplyCount: number;
  jobsCompleted: number;
  successRatePercent: number | null;
};

export type ValueRoiSnapshot = {
  planPriceJpy: number;
  monthMinutesSaved: number;
  monthHoursSaved: number;
  monthHoursLabel: string;
  impliedHourlyWageJpy: number;
  roiMultiple: number | null;
  summary: string;
};

export type CompletedWorkItem = {
  id: string;
  title: string;
  statusLabel: string;
  detail: string;
  completedAt: string | null;
  href: string;
};

export type SecretaryReportSnapshot = {
  title: string;
  todayCompleted: number;
  awaitingReply: number;
  nextScheduledLabel: string | null;
  improvementHint: string;
  deadlineLabel: string | null;
  weekJobsCompleted: number;
  weekMinutesSaved: number;
};

export type AutomationRoiRow = {
  id: string;
  name: string;
  minutesSaved: number;
  successRatePercent: number | null;
  runCount: number;
  failureRatePercent: number | null;
  href: string;
};

export type MemoryRoiSnapshot = {
  applyCount: number;
  revisionReductionPercent: number;
  summary: string;
};

export type ValueRankingBucket = {
  id: string;
  title: string;
  valueLabel: string;
  href: string;
};

export type ValueHomeSnapshot = {
  hero: {
    jobsCompleted: number;
    minutesSaved: number;
    hoursSavedLabel: string;
    deliverableCount: number;
    successRatePercent: number | null;
  };
  meters: WorkReductionMeter[];
  roi: ValueRoiSnapshot;
  report: SecretaryReportSnapshot;
  completedWork: CompletedWorkItem[];
  automationRoi: AutomationRoiRow[];
  memoryRoi: MemoryRoiSnapshot;
  rankings: {
    automations: ValueRankingBucket[];
    timeSaved: ValueRankingBucket[];
    deliverables: ValueRankingBucket[];
    memory: ValueRankingBucket[];
  };
  firstUsePitchSeen: boolean;
  pricingBlurb: string;
  generatedAt: string;
};
