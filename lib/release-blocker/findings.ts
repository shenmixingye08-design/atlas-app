import type { ReleaseFinding } from "@/lib/release-blocker/types";

/**
 * Release Blocker findings. Critical never downgraded.
 * status fixed only when code+tests prove isolation/gating.
 */
export function buildReleaseFindings(input: {
  permissionDeniedRate: number;
  authzProbeOk: boolean;
  billingRoutesGated: boolean;
  productionE2eVerified: boolean;
  stripeClaimInProcess: boolean;
  rateLimitOnHeavyRoutes: boolean;
  emailChannelImplemented: boolean;
  pushProductionVerified: boolean;
  externalIntegrationsVerified: boolean;
  auditTrailOk: boolean;
  billingCasesOk: boolean;
  recoveryOk: boolean;
  rateLimited: boolean;
}): ReleaseFinding[] {
  const findings: ReleaseFinding[] = [];

  findings.push({
    id: "authz_global_knowledge_company",
    severity: "Critical",
    title: "Knowledge/Company/Marketplace cross-tenant isolation",
    area: "authz",
    evidence: input.authzProbeOk
      ? "Tenant-scoped knowledge + per-user company/marketplace; permission suite passed"
      : "Cross-tenant leak still detectable",
    status: input.authzProbeOk ? "fixed" : "open",
    blocksRelease: !input.authzProbeOk,
    remediation: "Keep userId required on knowledge/company/marketplace APIs",
  });

  findings.push({
    id: "billing_gap_heavy_routes",
    severity: "Critical",
    title: "Heavy AI routes billing gate",
    area: "billing",
    evidence: input.billingRoutesGated
      ? "Vision/PPTX/Excel/convert call requireBillingAiUsage + rate limit"
      : "Heavy routes still ungated",
    status: input.billingRoutesGated ? "fixed" : "open",
    blocksRelease: !input.billingRoutesGated,
  });

  findings.push({
    id: "production_e2e_unverified",
    severity: "Critical",
    title: "Production E2E unverified",
    area: "sre",
    evidence: input.productionE2eVerified
      ? "PRODUCTION_E2E verified"
      : "PRODUCTION_E2E_BASE_URL/Clerk/Supabase secrets missing in agent",
    status: input.productionE2eVerified ? "fixed" : "open",
    blocksRelease: !input.productionE2eVerified,
  });

  findings.push({
    id: "stripe_webhook_race",
    severity: "High",
    title: "Stripe webhook multi-instance race",
    area: "billing",
    evidence: input.stripeClaimInProcess
      ? "In-process claim+in-flight set added; durable CAS claim row still recommended"
      : "No claim",
    status: "mitigated",
    blocksRelease: false,
    remediation: "Add Supabase INSERT claim with unique event_id before handler",
  });

  findings.push({
    id: "rate_limit_memory_only",
    severity: "High",
    title: "Rate limit is process-local",
    area: "abuse",
    evidence: input.rateLimitOnHeavyRoutes
      ? "Heavy routes call enforceAiRateLimit (in-memory)"
      : "Heavy routes ungated",
    status: input.rateLimitOnHeavyRoutes ? "mitigated" : "open",
    blocksRelease: false,
    remediation: "Durable Redis/Upstash rate limit for multi-instance",
  });

  findings.push({
    id: "work_job_reclaim_cas",
    severity: "High",
    title: "Work job stale reclaim lacks CAS",
    area: "reliability",
    evidence: "executeWorkJob reclaim is read-modify-write",
    status: "open",
    blocksRelease: false,
    remediation: "Compare-and-swap lease on durable work jobs",
  });

  findings.push({
    id: "refund_entitlement",
    severity: "High",
    title: "Refund does not auto-downgrade plan",
    area: "billing",
    evidence: "charge.refunded history-only path",
    status: "open",
    blocksRelease: false,
  });

  findings.push({
    id: "billing_suite_gaps",
    severity: "High",
    title: "Billing case suite incomplete",
    area: "billing",
    evidence: input.billingCasesOk
      ? "Quota/cancel/webhook/gates cases passed"
      : "One or more billing cases failed",
    status: input.billingCasesOk ? "fixed" : "open",
    blocksRelease: false,
  });

  findings.push({
    id: "email_notification_missing",
    severity: "Medium",
    title: "Email notification channel unimplemented",
    area: "notifications",
    evidence: input.emailChannelImplemented ? "implemented" : "no email channel",
    status: input.emailChannelImplemented ? "fixed" : "open",
    blocksRelease: false,
  });

  findings.push({
    id: "soft_delete_storage_orphan",
    severity: "Medium",
    title: "Soft-delete may leave storage objects",
    area: "storage",
    evidence: "softDeleteArtifact marks deletedAt; purge job incomplete",
    status: "open",
    blocksRelease: false,
  });

  findings.push({
    id: "push_production_unverified",
    severity: "Medium",
    title: "Web Push production device unverified",
    area: "notifications",
    evidence: input.pushProductionVerified ? "verified" : "VAPID/device unproven",
    status: input.pushProductionVerified ? "fixed" : "open",
    blocksRelease: false,
  });

  findings.push({
    id: "external_integrations_unverified",
    severity: "Medium",
    title: "External integrations E2E unverified",
    area: "integrations",
    evidence: input.externalIntegrationsVerified
      ? "verified"
      : "X/Gmail/Calendar/WP/Dropbox not connected in agent",
    status: input.externalIntegrationsVerified ? "fixed" : "open",
    blocksRelease: false,
  });

  findings.push({
    id: "recovery_suite",
    severity: "Medium",
    title: "Fault recovery suite",
    area: "reliability",
    evidence: input.recoveryOk
      ? "Job/storage/stripe/notify/worker recovery cases passed"
      : "Recovery case failure",
    status: input.recoveryOk ? "fixed" : "open",
    blocksRelease: false,
  });

  findings.push({
    id: "audit_trail",
    severity: "Medium",
    title: "Audit trail correlation fields",
    area: "audit",
    evidence: input.auditTrailOk
      ? "who/when/what/result/retry/IP/requestId/jobId/artifactId + redaction"
      : "Audit trail incomplete",
    status: input.auditTrailOk ? "fixed" : "open",
    blocksRelease: false,
  });

  findings.push({
    id: "permission_suite",
    severity: "Low",
    title: "Cross-tenant permission suite coverage",
    area: "authz",
    evidence: `deniedRate=${(input.permissionDeniedRate * 100).toFixed(1)}% rateLimited=${input.rateLimited}`,
    status:
      input.permissionDeniedRate >= 1 && input.rateLimited ? "fixed" : "open",
    blocksRelease: input.permissionDeniedRate < 1,
  });

  return findings;
}
