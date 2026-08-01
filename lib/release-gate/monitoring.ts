/**
 * Phase 7 — alert catalog (thresholds). Wiring to PagerDuty/Slack is ops config;
 * this module defines what must be watched and severity.
 */

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type AlertDefinition = {
  id: string;
  category: "system" | "ai" | "artifact" | "storage" | "notify" | "external" | "billing";
  metric: string;
  condition: string;
  severity: AlertSeverity;
  notifyWithin: string;
  sourceHint: string;
};

export const RELEASE_GATE_ALERTS: AlertDefinition[] = [
  {
    id: "api_error_rate",
    category: "system",
    metric: "API error rate",
    condition: "5xx rate > 5% for 5m",
    severity: "critical",
    notifyWithin: "immediate",
    sourceHint: "ops_events / hosting metrics",
  },
  {
    id: "p95_latency",
    category: "system",
    metric: "p95 latency",
    condition: "p95 > 8s for API routes (5m)",
    severity: "high",
    notifyWithin: "15m",
    sourceHint: "hosting / custom spans",
  },
  {
    id: "stuck_jobs",
    category: "system",
    metric: "stuck jobs",
    condition: "running > 30m without heartbeat",
    severity: "critical",
    notifyWithin: "immediate",
    sourceHint: "lib/jobs + ops dashboard",
  },
  {
    id: "openai_error",
    category: "ai",
    metric: "OpenAI error rate",
    condition: "errors > 10% or 429 burst",
    severity: "critical",
    notifyWithin: "immediate",
    sourceHint: "ai cost / provider logs",
  },
  {
    id: "vision_success",
    category: "ai",
    metric: "Vision success rate",
    condition: "success < 0.85 (n≥20, rolling 24h)",
    severity: "high",
    notifyWithin: "15m",
    sourceHint: "vision evidence + ops_events",
  },
  {
    id: "artifact_corrupt",
    category: "artifact",
    metric: "corrupt / 0-byte rate",
    condition: "any corrupt download in 1h",
    severity: "critical",
    notifyWithin: "immediate",
    sourceHint: "artifact durability harness",
  },
  {
    id: "storage_upload_fail",
    category: "storage",
    metric: "upload failure rate",
    condition: "> 2% for 15m",
    severity: "high",
    notifyWithin: "15m",
    sourceHint: "storage ops",
  },
  {
    id: "push_fail",
    category: "notify",
    metric: "Push success rate",
    condition: "< 0.95 when push enabled (n≥10)",
    severity: "high",
    notifyWithin: "15m",
    sourceHint: "notification evidence",
  },
  {
    id: "external_duplicate",
    category: "external",
    metric: "duplicate external action",
    condition: "any duplicate post/send detected",
    severity: "critical",
    notifyWithin: "immediate",
    sourceHint: "external_actions audit",
  },
  {
    id: "stripe_webhook_fail",
    category: "billing",
    metric: "Webhook failure / double process",
    condition: "any unverified or double claim",
    severity: "critical",
    notifyWithin: "immediate",
    sourceHint: "stripe webhook + billing_events",
  },
  {
    id: "plan_quota_drift",
    category: "billing",
    metric: "plan/quota inconsistency",
    condition: "entitlement vs Stripe mismatch",
    severity: "high",
    notifyWithin: "15m",
    sourceHint: "billing reconcile job",
  },
];

export function alertSla(severity: AlertSeverity): string {
  switch (severity) {
    case "critical":
      return "即時通知";
    case "high":
      return "15分以内";
    case "medium":
      return "営業時間内";
    case "low":
      return "定期レポート";
  }
}
