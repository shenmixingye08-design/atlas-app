/**
 * Phase 3-1 — Build serializable audit snapshot for CI artifacts.
 */

import { AUTOMATION_PATH_TRACES } from "./automation-path";
import {
  productionLiveExternalExists,
  productionSandboxFallbackExists,
  v2ExternalAdaptersWired,
} from "./diagnostics";
import { FAIL_CLOSED_MATRIX } from "./fail-closed-matrix";
import { EXTERNAL_SERVICE_INVENTORY } from "./inventory";
import { OAUTH_SECURITY_AUDIT } from "./oauth-audit";
import {
  adoptedPhase32Targets,
  PHASE_32_TARGETS,
  rejectedPhase32Targets,
} from "./phase32-targets";
import { REGISTRY_AUDIT } from "./registry-audit";
import {
  INTEGRATION_RISK_REGISTER,
  risksBySeverity,
} from "./risk-register";
import {
  listPlaintextOrMemoryTokenStores,
  TOKEN_STORAGE_AUDIT,
} from "./token-storage-audit";
import type { ExternalAdapterAuditSnapshot } from "./types";

export function buildExternalAdapterAuditSnapshot(
  auditedAt: string = new Date().toISOString(),
): ExternalAdapterAuditSnapshot {
  return {
    auditedAt,
    phase: "3-1",
    inventory: [...EXTERNAL_SERVICE_INVENTORY],
    registries: [...REGISTRY_AUDIT],
    oauth: [...OAUTH_SECURITY_AUDIT],
    tokenStorage: [...TOKEN_STORAGE_AUDIT],
    risks: [...INTEGRATION_RISK_REGISTER],
    phase32Targets: [...PHASE_32_TARGETS],
    verdicts: {
      productionLiveExternalExists: productionLiveExternalExists(),
      productionSandboxFallbackExists: productionSandboxFallbackExists(),
      v2ExternalAdaptersWired: v2ExternalAdaptersWired(),
      plaintextTokensExist: listPlaintextOrMemoryTokenStores().some(
        (entry) =>
          entry.storage === "db_plaintext" ||
          entry.storage === "process_memory",
      ),
      ownerIsolationGapsExist: TOKEN_STORAGE_AUDIT.some(
        (entry) => !entry.ownerId && entry.storage !== "none",
      ),
    },
  };
}

export function buildExternalAdapterInventoryArtifact() {
  return {
    phase: "3-1",
    generatedFrom: "lib/integrations/audit/inventory.ts",
    services: EXTERNAL_SERVICE_INVENTORY,
    byClassification: {
      productionLive: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "Production Live",
      ).map((s) => s.serviceId),
      sandbox: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "Sandbox",
      ).map((s) => s.serviceId),
      mock: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "Mock",
      ).map((s) => s.serviceId),
      stub: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "Stub",
      ).map((s) => s.serviceId),
      partial: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "Partial",
      ).map((s) => s.serviceId),
      oauthOnly: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "OAuth Only",
      ).map((s) => s.serviceId),
      uiOnly: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "UI Only",
      ).map((s) => s.serviceId),
      unsupported: EXTERNAL_SERVICE_INVENTORY.filter(
        (s) => s.classification === "Unsupported",
      ).map((s) => s.serviceId),
    },
  };
}

export function buildIntegrationRegistryAuditArtifact() {
  return {
    phase: "3-1",
    registries: REGISTRY_AUDIT,
    sandboxOrMockOrStubFallbacks: REGISTRY_AUDIT.filter(
      (r) => r.sandboxDefaultInProduction || r.mockFallback || r.stubFallback,
    ),
    productionMode:
      "V2 uses production-step-registry + isLiveAdapterWired; no sandbox default for external success",
  };
}

export function buildOauthSecurityAuditArtifact() {
  return {
    phase: "3-1",
    oauth: OAUTH_SECURITY_AUDIT,
    p0Gaps: OAUTH_SECURITY_AUDIT.flatMap((entry) =>
      entry.gaps
        .filter((gap) => gap.severity === "P0")
        .map((gap) => ({ serviceId: entry.serviceId, ...gap })),
    ),
  };
}

export function buildTokenStorageAuditArtifact() {
  return {
    phase: "3-1",
    tokenStorage: TOKEN_STORAGE_AUDIT,
    plaintextOrMemory: listPlaintextOrMemoryTokenStores(),
  };
}

export function buildIntegrationRiskRegisterArtifact() {
  return {
    phase: "3-1",
    risks: INTEGRATION_RISK_REGISTER,
    p0: risksBySeverity("P0"),
    p1: risksBySeverity("P1"),
    p2: risksBySeverity("P2"),
    failClosedMatrix: FAIL_CLOSED_MATRIX,
    automationPaths: AUTOMATION_PATH_TRACES,
    verdicts: buildExternalAdapterAuditSnapshot().verdicts,
  };
}

export function buildPhase32TargetsMarkdown(): string {
  const adopted = adoptedPhase32Targets();
  const rejected = rejectedPhase32Targets();
  const lines = [
    "# Phase 3-2 Targets — External Live Adapter Implementation",
    "",
    "Generated from Phase 3-1 External Live Adapter Audit.",
    "",
    "## Adopted (max 5)",
    "",
  ];
  for (const target of adopted) {
    lines.push(`### ${target.rank}. \`${target.serviceId}\``);
    lines.push("");
    for (const reason of target.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }
  lines.push("## Rejected / Deferred");
  lines.push("");
  for (const target of rejected) {
    lines.push(`- **${target.serviceId}**: ${target.reasons.join("; ")}`);
  }
  lines.push("");
  lines.push("## Non-goals for Phase 3-2");
  lines.push("");
  lines.push("- Full OAuth redesign beyond encryption/durable storage needs");
  lines.push("- Scheduler / Queue / Worker / Memory core changes");
  lines.push("- Implementing Slack/Discord/Notion/Outlook/Teams/Webhook/S3");
  lines.push("- Unauthorized live posting to X");
  lines.push("");
  return lines.join("\n");
}
