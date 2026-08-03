/**
 * Phase 3-1 — Registry inventory and production mode safety facts.
 */

import type { RegistryAuditEntry } from "./types";

export const REGISTRY_AUDIT: readonly RegistryAuditEntry[] = [
  {
    name: "Production Step Registry (V2)",
    sourceFile: "lib/automation-platform/execution/production-step-registry.ts",
    usedBy: [
      "lib/automation-platform/execution/strict-step-invoker.ts",
      "lib/automation-platform/execution/executor.ts",
      "lib/automation-platform/service/automation-service.ts",
    ],
    modeDetermination:
      "Always Production allowlist. Live external adapters gated by isLiveAdapterWired(). Activation refuses requireLiveAdapterAtActivation when unwired unless AUTOMATION_ALLOW_UNWIRED_EXTERNAL_ACTIVATION/VITEST.",
    services: [
      "gmail",
      "x_post",
      "dropbox",
      "google_calendar",
      "wordpress",
      "deliverables",
      "vision",
      "ocr",
      "notify",
      "control",
    ],
    sandboxDefaultInProduction: false,
    mockFallback: false,
    stubFallback: false,
    unknownServiceHandling:
      "step_not_implemented / activation issue step_not_implemented",
    missingAdapterHandling:
      "live_adapter_missing (fail closed; never ok:true)",
    productionSafe: true,
    risks: [
      "External adapters listed but not wired — correct fail-closed, but UI may imply capability",
    ],
  },
  {
    name: "External Services Registry",
    sourceFile: "lib/integrations/external-services/registry.ts",
    usedBy: [
      "lib/integrations/external-services/*",
      "components/settings/external-service-settings.tsx",
      "app/api/external-services/**",
    ],
    modeDetermination:
      "Static CONNECTOR_ENTRIES. No production/preview split. Notion/YouTube use stub connectors.",
    services: ["google", "dropbox", "x", "wordpress", "youtube", "notion"],
    sandboxDefaultInProduction: false,
    mockFallback: false,
    stubFallback: true,
    unknownServiceHandling: "throw Error External service not found",
    missingAdapterHandling: "throw Error connector not found",
    productionSafe: false,
    risks: [
      "stubConnectService for notion/youtube can mark connected in production if invoked",
    ],
  },
  {
    name: "Upload Provider Registry",
    sourceFile: "lib/integrations/providers/upload-registry.ts",
    usedBy: ["lib/integrations/upload-service.ts"],
    modeDetermination: "Static Partial<Record>; only google_drive registered",
    services: ["google_drive"],
    sandboxDefaultInProduction: false,
    mockFallback: false,
    stubFallback: false,
    unknownServiceHandling: "upload path fails when provider missing",
    missingAdapterHandling: "no silent success — provider lookup fails",
    productionSafe: true,
    risks: ["Dropbox/S3 not registered as upload providers"],
  },
  {
    name: "Legacy Integration Provider Registry",
    sourceFile: "lib/integrations/registry.ts",
    usedBy: [
      "lib/integrations/integration-service.ts",
      "components/integrations/*",
    ],
    modeDetermination: "Static catalog; authType metadata only",
    services: [
      "google_drive",
      "gmail",
      "slack",
      "discord",
      "notion",
      "wordpress",
      "github",
      "webhooks",
    ],
    sandboxDefaultInProduction: false,
    mockFallback: false,
    stubFallback: true,
    unknownServiceHandling: "not in catalog",
    missingAdapterHandling:
      "IntegrationService.connect creates connected record without OAuth for non-Drive",
    productionSafe: false,
    risks: [
      "Placeholder connect marks Slack/Discord/Notion/WordPress/GitHub/Webhooks connected without credentials",
      "Legacy repositories are global process memory without owner isolation",
    ],
  },
  {
    name: "Connector Platform Registry",
    sourceFile: "lib/connectors/registry.ts",
    usedBy: [
      "lib/connectors/definitions.ts",
      "action planning / Commander connector refs",
    ],
    modeDetermination:
      "UI/action-planning registry. OAuth stubs enabled:false for most providers.",
    services: [
      "google",
      "microsoft",
      "wordpress",
      "notion",
      "slack",
      "discord",
    ],
    sandboxDefaultInProduction: false,
    mockFallback: false,
    stubFallback: true,
    unknownServiceHandling: "resolve returns unavailable",
    missingAdapterHandling: "planning-only — not an execution invoker",
    productionSafe: true,
    risks: [
      "Available flags can overstate readiness vs live execution",
    ],
  },
  {
    name: "Sandbox Execution Simulator",
    sourceFile: "lib/execution/simulator.ts",
    usedBy: ["lib/execution/summaries.ts", "sandbox UI paths"],
    modeDetermination: "Explicit sandbox/simulated execution records",
    services: ["slack", "discord", "generic actions"],
    sandboxDefaultInProduction: false,
    mockFallback: true,
    stubFallback: true,
    unknownServiceHandling: "generic simulated summary",
    missingAdapterHandling:
      "EXECUTION_EXTENSION_STUBS declare realProviders/oauthExecution/liveWebhooks disabled",
    productionSafe: true,
    risks: [
      "If sandbox summaries are surfaced as real completion, users see false success",
    ],
  },
  {
    name: "Default / Dynamic Registry",
    sourceFile: "n/a — no dynamic production adapter registry",
    usedBy: [],
    modeDetermination:
      "No runtime plugin loader for external adapters. V2 wired set is hardcoded in isLiveAdapterWired.",
    services: [],
    sandboxDefaultInProduction: false,
    mockFallback: false,
    stubFallback: false,
    unknownServiceHandling: "fail closed via production registry",
    missingAdapterHandling: "fail closed",
    productionSafe: true,
    risks: [],
  },
] as const;

export function listSandboxFallbackRegistries(): RegistryAuditEntry[] {
  return REGISTRY_AUDIT.filter(
    (entry) =>
      entry.sandboxDefaultInProduction ||
      entry.mockFallback ||
      entry.stubFallback,
  );
}

export function listProductionUnsafeRegistries(): RegistryAuditEntry[] {
  return REGISTRY_AUDIT.filter((entry) => !entry.productionSafe);
}
