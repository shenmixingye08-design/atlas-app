import "server-only";

import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationV2 } from "@/lib/automation-platform/types";

import { isServiceConfigured } from "./config";
import { resolveAdapterRuntimeMode } from "./mode";
import { getAdapterRegistry } from "./registry/resolve";
import type {
  AutomationPreflightResult,
  IntegrationService,
  PreflightIssue,
} from "./types";

const CAPABILITY_TO_SERVICE: Partial<
  Record<AutomationCapabilityId, IntegrationService>
> = {
  gmail: "gmail",
  x_post: "x",
  google_calendar: "google_calendar",
  wordpress: "wordpress",
  dropbox: "dropbox",
};

export function mapCapabilityToIntegrationService(
  capabilityId: AutomationCapabilityId,
): IntegrationService | null {
  return CAPABILITY_TO_SERVICE[capabilityId] ?? null;
}

/** Validate all Live Adapters required by an automation before activate. */
export async function runAutomationLiveAdapterPreflight(input: {
  automation: Pick<AutomationV2, "workflow" | "executionPolicy">;
  userId: string;
}): Promise<AutomationPreflightResult> {
  const runtimeMode = resolveAdapterRuntimeMode();
  const registry = await getAdapterRegistry({ mode: runtimeMode });
  const issues: PreflightIssue[] = [];
  const checked = new Set<IntegrationService>();

  const enabledSteps = input.automation.workflow.steps.filter((s) => s.enabled);
  for (const step of enabledSteps) {
    const service = mapCapabilityToIntegrationService(step.type);
    if (!service) continue;
    checked.add(service);

    const adapter = registry.get(service);
    if (!adapter) {
      issues.push({
        service,
        code: "adapter_unregistered",
        message: `${service} の Live Adapter が Registry に登録されていません`,
        blocking: true,
      });
      continue;
    }

    if (runtimeMode === "production" && adapter.mode !== "production") {
      issues.push({
        service,
        code: "adapter_not_production",
        message: `${service} Adapter が production mode ではありません`,
        blocking: true,
      });
      continue;
    }

    // Test registry adapters do not require real provider env credentials.
    if (runtimeMode !== "test" && !isServiceConfigured(service)) {
      issues.push({
        service,
        code: "needs_configuration",
        message: `${service} の本番設定（環境変数）が不足しています`,
        blocking: true,
      });
      continue;
    }

    const connection = await adapter.validateConnection(input.userId);
    if (!connection.ok) {
      issues.push({
        service,
        code: connection.code,
        message: connection.message,
        blocking: true,
      });
      continue;
    }

    const permissions = await adapter.validatePermissions(input.userId);
    if (!permissions.ok) {
      issues.push({
        service,
        code: permissions.code,
        message: permissions.message,
        blocking: true,
      });
    }

    // Destination checks for storage steps
    if (service === "dropbox") {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget.trim()
          : typeof step.configuration.folderPath === "string"
            ? step.configuration.folderPath.trim()
            : "";
      if (!dest) {
        issues.push({
          service,
          code: "missing_destination",
          message: "Dropbox保存先が未設定です",
          blocking: true,
        });
      }
    }
    if (service === "gmail") {
      const to =
        typeof step.configuration.to === "string"
          ? step.configuration.to.trim()
          : "";
      if (!to || to === "（宛先未設定）") {
        issues.push({
          service,
          code: "missing_recipient",
          message: "メール宛先が未設定です",
          blocking: true,
        });
      }
    }
    if (service === "x" || service === "wordpress") {
      if (
        input.automation.executionPolicy.mode === "run_then_notify" &&
        step.requiresApproval === false &&
        // high-risk should still require approval at system level
        true
      ) {
        // Informational only when systemRequiresApproval will gate at execute time.
      }
    }
  }

  const blocking = issues.filter((i) => i.blocking);
  return {
    ok: blocking.length === 0,
    canActivate: blocking.length === 0,
    issues,
    checkedServices: [...checked],
    runtimeMode,
    checkedAt: new Date().toISOString(),
  };
}
