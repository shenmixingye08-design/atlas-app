/**
 * Phase 3-1 — Integration risk register (P0 / P1 / P2).
 */

import type { IntegrationRisk } from "./types";

export const INTEGRATION_RISK_REGISTER: readonly IntegrationRisk[] = [
  {
    id: "P0-DROPBOX-MEMORY-TOKENS",
    severity: "P0",
    serviceId: "dropbox",
    title: "Dropbox tokens are process-memory only",
    evidence: [
      "lib/integrations/dropbox/oauth-service.ts",
      "lib/integrations/external-services/durable.ts SUPABASE_BACKED_SERVICE_IDS excludes dropbox",
    ],
    impact: "Cold start loses connection; production reliability broken",
    recommendedPhase: "3-2",
  },
  {
    id: "P0-GOOGLE-PLAINTEXT-TOKENS",
    severity: "P0",
    serviceId: "google_drive",
    title: "Google OAuth tokens stored plaintext in Supabase",
    evidence: [
      "supabase/migrations/20260713_atlas_google_oauth_credentials.sql",
      "lib/integrations/google/credential-persistence.ts",
    ],
    impact: "DB compromise exposes access + refresh tokens",
    recommendedPhase: "3-2",
  },
  {
    id: "P0-X-PLAINTEXT-TOKENS",
    severity: "P0",
    serviceId: "x",
    title: "X OAuth tokens stored plaintext in Supabase",
    evidence: [
      "supabase/migrations/20260713_atlas_x_oauth_credentials.sql",
      "lib/integrations/x/credential-persistence.ts",
    ],
    impact: "DB compromise enables unauthorized posting",
    recommendedPhase: "later",
  },
  {
    id: "P0-LEGACY-CONNECT-FAKE-SUCCESS",
    severity: "P0",
    serviceId: "cross_cutting",
    title: "Legacy IntegrationService.connect marks providers connected without OAuth",
    evidence: ["lib/integrations/integration-service.ts"],
    impact: "UI shows connected for Slack/Discord/Notion/etc without credentials",
    recommendedPhase: "3-2",
  },
  {
    id: "P0-STUB-CONNECT-NOTION-YOUTUBE",
    severity: "P0",
    serviceId: "notion",
    title: "stubConnectService returns connected for Notion/YouTube",
    evidence: [
      "lib/integrations/connector-types.ts",
      "lib/integrations/notion/index.ts",
      "lib/integrations/youtube/index.ts",
    ],
    impact: "Mock/stub success path available in production code paths",
    recommendedPhase: "3-2",
  },
  {
    id: "P0-LEGACY-OWNER-ISOLATION",
    severity: "P0",
    serviceId: "cross_cutting",
    title: "Legacy /api/integrations repositories lack per-user owner isolation",
    evidence: [
      "lib/integrations/repositories/server-integration-repository.ts",
      "lib/integrations/repositories/server-credential-repository.ts",
      "app/api/integrations/route.ts",
    ],
    impact: "Authenticated users can share/see global legacy integration state",
    recommendedPhase: "3-2",
  },
  {
    id: "P0-V2-EXTERNAL-UNWIRED",
    severity: "P0",
    serviceId: "cross_cutting",
    title: "V2 external adapters registered but not wired (not a false success)",
    evidence: [
      "lib/automation-platform/execution/production-step-registry.ts isLiveAdapterWired",
      "lib/automation-platform/execution/strict-step-invoker.ts invokeExternalGate",
    ],
    impact:
      "Automation cannot complete external work via V2; activation fail-closed (correct) but no Production Live V2 path",
    recommendedPhase: "3-2",
  },
  {
    id: "P0-WORDPRESS-DUPLICATE-POST",
    severity: "P0",
    serviceId: "wordpress",
    title: "WordPress POST retry can double-create posts",
    evidence: ["lib/integrations/wordpress/api-client.ts"],
    impact: "Retry after lost response creates duplicate posts",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-RETRY-CLASSIFICATION",
    severity: "P1",
    serviceId: "cross_cutting",
    title: "Generic withRetry retries all errors including 401/403 unless caller filters",
    evidence: [
      "lib/integrations/retry.ts",
      "lib/automation-platform/execution/retry-policy.ts",
    ],
    impact: "Non-retryable auth/scope failures may be retried on some paths",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-SCOPE-DIAGNOSTICS",
    severity: "P1",
    serviceId: "gmail",
    title: "Insufficient missing-scope diagnostics before external execution",
    evidence: ["lib/integrations/google/scopes.ts"],
    impact: "Users see generic failures instead of reconnect/scope guidance",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-EVIDENCE-ADAPTER-MODE",
    severity: "P1",
    serviceId: "cross_cutting",
    title: "Completion Evidence lacks adapter mode / environment fields",
    evidence: [
      "lib/automation-platform/execution/completion-evidence-v2.ts",
    ],
    impact: "Harder to prove sandbox results cannot mix into production evidence",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-NOTIFY-DETAIL",
    severity: "P1",
    serviceId: "cross_cutting",
    title: "Run notifications lack provider URL / externalActionId in copy",
    evidence: ["lib/automation-platform/execution/notify.ts"],
    impact: "Users only see completed/failed titles without destination proof",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-CALENDAR-IDEMPOTENCY",
    severity: "P1",
    serviceId: "google_calendar",
    title: "Calendar Meet requestId uses Date.now()",
    evidence: ["lib/integrations/google/calendar/api-client.ts"],
    impact: "Retry creates duplicate events",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-DROPBOX-AUTORENAME",
    severity: "P1",
    serviceId: "dropbox",
    title: "Dropbox upload autorename creates duplicates on retry",
    evidence: ["lib/integrations/dropbox/api-client.ts"],
    impact: "Same occurrence can produce multiple files",
    recommendedPhase: "3-2",
  },
  {
    id: "P1-OFFLINE-NOTIFY-FLAG",
    severity: "P1",
    serviceId: "push_notification",
    title: "ATLAS_WORK_QUEUE_OFFLINE_NOTIFY=1 can invent local notify receipts",
    evidence: ["lib/work-queue/steps/execute-step.ts"],
    impact: "If mis-set in production, notify evidence is local-only",
    recommendedPhase: "ops",
  },
  {
    id: "P2-UI-CAPABILITY-OVERSTATEMENT",
    severity: "P2",
    serviceId: "cross_cutting",
    title: "UI catalogs advertise Slack/Discord/Notion/Webhook without live adapters",
    evidence: [
      "lib/integrations/registry.ts",
      "lib/connectors/definitions.ts",
    ],
    impact: "Expectation mismatch; not execution false-success by itself",
    recommendedPhase: "later",
  },
  {
    id: "P2-DASHBOARD-SUCCESS-RATE",
    severity: "P2",
    serviceId: "cross_cutting",
    title: "No per-provider external success-rate dashboard",
    evidence: ["components/integrations/integrations-dashboard.tsx"],
    impact: "Ops visibility gap",
    recommendedPhase: "later",
  },
  {
    id: "P2-TENANT-ISOLATION",
    severity: "P2",
    serviceId: "cross_cutting",
    title: "No organizationId tenant isolation on OAuth credentials",
    evidence: [
      "atlas_google_oauth_credentials",
      "atlas_x_oauth_credentials",
      "atlas_wordpress_credentials",
    ],
    impact: "Multi-tenant org sharing unsupported",
    recommendedPhase: "later",
  },
] as const;

export function risksBySeverity(
  severity: IntegrationRisk["severity"],
): IntegrationRisk[] {
  return INTEGRATION_RISK_REGISTER.filter((risk) => risk.severity === severity);
}
