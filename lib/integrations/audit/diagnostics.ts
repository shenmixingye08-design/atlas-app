/**
 * Phase 3-1 diagnostics — detect dangerous production fallbacks and unwired adapters.
 * Audit-only: no adapter implementations, no live provider calls.
 */

import {
  isLiveAdapterWired,
  PRODUCTION_STEP_REGISTRY,
} from "@/lib/automation-platform/execution/production-step-registry";
import { EXTERNAL_SERVICE_INVENTORY } from "./inventory";
import { listSandboxFallbackRegistries } from "./registry-audit";
import { INTEGRATION_RISK_REGISTER } from "./risk-register";
import { listPlaintextOrMemoryTokenStores } from "./token-storage-audit";
import type { AdapterClassification, RiskSeverity } from "./types";

export type DiagnosticFinding = {
  code: string;
  severity: RiskSeverity;
  message: string;
  evidence: string[];
};

const V2_EXTERNAL_ADAPTER_IDS = [
  "google_gmail",
  "x",
  "dropbox",
  "google_calendar",
  "wordpress",
] as const;

/** Fail-fast inventory of V2 external adapters that are not Production-wired. */
export function diagnoseUnwiredExternalAdapters(): DiagnosticFinding[] {
  return V2_EXTERNAL_ADAPTER_IDS.filter(
    (adapterId) => !isLiveAdapterWired(adapterId),
  ).map((adapterId) => ({
    code: "live_adapter_missing",
    severity: "P0" as const,
    message: `V2 Production adapter not wired: ${adapterId}`,
    evidence: [
      "lib/automation-platform/execution/production-step-registry.ts#isLiveAdapterWired",
      "lib/automation-platform/execution/strict-step-invoker.ts#invokeExternalGate",
    ],
  }));
}

/** Detect registries/paths that can stub/mock/sandbox-connect in production code. */
export function diagnoseDangerousProductionFallbacks(): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  for (const registry of listSandboxFallbackRegistries()) {
    if (!registry.productionSafe) {
      findings.push({
        code: "unsafe_registry_fallback",
        severity: "P0",
        message: `Unsafe stub/mock fallback registry: ${registry.name}`,
        evidence: [registry.sourceFile, ...registry.risks],
      });
    }
  }

  for (const store of listPlaintextOrMemoryTokenStores()) {
    if (store.severityIfUnsafe === "P0") {
      findings.push({
        code: "unsafe_token_storage",
        severity: "P0",
        message: `Unsafe token storage for ${store.serviceId}: ${store.storage}`,
        evidence: [store.detail],
      });
    }
  }

  if (process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY === "1") {
    findings.push({
      code: "offline_notify_enabled",
      severity: "P1",
      message:
        "ATLAS_WORK_QUEUE_OFFLINE_NOTIFY=1 is set — local notify receipts can be treated as evidence",
      evidence: ["lib/work-queue/steps/execute-step.ts"],
    });
  }

  if (process.env.AUTOMATION_ALLOW_UNWIRED_EXTERNAL_ACTIVATION === "true") {
    findings.push({
      code: "unwired_activation_override",
      severity: "P0",
      message:
        "AUTOMATION_ALLOW_UNWIRED_EXTERNAL_ACTIVATION=true allows activating unwired external steps",
      evidence: ["lib/automation-platform/service/automation-service.ts"],
    });
  }

  return findings;
}

export function diagnoseMisclassifiedProductionLive(): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  for (const entry of EXTERNAL_SERVICE_INVENTORY) {
    if (
      entry.classification === "Production Live" &&
      entry.automationPath === "registered_unwired"
    ) {
      findings.push({
        code: "misclassified_production_live",
        severity: "P0",
        message: `${entry.serviceId} classified Production Live but V2 adapter unwired`,
        evidence: [entry.status],
      });
    }
    if (
      entry.classification === "Production Live" &&
      !entry.productionReachable
    ) {
      findings.push({
        code: "misclassified_production_live",
        severity: "P0",
        message: `${entry.serviceId} classified Production Live but productionReachable=false`,
        evidence: [entry.status],
      });
    }
  }
  return findings;
}

export function listV2ExternalSteps() {
  return PRODUCTION_STEP_REGISTRY.filter((step) => step.kind === "external");
}

export function productionLiveServices() {
  return EXTERNAL_SERVICE_INVENTORY.filter(
    (entry) => entry.classification === "Production Live",
  );
}

export function servicesByClassification(classification: AdapterClassification) {
  return EXTERNAL_SERVICE_INVENTORY.filter(
    (entry) => entry.classification === classification,
  );
}

export function assertNoV2SandboxDefault(): DiagnosticFinding[] {
  // Production registry must not default external adapters to sandbox success.
  const wiredExternal = V2_EXTERNAL_ADAPTER_IDS.filter((id) =>
    isLiveAdapterWired(id),
  );
  if (wiredExternal.length === 0) {
    return [
      {
        code: "v2_external_all_unwired",
        severity: "P0",
        message:
          "No V2 external OAuth adapters are Production-wired (fail-closed; not sandbox success)",
        evidence: [
          "isLiveAdapterWired only allows openai_vision / openai_vision_ocr",
        ],
      },
    ];
  }
  return [];
}

export function collectAllDiagnostics(): DiagnosticFinding[] {
  return [
    ...diagnoseUnwiredExternalAdapters(),
    ...diagnoseDangerousProductionFallbacks(),
    ...diagnoseMisclassifiedProductionLive(),
    ...assertNoV2SandboxDefault(),
    ...INTEGRATION_RISK_REGISTER.filter((risk) => risk.severity === "P0").map(
      (risk) => ({
        code: risk.id,
        severity: risk.severity,
        message: risk.title,
        evidence: risk.evidence,
      }),
    ),
  ];
}

export function productionSandboxFallbackExists(): boolean {
  // True when production code contains stub/mock connection or offline-notify
  // fallbacks that can claim success without provider proof.
  return (
    diagnoseDangerousProductionFallbacks().some(
      (finding) => finding.severity === "P0",
    ) || listSandboxFallbackRegistries().some((entry) => !entry.productionSafe)
  );
}

export function productionLiveExternalExists(): boolean {
  // Real provider-reaching paths exist outside V2 (Drive upload, X legacy, etc.).
  return EXTERNAL_SERVICE_INVENTORY.some(
    (entry) =>
      entry.productionReachable &&
      (entry.classification === "Production Live" ||
        entry.classification === "Partial") &&
      (entry.savesExternalActionId || entry.automationPath === "legacy_only"),
  );
}

export function v2ExternalAdaptersWired(): boolean {
  return V2_EXTERNAL_ADAPTER_IDS.every((id) => isLiveAdapterWired(id));
}
