import type { ActivationEventName, ActivationEventPayload } from "./types";

export type ActivationFunnelRange = {
  from: string;
  to: string;
};

export type ActivationFunnelResult = {
  range: ActivationFunnelRange;
  registered: number;
  onboardingStartedRate: number;
  goalSelectedRate: number;
  firstRequestSubmittedRate: number;
  firstRequestCompletedRate: number;
  firstResultViewedRate: number;
  firstAutomationCreatedRate: number;
  firstAutomationSuccessRate: number;
  integrationSuccessRate: number;
  paywallViewedRate: number;
  checkoutStartedRate: number;
  paidRate: number;
  timeToFirstValue: {
    signupToFirstRequestMs: number | null;
    signupToFirstCompletedMs: number | null;
    signupToFirstViewedMs: number | null;
    signupToFirstAutomationSuccessMs: number | null;
    signupToPaidMs: number | null;
  };
  dropOffStep: string | null;
  errorsByStep: Array<{ step: string; reason: string; count: number }>;
  sampleUsers: number;
  note: string;
};

function usersWith(
  events: ActivationEventPayload[],
  name: ActivationEventName,
): Set<string> {
  return new Set(
    events.filter((event) => event.event === name).map((event) => event.userId),
  );
}

function rate(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number((part / total).toFixed(4));
}

function medianMs(
  events: ActivationEventPayload[],
  start: ActivationEventName,
  end: ActivationEventName,
): number | null {
  const byUser = new Map<string, { start?: number; end?: number }>();
  for (const event of events) {
    const row = byUser.get(event.userId) ?? {};
    const at = Date.parse(event.occurredAt);
    if (!Number.isFinite(at)) continue;
    if (event.event === start && row.start === undefined) row.start = at;
    if (event.event === end && row.end === undefined) row.end = at;
    byUser.set(event.userId, row);
  }
  const deltas = [...byUser.values()]
    .filter((row) => row.start !== undefined && row.end !== undefined)
    .map((row) => (row.end as number) - (row.start as number))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  if (deltas.length === 0) return null;
  return deltas[Math.floor(deltas.length / 2)] ?? null;
}

export function buildActivationFunnel(
  events: ActivationEventPayload[],
  range: ActivationFunnelRange,
): ActivationFunnelResult {
  const inRange = events.filter((event) => {
    return event.occurredAt >= range.from && event.occurredAt <= range.to;
  });
  const registered = usersWith(inRange, "sign_up_completed");
  const started = usersWith(inRange, "onboarding_started");
  const goals = usersWith(inRange, "goal_selected");
  const submitted = usersWith(inRange, "first_request_submitted");
  const completed = usersWith(inRange, "first_request_completed");
  const viewed = usersWith(inRange, "first_result_viewed");
  const automationCreated = usersWith(inRange, "first_automation_created");
  const automationOk = usersWith(inRange, "first_automation_run_completed");
  const connected = usersWith(inRange, "integration_connected");
  const startedIntegration = usersWith(inRange, "integration_started");
  const paywall = usersWith(inRange, "paywall_viewed");
  const checkout = usersWith(inRange, "checkout_started");
  const paid = usersWith(inRange, "subscription_activated");
  const failed = inRange.filter(
    (event) => event.event === "integration_failed" || event.success === false,
  );

  const steps: Array<[string, number]> = [
    ["sign_up_completed", registered.size],
    ["onboarding_started", started.size],
    ["goal_selected", goals.size],
    ["first_request_submitted", submitted.size],
    ["first_result_viewed", viewed.size],
  ];
  let dropOffStep: string | null = null;
  let largestDrop = 0;
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1]![1];
    const curr = steps[i]![1];
    const drop = prev - curr;
    if (drop > largestDrop) {
      largestDrop = drop;
      dropOffStep = steps[i]![0];
    }
  }

  const errorMap = new Map<string, number>();
  for (const event of failed) {
    const key = `${event.event}:${event.diagnosticId ?? "unknown"}`;
    errorMap.set(key, (errorMap.get(key) ?? 0) + 1);
  }

  const total = registered.size;
  return {
    range,
    registered: total,
    onboardingStartedRate: rate(started.size, total),
    goalSelectedRate: rate(goals.size, total),
    firstRequestSubmittedRate: rate(submitted.size, total),
    firstRequestCompletedRate: rate(completed.size, total),
    firstResultViewedRate: rate(viewed.size, total),
    firstAutomationCreatedRate: rate(automationCreated.size, total),
    firstAutomationSuccessRate: rate(automationOk.size, total),
    integrationSuccessRate: rate(
      connected.size,
      Math.max(startedIntegration.size, connected.size, 1),
    ),
    paywallViewedRate: rate(paywall.size, total),
    checkoutStartedRate: rate(checkout.size, total),
    paidRate: rate(paid.size, total),
    timeToFirstValue: {
      signupToFirstRequestMs: medianMs(
        inRange,
        "sign_up_completed",
        "first_request_submitted",
      ),
      signupToFirstCompletedMs: medianMs(
        inRange,
        "sign_up_completed",
        "first_request_completed",
      ),
      signupToFirstViewedMs: medianMs(
        inRange,
        "sign_up_completed",
        "first_result_viewed",
      ),
      signupToFirstAutomationSuccessMs: medianMs(
        inRange,
        "sign_up_completed",
        "first_automation_run_completed",
      ),
      signupToPaidMs: medianMs(
        inRange,
        "sign_up_completed",
        "subscription_activated",
      ),
    },
    dropOffStep,
    errorsByStep: [...errorMap.entries()]
      .map(([key, count]) => {
        const [step, reason] = key.split(":");
        return { step: step ?? key, reason: reason ?? "unknown", count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    sampleUsers: total,
    note: "少人数では傾向のみです。因果は断定しません。",
  };
}
