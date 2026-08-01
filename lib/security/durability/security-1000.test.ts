/**
 * Security / Permission / Billing durability — 1000 cases (mocked, no live Stripe/Clerk).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import {
  listSecurityAuditRecords,
  resetSecurityAuditForTests,
  summarizeSecurityAudit,
} from "@/lib/security/audit/security-audit";
import { assertArtifactAccess } from "@/lib/security/artifact/access";
import {
  assertCsrfForMutation,
  createCsrfToken,
  verifyCsrfToken,
} from "@/lib/security/api/csrf";
import {
  assertNotReplay,
  buildReplayKey,
  markReplaySeen,
  resetReplayGuardForTests,
} from "@/lib/security/api/replay";
import {
  buildPrincipal,
  evaluatePermission,
} from "@/lib/security/permissions/evaluate";
import {
  assertCheckoutNotDuplicate,
  validateCheckoutPayload,
} from "@/lib/security/billing/billing-security";
import { redactSecrets, sanitizeLogObject } from "@/lib/security/secrets/redact";
import type { SecurityResourceKind } from "@/lib/security/types";

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    email === "owner@atlas.test",
}));

vi.mock("@/lib/billing/access/snapshot", () => ({
  getBillingAccessSnapshot: vi.fn(async (userId: string) => ({
    userId,
    email: userId.startsWith("owner") ? "owner@atlas.test" : "user@atlas.test",
    isOwner: userId.startsWith("owner"),
    isBetaUser: false,
    subscribedPlanId: userId.includes("premium") ? "premium" : "free",
    subscribedPlanName: userId.includes("premium") ? "Premium" : "Free",
    effectivePlanId: userId.includes("premium") ? "premium" : "free",
    effectivePlanName: userId.includes("premium") ? "Premium" : "Free",
    status: userId.includes("premium") ? "active" : "canceled",
    isTrialing: false,
    isPaidCapable: userId.includes("premium"),
    isPaymentPastDue: false,
    isCancelAtPeriodEnd: false,
    automationsSuspended: false,
  })),
}));

const TOTAL = Number(process.env.SECURITY_DURABILITY_RUNS ?? 1000);

describe("security production durability 1000", () => {
  beforeEach(() => {
    resetSecurityAuditForTests();
    resetReplayGuardForTests();
    process.env.CSRF_SECRET = "durability-csrf-secret";
  });

  afterEach(() => {
    resetSecurityAuditForTests();
    resetReplayGuardForTests();
  });

  it(
    `evaluates ${TOTAL} permission/billing/security cases with zero false allows`,
    async () => {
      const { assertDeliverableQuota } = await import(
        "@/lib/security/billing/free-user-controls"
      );

      let permissionOk = 0;
      let billingOk = 0;
      let securityOk = 0;
      let falseAllow = 0;
      let falseDeny = 0;
      const falseAllowByBucket = [0, 0, 0, 0, 0];

      const resources: SecurityResourceKind[] = [
        "user",
        "organization",
        "workspace",
        "artifact",
        "revision",
        "notification",
        "job",
        "integration",
        "billing",
        "admin",
        "owner",
        "role",
        "scope",
      ];

      for (let i = 1; i <= TOTAL; i += 1) {
        const bucket = i % 5;

        if (bucket === 0) {
          // Permission: cross-tenant must deny
          const principal = buildPrincipal({
            userId: `user_${i}`,
            email: "user@atlas.test",
          });
          const resource = resources[i % resources.length] ?? "artifact";
          const cross = evaluatePermission({
            principal,
            resource,
            action: "read",
            resourceOwnerUserId: `other_${i}`,
          });
          const self = evaluatePermission({
            principal,
            resource: resource === "owner" || resource === "admin" ? "artifact" : resource,
            action: "read",
            resourceOwnerUserId: `user_${i}`,
          });

          if (resource === "owner" || resource === "admin") {
            if (cross.allowed) {
              falseAllow += 1;
              falseAllowByBucket[0] += 1;
            } else permissionOk += 1;
          } else if (cross.allowed) {
            falseAllow += 1;
            falseAllowByBucket[0] += 1;
          } else if (!self.allowed) {
            falseDeny += 1;
          } else {
            permissionOk += 1;
          }

          // Owner may access admin
          const owner = buildPrincipal({
            userId: "owner_1",
            email: "owner@atlas.test",
          });
          const ownerAdmin = evaluatePermission({
            principal: owner,
            resource: "admin",
            action: "admin",
          });
          if (!ownerAdmin.allowed) falseDeny += 1;
          else permissionOk += 1;
        } else if (bucket === 1) {
          // Artifact security
          const denied = assertArtifactAccess({
            actorUserId: `attacker_${i}`,
            actorEmail: "user@atlas.test",
            artifactOwnerUserId: `victim_${i}`,
            op: "download",
            artifactId: `art_${i}`,
          });
          const allowed = assertArtifactAccess({
            actorUserId: `owner_${i}`,
            actorEmail: "user@atlas.test",
            artifactOwnerUserId: `owner_${i}`,
            op: "preview",
            artifactId: `art_${i}`,
          });
          const expired = assertArtifactAccess({
            actorUserId: `owner_${i}`,
            actorEmail: "user@atlas.test",
            artifactOwnerUserId: `owner_${i}`,
            op: "signed_url",
            signedUrlExpiresAtMs: Date.now() - 1_000,
            artifactId: `art_${i}`,
          });
          const guessable = assertArtifactAccess({
            actorUserId: `owner_${i}`,
            actorEmail: "user@atlas.test",
            artifactOwnerUserId: `owner_${i}`,
            op: "download",
            artifactId: "test",
          });
          const share = assertArtifactAccess({
            actorUserId: `owner_${i}`,
            actorEmail: "user@atlas.test",
            artifactOwnerUserId: `owner_${i}`,
            op: "share",
            artifactId: `art_${i}`,
          });

          if (denied.allowed || expired.allowed || guessable.allowed || share.allowed) {
            falseAllow += 1;
            falseAllowByBucket[1] += 1;
          } else if (!allowed.allowed) {
            falseDeny += 1;
          } else {
            securityOk += 1;
          }
        } else if (bucket === 2) {
          // Billing validation + duplicate checkout
          const badFree = validateCheckoutPayload({ planId: "free" });
          const badPlan = validateCheckoutPayload({ planId: "enterprise" });
          const good = validateCheckoutPayload({ planId: "standard" });
          const first = assertCheckoutNotDuplicate({
            userId: `bill_${i}`,
            planId: "standard",
          });
          const second = assertCheckoutNotDuplicate({
            userId: `bill_${i}`,
            planId: "standard",
          });

          if (badFree.ok || badPlan.ok || !good.ok || !first.ok || second.ok) {
            falseAllow += 1;
            falseAllowByBucket[2] += 1;
          } else {
            billingOk += 1;
          }

          // Free user paid image-generation feature denied
          const imageQuota = await assertDeliverableQuota({
            userId: `free_${i}`,
            kind: "image",
            requirePaidImageFeature: true,
          });
          if (imageQuota.allowed) {
            falseAllow += 1;
            falseAllowByBucket[2] += 1;
          } else billingOk += 1;
        } else if (bucket === 3) {
          // CSRF + JWT/secret redaction
          const token = createCsrfToken(`user_${i}`);
          if (!verifyCsrfToken(`user_${i}`, token)) falseDeny += 1;
          if (verifyCsrfToken(`user_${i}`, "forged")) {
            falseAllow += 1;
            falseAllowByBucket[3] += 1;
          }

          const req = new Request("https://app.example.com/api/x", {
            method: "POST",
            headers: {
              origin: "https://evil.example",
              "x-atlas-csrf": "bad",
            },
          });
          const csrf = assertCsrfForMutation({
            request: req,
            userId: `user_${i}`,
            requireHeaderInProduction: true,
          });
          // Force production-like check by requiring header when origin mismatches
          if (csrf.ok) {
            falseAllow += 1;
            falseAllowByBucket[3] += 1;
          } else securityOk += 1;

          const redacted = redactSecrets(
            "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.aaa.bbb sk_live_abc123",
          );
          const cleaned = sanitizeLogObject({
            api_key: "secret",
            userId: `user_${i}`,
          });
          if (
            redacted?.includes("sk_live") ||
            redacted?.includes("eyJ") ||
            cleaned.api_key !== "[REDACTED]"
          ) {
            falseAllow += 1;
            falseAllowByBucket[3] += 1;
          } else {
            securityOk += 1;
          }
        } else {
          // Rate-limit style replay + org mismatch
          const key = buildReplayKey({
            userId: `replay_${i}`,
            method: "POST",
            path: "/api/billing/checkout",
            idempotencyKey: `idem_${i}`,
          });
          expect(assertNotReplay({ key }).ok).toBe(true);
          markReplaySeen(key);
          if (assertNotReplay({ key }).ok) {
            falseAllow += 1;
            falseAllowByBucket[4] += 1;
          } else securityOk += 1;

          const orgDeny = evaluatePermission({
            principal: buildPrincipal({
              userId: `user_${i}`,
              email: "user@atlas.test",
              organizationId: "org_a",
            }),
            resource: "organization",
            action: "read",
            resourceOwnerUserId: `user_${i}`,
            resourceOrganizationId: "org_b",
          });
          if (orgDeny.allowed) {
            falseAllow += 1;
            falseAllowByBucket[4] += 1;
          } else permissionOk += 1;
        }
      }

      const audits = listSecurityAuditRecords({ limit: 20_000 });
      const summary = summarizeSecurityAudit(audits);

      const report = {
        generatedAt: new Date().toISOString(),
        totalCases: TOTAL,
        permissionOk,
        billingOk,
        securityOk,
        falseAllow,
        falseDeny,
        falseAllowRate: falseAllow / TOTAL,
        falseDenyRate: falseDeny / TOTAL,
        permissionSuccessRate: permissionOk / Math.max(1, Math.floor(TOTAL / 5) * 2),
        billingSuccessRate: billingOk / Math.max(1, Math.floor(TOTAL / 5) * 2),
        securitySuccessRate: securityOk / Math.max(1, Math.floor(TOTAL / 5) * 2),
        auditSummary: summary,
      };

      const outDir = "/opt/cursor/artifacts";
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, "security-billing-1000-report.json"),
        JSON.stringify(report, null, 2),
        "utf8",
      );

      expect(TOTAL).toBeGreaterThanOrEqual(1000);
      expect(falseAllow).toBe(0);
      expect(falseDeny).toBe(0);
      expect(permissionOk).toBeGreaterThan(0);
      expect(billingOk).toBeGreaterThan(0);
      expect(securityOk).toBeGreaterThan(0);
    },
    180_000,
  );
});
