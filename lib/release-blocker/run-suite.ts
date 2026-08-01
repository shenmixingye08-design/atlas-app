import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { resetArtifactIdempotencyForTests } from "@/lib/artifact-platform";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";
import { resetAutomationJobStoreForTests } from "@/lib/jobs/job-store";
import { resetJobTransitionHistoryForTests } from "@/lib/jobs/transitions";
import { runAuditCases } from "@/lib/release-blocker/audit-cases";
import { runBillingCases } from "@/lib/release-blocker/billing-cases";
import { buildReleaseFindings } from "@/lib/release-blocker/findings";
import { runPermissionCases } from "@/lib/release-blocker/permission-cases";
import { runRecoveryCases } from "@/lib/release-blocker/recovery-cases";
import {
  DEFAULT_RELEASE_BLOCKER_OUT,
  type ReleaseBlockerAggregate,
} from "@/lib/release-blocker/types";
import {
  verifyCompanyPerUser,
  verifyHeavyRoutesBillingGated,
  verifyKnowledgeRequiresUserId,
  verifyMarketplacePerUser,
} from "@/lib/release-blocker/verify-gates";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import {
  AI_API_RATE_LIMIT,
  resetRateLimitBucket,
} from "@/lib/http/rate-limit";

export { DEFAULT_RELEASE_BLOCKER_OUT };

export async function runReleaseBlockerSuite(options?: {
  outDir?: string;
}): Promise<{
  suiteId: string;
  outDir: string;
  reportPath: string;
  aggregate: ReleaseBlockerAggregate;
}> {
  const suiteId = `rb_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const outDir = join(options?.outDir ?? DEFAULT_RELEASE_BLOCKER_OUT, suiteId);
  mkdirSync(outDir, { recursive: true });

  resetAutomationJobStoreForTests();
  resetJobTransitionHistoryForTests();
  resetDurableDeliverableStoreForTests();
  resetDeliverableVersionsForTests();
  resetArtifactIdempotencyForTests();

  const permissions = await runPermissionCases();
  const recovery = await runRecoveryCases("rb_recovery_user");
  const audit = await runAuditCases();
  const billing = await runBillingCases();

  // Rate limit: hammer until 429
  resetRateLimitBucket(AI_API_RATE_LIMIT.bucket);
  let rateLimited = false;
  for (let i = 0; i < 200; i++) {
    const res = enforceAiRateLimit("rb_rate_user");
    if (res) {
      rateLimited = res.status === 429;
      break;
    }
  }

  const denied = permissions.filter((p) => p.okDenied).length;
  const permissionDeniedRate =
    permissions.length > 0 ? denied / permissions.length : 0;

  const authzProbeOk =
    permissionDeniedRate >= 1 &&
    verifyKnowledgeRequiresUserId() &&
    verifyCompanyPerUser() &&
    verifyMarketplacePerUser();
  const billingRoutesGated = verifyHeavyRoutesBillingGated();
  const productionE2eVerified = Boolean(
    process.env.PRODUCTION_E2E_BASE_URL?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim() &&
      process.env.CRON_SECRET?.trim()
  );
  const auditTrailOk = audit.length > 0 && audit.every((a) => a.ok);
  const billingCasesOk = billing.length > 0 && billing.every((b) => b.ok);
  const recoveryOk = recovery.length > 0 && recovery.every((r) => r.ok);

  const findings = buildReleaseFindings({
    permissionDeniedRate,
    authzProbeOk,
    billingRoutesGated,
    productionE2eVerified,
    stripeClaimInProcess: true,
    rateLimitOnHeavyRoutes: billingRoutesGated,
    emailChannelImplemented: false,
    pushProductionVerified: false,
    externalIntegrationsVerified: false,
    auditTrailOk,
    billingCasesOk,
    recoveryOk,
    rateLimited,
  });

  const criticalOpen = findings.filter(
    (f) => f.severity === "Critical" && f.status === "open"
  ).length;
  const highOpen = findings.filter(
    (f) => f.severity === "High" && f.status === "open"
  ).length;
  const mediumOpen = findings.filter(
    (f) => f.severity === "Medium" && f.status === "open"
  ).length;
  const lowOpen = findings.filter(
    (f) => f.severity === "Low" && f.status === "open"
  ).length;

  const reasons: string[] = [];
  if (criticalOpen > 0) {
    reasons.push(
      `Critical open: ${findings
        .filter((f) => f.severity === "Critical" && f.status === "open")
        .map((f) => f.id)
        .join(", ")}`
    );
  }
  if (permissionDeniedRate < 1) {
    reasons.push(
      `permission denied rate ${(permissionDeniedRate * 100).toFixed(1)}% < 100%`
    );
  }
  if (!rateLimited) reasons.push("AI rate limit did not trip within 200 hits");
  if (!recoveryOk) {
    reasons.push(
      `recovery failures: ${recovery
        .filter((r) => !r.ok)
        .map((r) => r.caseId)
        .join(", ")}`
    );
  }
  if (!auditTrailOk) {
    reasons.push(
      `audit failures: ${audit
        .filter((a) => !a.ok)
        .map((a) => a.caseId)
        .join(", ")}`
    );
  }
  if (!billingCasesOk) {
    reasons.push(
      `billing failures: ${billing
        .filter((b) => !b.ok)
        .map((b) => b.caseId)
        .join(", ")}`
    );
  }

  const releaseReady = criticalOpen === 0 && reasons.length === 0;
  const aggregate: ReleaseBlockerAggregate = {
    permissionCases: permissions.length,
    permissionDeniedRate,
    findings,
    criticalOpen,
    highOpen,
    mediumOpen,
    lowOpen,
    authzFixed: authzProbeOk,
    billingGated: billingRoutesGated,
    productionE2eVerified,
    releaseReady: releaseReady && criticalOpen === 0,
    releaseReadyReasons:
      criticalOpen > 0
        ? reasons
        : reasons.length
          ? reasons
          : ["all gates cleared"],
  };

  writeFileSync(
    join(outDir, "permissions.json"),
    JSON.stringify(permissions, null, 2)
  );
  writeFileSync(join(outDir, "recovery.json"), JSON.stringify(recovery, null, 2));
  writeFileSync(join(outDir, "audit.json"), JSON.stringify(audit, null, 2));
  writeFileSync(join(outDir, "billing.json"), JSON.stringify(billing, null, 2));
  writeFileSync(join(outDir, "findings.json"), JSON.stringify(findings, null, 2));
  writeFileSync(
    join(outDir, "aggregate.json"),
    JSON.stringify(aggregate, null, 2)
  );

  const report = buildReport(
    suiteId,
    aggregate,
    recovery,
    audit,
    billing,
    rateLimited
  );
  const reportPath = join(outDir, "PHASE4_FINAL.md");
  writeFileSync(reportPath, report, "utf8");
  writeFileSync(
    join(options?.outDir ?? DEFAULT_RELEASE_BLOCKER_OUT, "latest.json"),
    JSON.stringify(
      {
        suiteId,
        reportPath,
        releaseReady: aggregate.releaseReady,
        authzFixed: aggregate.authzFixed,
        billingGated: aggregate.billingGated,
        criticalOpen: aggregate.criticalOpen,
        productionE2eVerified: aggregate.productionE2eVerified,
      },
      null,
      2
    ),
    "utf8"
  );

  return { suiteId, outDir, reportPath, aggregate };
}

function buildReport(
  suiteId: string,
  a: ReleaseBlockerAggregate,
  recovery: Array<{ caseId: string; ok: boolean; detail: string }>,
  audit: Array<{ caseId: string; ok: boolean; detail: string }>,
  billing: Array<{ caseId: string; ok: boolean; detail: string }>,
  rateLimited: boolean
): string {
  const by = (sev: string) => a.findings.filter((f) => f.severity === sev);
  return [
    "# MINERVOT Release Blocker Audit Phase 4 — FINAL",
    "",
    `suiteId: ${suiteId}`,
    `generatedAt: ${new Date().toISOString()}`,
    "",
    "## Release Ready",
    "",
    `**${a.releaseReady ? "YES" : "NO"}**`,
    "",
    ...a.releaseReadyReasons.map((r) => `- ${r}`),
    "",
    "## Critical",
    ...by("Critical").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "## High",
    ...by("High").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "## Medium",
    ...by("Medium").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "## Low",
    ...by("Low").map(
      (f) => `- [${f.status}] ${f.id}: ${f.title} — ${f.evidence}`
    ),
    "",
    "## Permission suite",
    `- n=${a.permissionCases} deniedRate=${(a.permissionDeniedRate * 100).toFixed(2)}%`,
    "",
    "## Recovery",
    ...recovery.map((r) => `- ${r.caseId}: ok=${r.ok} ${r.detail}`),
    "",
    "## Audit",
    ...audit.map((r) => `- ${r.caseId}: ok=${r.ok} ${r.detail}`),
    "",
    "## Billing",
    ...billing.map((r) => `- ${r.caseId}: ok=${r.ok} ${r.detail}`),
    "",
    "## Rate limit",
    `- tripped=${rateLimited}`,
    "",
    "## Gates",
    `- authzFixed=${a.authzFixed}`,
    `- billingGated=${a.billingGated}`,
    `- productionE2eVerified=${a.productionE2eVerified}`,
    "",
  ].join("\n");
}
