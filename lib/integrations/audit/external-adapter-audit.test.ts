import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isLiveAdapterWired,
  PRODUCTION_STEP_REGISTRY,
} from "@/lib/automation-platform/execution/production-step-registry";
import { AUTOMATION_PATH_TRACES } from "./automation-path";
import {
  collectAllDiagnostics,
  diagnoseUnwiredExternalAdapters,
  productionLiveExternalExists,
  productionSandboxFallbackExists,
  servicesByClassification,
  v2ExternalAdaptersWired,
} from "./diagnostics";
import { FAIL_CLOSED_MATRIX, V2_FORBIDDEN_SUCCESS_CASES } from "./fail-closed-matrix";
import { EXTERNAL_SERVICE_INVENTORY, getInventoryEntry } from "./inventory";
import { OAUTH_SECURITY_AUDIT } from "./oauth-audit";
import {
  adoptedPhase32Targets,
  rejectedPhase32Targets,
} from "./phase32-targets";
import { REGISTRY_AUDIT } from "./registry-audit";
import { INTEGRATION_RISK_REGISTER, risksBySeverity } from "./risk-register";
import {
  buildCompletionEvidenceV2,
} from "@/lib/automation-platform/execution/completion-evidence-v2";
import {
  buildExternalAdapterInventoryArtifact,
  buildExternalAdapterAuditSnapshot,
} from "./snapshot";
import {
  listPlaintextOrMemoryTokenStores,
  TOKEN_STORAGE_AUDIT,
} from "./token-storage-audit";
import { writeExternalAdapterAuditArtifacts } from "./write-artifacts";
import { existsSync } from "node:fs";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Phase 3-1 External Live Adapter Audit", () => {
  it("inventories all required external services", () => {
    const ids = EXTERNAL_SERVICE_INVENTORY.map((entry) => entry.serviceId);
    for (const required of [
      "google_drive",
      "gmail",
      "google_calendar",
      "dropbox",
      "wordpress",
      "x",
      "slack",
      "discord",
      "notion",
      "line",
      "microsoft_outlook",
      "microsoft_teams",
      "webhook",
      "push_notification",
      "email_delivery",
      "supabase_storage",
      "s3_r2",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("does not classify UI-only services as Production Live", () => {
    for (const entry of servicesByClassification("UI Only")) {
      expect(entry.productionReachable).toBe(false);
      expect(entry.classification).not.toBe("Production Live");
    }
    for (const entry of servicesByClassification("Stub")) {
      expect(entry.productionReachable).toBe(false);
    }
  });

  it("Production Registry mode never marks unwired external adapters as wired", () => {
    for (const adapterId of [
      "google_gmail",
      "x",
      "dropbox",
      "google_calendar",
      "wordpress",
    ]) {
      expect(isLiveAdapterWired(adapterId)).toBe(false);
    }
    expect(isLiveAdapterWired("openai_vision")).toBe(true);
    expect(v2ExternalAdaptersWired()).toBe(false);
  });

  it("detects sandbox/stub/mock fallback registries", () => {
    const unsafe = REGISTRY_AUDIT.filter((entry) => !entry.productionSafe);
    expect(unsafe.length).toBeGreaterThan(0);
    expect(
      unsafe.some((entry) => entry.sourceFile.includes("integration-service") || entry.stubFallback),
    ).toBe(true);
    expect(productionSandboxFallbackExists()).toBe(true);
  });

  it("detects mock/stub connect success helpers in source", () => {
    const stubSource = readSource("lib/integrations/connector-types.ts");
    expect(stubSource).toContain("stubConnectService");
    expect(stubSource).toContain('status: "connected"');

    const notion = readSource("lib/integrations/notion/index.ts");
    expect(notion).toContain("stubConnectService");

    const legacy = readSource("lib/integrations/integration-service.ts");
    expect(legacy).toContain("Placeholder connect");
  });

  it("Adapter missing fails closed in strict invoker", () => {
    const strict = readSource(
      "lib/automation-platform/execution/strict-step-invoker.ts",
    );
    expect(strict).toContain("live_adapter_missing");
    expect(strict).toContain("liveAdapterMissing");
    expect(strict).not.toMatch(/ok:\s*true[\s\S]{0,120}live_adapter/);
    expect(diagnoseUnwiredExternalAdapters().length).toBe(5);
  });

  it("missing config / expired token / missing scope cases are not success on V2", () => {
    for (const caseId of [
      "token_missing",
      "token_expired",
      "token_revoked",
      "scope_missing",
      "adapter_unregistered",
    ]) {
      const row = FAIL_CLOSED_MATRIX.find((entry) => entry.caseId === caseId);
      expect(row).toBeTruthy();
      expect(row?.v2AutomationOutcome).not.toBe("success");
    }
    expect(V2_FORBIDDEN_SUCCESS_CASES).toEqual([]);
  });

  it("classifies provider HTTP failures without false success", () => {
    for (const caseId of [
      "provider_401",
      "provider_403",
      "provider_404",
      "provider_409",
      "provider_429",
      "provider_5xx",
      "timeout",
      "network_failure",
      "external_action_id_missing",
      "external_url_missing",
    ]) {
      const row = FAIL_CLOSED_MATRIX.find((entry) => entry.caseId === caseId);
      expect(row?.v2AutomationOutcome).not.toBe("success");
    }
  });

  it("externalActionId / externalUrl missing are rejected by executor", () => {
    const executor = readSource(
      "lib/automation-platform/execution/executor.ts",
    );
    expect(executor).toContain("external_action_id_required");
    expect(executor).toContain("rejectFakeSuccess");
  });

  it("duplicate retry risk is registered for WordPress and Dropbox", () => {
    const ids = INTEGRATION_RISK_REGISTER.map((risk) => risk.id);
    expect(ids).toContain("P0-WORDPRESS-DUPLICATE-POST");
    expect(ids).toContain("P1-DROPBOX-AUTORENAME");
  });

  it("Completion Evidence mode fields and owner isolation facts are audited", () => {
    const evidence = buildCompletionEvidenceV2({
      run: {
        id: "run_1",
        automationId: "auto_1",
        userId: "owner_1",
        artifacts: [
          {
            id: "art_1",
            url: "https://drive.example/file",
            externalId: "file_1",
          },
        ],
      } as never,
      completedStepIds: ["step_1"],
      fragments: [
        {
          externalActionIds: ["file_1"],
          externalUrls: ["https://drive.example/file"],
        },
      ],
    });
    expect(evidence?.ownerId).toBe("owner_1");
    expect(evidence?.externalActionIds).toContain("file_1");
    expect(evidence?.externalUrls[0]).toContain("https://");
    // adapter mode / environment not yet on evidence — tracked as P1
    expect(risksBySeverity("P1").some((r) => r.id === "P1-EVIDENCE-ADAPTER-MODE")).toBe(
      true,
    );
  });

  it("owner isolation gap is detected for legacy repositories", () => {
    const repo = readSource(
      "lib/integrations/repositories/server-integration-repository.ts",
    );
    expect(repo).toContain("__atlasIntegrationStore");
    expect(
      INTEGRATION_RISK_REGISTER.some((r) => r.id === "P0-LEGACY-OWNER-ISOLATION"),
    ).toBe(true);
  });

  it("plaintext / process-memory token stores are P0", () => {
    const unsafe = listPlaintextOrMemoryTokenStores();
    expect(unsafe.some((entry) => entry.serviceId === "dropbox")).toBe(true);
    expect(unsafe.some((entry) => entry.serviceId === "google_drive")).toBe(true);
    expect(unsafe.some((entry) => entry.serviceId === "x")).toBe(true);
    const dropbox = TOKEN_STORAGE_AUDIT.find((e) => e.serviceId === "dropbox");
    expect(dropbox?.storage).toBe("process_memory");
    expect(dropbox?.severityIfUnsafe).toBe("P0");
  });

  it("OAuth audit covers Google/X/Dropbox PKCE and encryption gaps", () => {
    const google = OAUTH_SECURITY_AUDIT.find((e) => e.serviceId === "google_drive");
    const x = OAUTH_SECURITY_AUDIT.find((e) => e.serviceId === "x");
    const dropbox = OAUTH_SECURITY_AUDIT.find((e) => e.serviceId === "dropbox");
    expect(google?.pkce).toBe(false);
    expect(google?.tokenEncryption).toBe(false);
    expect(x?.pkce).toBe(true);
    expect(x?.tokenEncryption).toBe(false);
    expect(dropbox?.pkce).toBe(true);
    expect(dropbox?.gaps.some((g) => g.severity === "P0")).toBe(true);
  });

  it("Automation paths mark V2 external adapters broken at Adapter node", () => {
    const v2Broken = AUTOMATION_PATH_TRACES.filter(
      (trace) =>
        trace.pathName.startsWith("V2") &&
        ["gmail", "x", "dropbox", "wordpress", "google_calendar"].includes(
          trace.serviceId,
        ),
    );
    expect(v2Broken.length).toBeGreaterThanOrEqual(5);
    for (const trace of v2Broken) {
      expect(trace.brokenAt).toBe("Adapter");
    }
  });

  it("narrows Phase 3-2 to exactly 5 adopted services", () => {
    const adopted = adoptedPhase32Targets();
    expect(adopted).toHaveLength(5);
    expect(adopted.map((t) => t.serviceId)).toEqual([
      "google_drive",
      "gmail",
      "google_calendar",
      "dropbox",
      "wordpress",
    ]);
    expect(rejectedPhase32Targets().some((t) => t.serviceId === "x")).toBe(true);
  });

  it("production live external exists via Partial/legacy paths, not V2 wiring", () => {
    expect(productionLiveExternalExists()).toBe(true);
    expect(getInventoryEntry("supabase_storage")?.classification).toBe(
      "Production Live",
    );
    expect(getInventoryEntry("gmail")?.classification).toBe("Partial");
    expect(
      PRODUCTION_STEP_REGISTRY.filter((s) => s.kind === "external").every(
        (s) => s.requireLiveAdapterAtActivation,
      ),
    ).toBe(true);
  });

  it("snapshot and inventory artifacts are serializable", () => {
    const snapshot = buildExternalAdapterAuditSnapshot("2026-08-03T00:00:00.000Z");
    expect(snapshot.phase).toBe("3-1");
    expect(snapshot.inventory.length).toBeGreaterThanOrEqual(17);
    expect(snapshot.verdicts.v2ExternalAdaptersWired).toBe(false);
    expect(snapshot.verdicts.plaintextTokensExist).toBe(true);
    expect(snapshot.verdicts.productionSandboxFallbackExists).toBe(true);

    const inventory = buildExternalAdapterInventoryArtifact();
    expect(inventory.byClassification.partial.length).toBeGreaterThan(0);
    expect(inventory.byClassification.unsupported).toContain("s3_r2");
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("collects diagnostics without calling provider APIs", () => {
    const findings = collectAllDiagnostics();
    expect(findings.some((f) => f.code === "live_adapter_missing")).toBe(true);
    expect(findings.every((f) => f.message.length > 0)).toBe(true);
  });

  it("writes CI artifacts for Phase 3-1", () => {
    const written = writeExternalAdapterAuditArtifacts(ROOT);
    expect(written.length).toBe(6);
    for (const path of written) {
      expect(existsSync(path)).toBe(true);
    }
  });
});
