import { usesStripeLiveSecretKey } from "@/lib/billing/stripe/production-guard";

import { MIN_CLICKS_FOR_STOP, MIN_LEARNING_PUBLISHED } from "./constants";
import { safeRate } from "./display";
import type { RevenueAgentEvent } from "./events";
import type {
  GenerationCostRecord,
  MeasuredNumber,
  RevenueContent,
  RevenueContentRow,
  RevenueFunnelRange,
  RevenueFunnelTotals,
  RevenueLearningVerdict,
} from "./types";

export function rangeStartMs(range: RevenueFunnelRange, now = new Date()): number | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

export function inRange(
  iso: string | null | undefined,
  range: RevenueFunnelRange,
  now = new Date(),
): boolean {
  if (!iso) return false;
  const start = rangeStartMs(range, now);
  if (start == null) return true;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  return ms >= start;
}

function eventLivemode(event: RevenueAgentEvent): boolean | null {
  const raw = event.metadata.livemode;
  if (typeof raw === "boolean") return raw;
  return null;
}

function stripeModeMatches(event: RevenueAgentEvent): boolean {
  if (
    event.eventName !== "invoice_paid" &&
    event.eventName !== "subscription_started" &&
    event.eventName !== "subscription_canceled" &&
    event.eventName !== "checkout_started" &&
    event.eventName !== "refund_recorded"
  ) {
    return true;
  }
  const live = eventLivemode(event);
  if (live == null) return false;
  return live === usesStripeLiveSecretKey();
}

export function filterEventsForRange(
  events: RevenueAgentEvent[],
  range: RevenueFunnelRange,
  now = new Date(),
): RevenueAgentEvent[] {
  return events.filter(
    (event) => inRange(event.occurredAt, range, now) && stripeModeMatches(event),
  );
}

function countNamed(
  events: RevenueAgentEvent[],
  name: RevenueAgentEvent["eventName"],
): number {
  return events.filter((event) => event.eventName === name).length;
}

function uniqueVisitors(
  events: RevenueAgentEvent[],
  name: RevenueAgentEvent["eventName"],
): number {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.eventName !== name) continue;
    if (event.anonymousVisitorId) ids.add(event.anonymousVisitorId);
  }
  return ids.size;
}

function sumInvoiceYen(events: RevenueAgentEvent[]): MeasuredNumber {
  const paid = events.filter((event) => event.eventName === "invoice_paid");
  if (paid.length === 0) return null;
  let sum = 0;
  let known = 0;
  for (const event of paid) {
    const amount = event.metadata.amountYen;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      sum += amount;
      known += 1;
    }
  }
  return known === 0 ? null : sum;
}

function sumRefundYen(events: RevenueAgentEvent[]): MeasuredNumber {
  const rows = events.filter((event) => event.eventName === "refund_recorded");
  if (rows.length === 0) return null;
  let sum = 0;
  let known = 0;
  for (const event of rows) {
    const amount = event.metadata.amountYen;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      sum += amount;
      known += 1;
    }
  }
  return known === 0 ? null : sum;
}

function openaiCostUsd(
  costs: GenerationCostRecord[],
  range: RevenueFunnelRange,
  now = new Date(),
): MeasuredNumber {
  const rows = costs.filter((row) => inRange(row.at, range, now));
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
}

export function buildFunnelTotals(input: {
  items: RevenueContent[];
  events: RevenueAgentEvent[];
  costs: GenerationCostRecord[];
  adSpendYen: MeasuredNumber;
  range: RevenueFunnelRange;
  now?: Date;
}): RevenueFunnelTotals {
  const now = input.now ?? new Date();
  const events = filterEventsForRange(input.events, input.range, now);
  const published = input.items.filter(
    (item) =>
      item.status === "published" && inRange(item.publishedAt, input.range, now),
  );
  const publishedPosts = published.length;
  const clickEvents = events.filter((event) => event.eventName === "link_clicked");
  const clicks = clickEvents.length;
  const uniqueVisits = uniqueVisitors(events, "link_clicked");
  const signups = countNamed(events, "signup_completed");
  const firstJobs = countNamed(events, "first_job_completed");
  const firstAutomations = countNamed(events, "first_automation_completed");
  const checkoutStarted = countNamed(events, "checkout_started");
  const paidContracts = countNamed(events, "subscription_started");
  const cashRevenueYen = sumInvoiceYen(events);
  const refundsYen = sumRefundYen(events);
  const firstSuccesses = firstJobs + firstAutomations;
  const impressionsKnown = published.some((item) => item.metrics.impressions != null);
  const impressions = impressionsKnown
    ? published.reduce((sum, item) => sum + (item.metrics.impressions ?? 0), 0)
    : null;

  const hasClickData = clickEvents.length > 0 || published.some((item) => item.metrics.linkClicks != null);
  const hasSignupData = events.some((event) => event.eventName === "signup_completed");

  return {
    publishedPosts,
    clicks: hasClickData || clicks > 0 ? clicks : publishedPosts > 0 ? 0 : null,
    uniqueVisits: hasClickData || uniqueVisits > 0 ? uniqueVisits : publishedPosts > 0 ? 0 : null,
    signups: hasSignupData || signups > 0 ? signups : null,
    firstJobs: events.some((event) => event.eventName === "first_job_completed")
      ? firstJobs
      : null,
    firstAutomations: events.some((event) => event.eventName === "first_automation_completed")
      ? firstAutomations
      : null,
    checkoutStarted: events.some((event) => event.eventName === "checkout_started")
      ? checkoutStarted
      : null,
    paidContracts: events.some((event) => event.eventName === "subscription_started")
      ? paidContracts
      : null,
    cashRevenueYen,
    refundsYen,
    ctr: safeRate(hasClickData ? uniqueVisits : null, impressions),
    clickToSignupRate: safeRate(hasSignupData ? signups : null, hasClickData ? uniqueVisits : null),
    signupToFirstSuccessRate: safeRate(
      events.some(
        (event) =>
          event.eventName === "first_job_completed" ||
          event.eventName === "first_automation_completed",
      )
        ? firstSuccesses
        : null,
      hasSignupData ? signups : null,
    ),
    signupToPaidRate: safeRate(
      events.some((event) => event.eventName === "subscription_started")
        ? paidContracts
        : null,
      hasSignupData ? signups : null,
    ),
    signupsPerPost: safeRate(hasSignupData ? signups : null, publishedPosts > 0 ? publishedPosts : null),
    cashPerPostYen: safeRate(cashRevenueYen, publishedPosts > 0 ? publishedPosts : null),
    openaiCostUsd: openaiCostUsd(input.costs, input.range, now),
    adSpendYen: input.adSpendYen,
    paidAcquisitionCostYen: safeRate(
      input.adSpendYen,
      events.some((event) => event.eventName === "subscription_started") && paidContracts > 0
        ? paidContracts
        : null,
    ),
    roas: safeRate(cashRevenueYen, input.adSpendYen),
  };
}

export function eventsForContent(
  events: RevenueAgentEvent[],
  contentId: string,
): RevenueAgentEvent[] {
  return events.filter((event) => event.contentId === contentId);
}

export function contentVerdict(input: {
  clicks: MeasuredNumber;
  signups: MeasuredNumber;
  firstSuccesses: MeasuredNumber;
  paidContracts: MeasuredNumber;
  cashRevenueYen: MeasuredNumber;
}): { verdict: RevenueLearningVerdict; label: string } {
  const measured =
    input.clicks != null ||
    input.signups != null ||
    input.firstSuccesses != null ||
    input.paidContracts != null ||
    input.cashRevenueYen != null;
  if (!measured) {
    return { verdict: "hold", label: "データ不足のため判断保留" };
  }
  if ((input.cashRevenueYen ?? 0) > 0 || (input.paidContracts ?? 0) > 0) {
    return { verdict: "continue", label: "継続候補（入金または有料契約あり）" };
  }
  if ((input.signups ?? 0) > 0 || (input.firstSuccesses ?? 0) > 0) {
    return { verdict: "improve", label: "改善候補（登録または初回成功あり）" };
  }
  if ((input.clicks ?? 0) >= MIN_CLICKS_FOR_STOP && (input.signups ?? 0) === 0) {
    return { verdict: "stop", label: "停止候補（クリックはあるが登録なし）" };
  }
  return { verdict: "hold", label: "データ不足のため判断保留" };
}

export function buildContentRows(input: {
  items: RevenueContent[];
  events: RevenueAgentEvent[];
  costs: GenerationCostRecord[];
  range: RevenueFunnelRange;
  now?: Date;
}): RevenueContentRow[] {
  const now = input.now ?? new Date();
  const events = filterEventsForRange(input.events, input.range, now);
  return input.items.map((item) => {
    const rows = eventsForContent(events, item.contentId);
    const hasClicks = rows.some((event) => event.eventName === "link_clicked");
    const hasSignups = rows.some((event) => event.eventName === "signup_completed");
    const clicks = hasClicks
      ? rows.filter((event) => event.eventName === "link_clicked").length
      : null;
    const signups = hasSignups
      ? rows.filter((event) => event.eventName === "signup_completed").length
      : null;
    const firstJobs = rows.filter((event) => event.eventName === "first_job_completed").length;
    const firstAutos = rows.filter(
      (event) => event.eventName === "first_automation_completed",
    ).length;
    const firstSuccesses =
      rows.some(
        (event) =>
          event.eventName === "first_job_completed" ||
          event.eventName === "first_automation_completed",
      )
        ? firstJobs + firstAutos
        : null;
    const paid = rows.some((event) => event.eventName === "subscription_started")
      ? rows.filter((event) => event.eventName === "subscription_started").length
      : null;
    const cash = sumInvoiceYen(rows);
    const itemCosts = input.costs.filter(
      (cost) => cost.generationId === item.generationId && inRange(cost.at, input.range, now),
    );
    const aiCostUsd =
      itemCosts.length > 0
        ? itemCosts.reduce((sum, row) => sum + row.estimatedCostUsd, 0) /
          Math.max(1, input.items.filter((row) => row.generationId === item.generationId).length)
        : null;
    const { verdict, label } = contentVerdict({
      clicks,
      signups,
      firstSuccesses,
      paidContracts: paid,
      cashRevenueYen: cash,
    });
    return {
      contentId: item.contentId,
      publishedAt: item.publishedAt,
      title: item.title,
      cta: item.cta,
      status: item.status,
      postUrl: item.postUrl,
      clicks,
      signups,
      firstSuccesses,
      paidContracts: paid,
      cashRevenueYen: cash,
      aiCostUsd,
      verdict,
      verdictLabel: label,
    };
  });
}

export function learningSampleSize(publishedCount: number): "enough" | "short" {
  return publishedCount >= MIN_LEARNING_PUBLISHED ? "enough" : "short";
}
