import { buildExecutionResult } from "../result";
import type {
  AdapterExecuteInput,
  AdapterRegistry,
  IntegrationService,
  NonProductionAdapter,
  ValidationResult,
} from "../types";
import { createAdapterRegistry } from "./create-registry";

function testAdapter(
  service: IntegrationService,
  opts?: { connected?: boolean; succeed?: boolean },
): NonProductionAdapter {
  const connected = opts?.connected ?? true;
  const succeed = opts?.succeed ?? true;
  return {
    id: `test.${service}`,
    service,
    mode: "test",
    classification: "mock",
    availability: "available",
    async validateConnection(): Promise<ValidationResult> {
      return connected
        ? { ok: true, code: "ok", message: "test connected" }
        : { ok: false, code: "needs_connection", message: "test not connected" };
    },
    async validatePermissions(): Promise<ValidationResult> {
      return connected
        ? { ok: true, code: "ok", message: "test permissions ok" }
        : {
            ok: false,
            code: "needs_permission",
            message: "test permissions missing",
          };
    },
    async execute(input: AdapterExecuteInput) {
      const startedAt = new Date().toISOString();
      if (!connected) {
        return buildExecutionResult({
          status: "needs_connection",
          startedAt,
          errorCode: "needs_connection",
          summary: "test not connected",
          requiresExternalActionId: false,
        });
      }
      if (!succeed) {
        return buildExecutionResult({
          status: "failed",
          startedAt,
          errorCode: "provider_error",
          summary: "controlled test failure",
          retryable: true,
          requiresExternalActionId: false,
        });
      }
      return buildExecutionResult({
        status: "succeeded",
        externalActionId: `live-test-${service}-${input.runId}-${input.stepId}`,
        externalUrl: `https://example.test/${service}/${input.runId}`,
        startedAt,
        summary: `test ${service} ok`,
        requiresExternalActionId: true,
        metadata: { mode: "test", explicit: true },
      });
    },
  };
}

/**
 * Explicit Test registry (mode=test). Never used in production.
 * externalActionId uses non-fake prefix `live-test-`.
 */
export function createTestAdapterRegistry(options?: {
  connected?: boolean;
  succeed?: boolean;
}): AdapterRegistry {
  const services: IntegrationService[] = [
    "google_drive",
    "gmail",
    "google_calendar",
    "dropbox",
    "wordpress",
    "x",
  ];
  return createAdapterRegistry(
    "test",
    services.map((service) => testAdapter(service, options)),
  );
}
