/** Phase5 β ops — service-state KPIs (no PII user lists). */

export type BetaOpsPeriod = "today" | "week" | "month";

export type BetaOpsEventKind =
  | "request"
  | "complete"
  | "fail"
  | "dropout"
  | "retry"
  | "re_request"
  | "referral"
  | "paid";

export type BetaOpsEvent = {
  id: string;
  kind: BetaOpsEventKind;
  at: string;
  userId: string | null;
  jobId: string | null;
  durationMs: number | null;
  /** Normalized job fingerprint for re-request rate (no raw assignment text). */
  assignmentHash: string | null;
};

export type BetaOpsPeriodKpis = {
  period: BetaOpsPeriod;
  requestCount: number;
  completionRatePercent: number;
  failureRatePercent: number;
  avgCompletionSeconds: number | null;
  dropoutRatePercent: number;
  retryRatePercent: number;
  reRequestRatePercent: number;
  retention7Percent: number | null;
  retention30Percent: number | null;
  referralRatePercent: number | null;
  paidConversionPercent: number | null;
  /** CEO launch gate signal for this period. */
  publishVerdict: "go" | "delay" | "kill" | "insufficient_data";
};

export type BetaOpsSnapshot = {
  generatedAt: string;
  inviteOnly: true;
  targetUsers: { min: 10; max: 20 };
  betaUserCount: number;
  periods: {
    today: BetaOpsPeriodKpis;
    week: BetaOpsPeriodKpis;
    month: BetaOpsPeriodKpis;
  };
  channels: {
    termsUrl: string;
    privacyUrl: string;
    bugReportUrl: string;
    feedbackUrl: string;
    contactUrl: string;
    statusUrl: string;
  };
  improvementLog: readonly BetaImprovementEntry[];
};

export type BetaImprovementEntry = {
  id: string;
  at: string;
  title: string;
  /** Must cite metric deltas — no opinions. */
  evidence: string;
  period: BetaOpsPeriod | "adhoc";
};
