/**
 * Fail Closed: required external steps must verify before completed.
 * Partial / mid-success must never become completed.
 */

import type {
  CompletionGateInput,
  CompletionGateResult,
  IntegrationServiceId,
} from "@/lib/integration-platform/types";

const STRICT_SERVICES = new Set<IntegrationServiceId>([
  "dropbox",
  "wordpress",
  "x",
  "google_drive",
]);

export function evaluateIntegrationCompletionGate(
  input: CompletionGateInput,
): CompletionGateResult {
  if (!input.artifactReady) {
    return {
      canComplete: false,
      reason: "成果物が未完成のため完了できません",
      proofs: [],
    };
  }

  const required = input.requiredServices;
  if (required.length === 0) {
    return { canComplete: true, reason: null, proofs: [] };
  }

  const proofs: CompletionGateResult["proofs"] = [];

  for (const serviceId of required) {
    const result = input.results.find((r) => r.serviceId === serviceId && r.ok);
    if (!result) {
      return {
        canComplete: false,
        reason: `${serviceId} が未成功のため completed 禁止（Fail Closed）`,
        proofs,
      };
    }
    if (!result.verified) {
      return {
        canComplete: false,
        reason: `${serviceId} のリモート検証が未完了のため completed 禁止`,
        proofs,
      };
    }
    if (!result.externalId || !result.externalUrl) {
      return {
        canComplete: false,
        reason: `${serviceId} の外部ID/URLが無いため completed 禁止`,
        proofs,
      };
    }
    if (result.proofKind === "mock" && STRICT_SERVICES.has(serviceId)) {
      return {
        canComplete: false,
        reason: `${serviceId} のmock成功は completed にできません`,
        proofs,
      };
    }
    proofs.push({
      serviceId,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    });
  }

  return { canComplete: true, reason: null, proofs };
}

/** Map automation template / steps to required services. */
export function requiredServicesForAutomation(input: {
  templateId?: string | null;
  steps?: readonly string[] | null;
  uploadProvider?: IntegrationServiceId | null;
  requireUpload?: boolean;
}): IntegrationServiceId[] {
  const required = new Set<IntegrationServiceId>();
  if (input.templateId === "sns_post" || input.steps?.includes("x_post")) {
    required.add("x");
  }
  if (input.steps?.includes("wordpress_post")) {
    required.add("wordpress");
  }
  if (input.steps?.includes("dropbox_upload") || input.uploadProvider === "dropbox") {
    required.add("dropbox");
  }
  if (
    input.requireUpload ||
    input.steps?.includes("drive_upload") ||
    input.uploadProvider === "google_drive"
  ) {
    required.add(input.uploadProvider ?? "google_drive");
  }
  return [...required];
}
