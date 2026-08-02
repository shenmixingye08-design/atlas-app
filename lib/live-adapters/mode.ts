import type { AdapterRuntimeMode } from "./types";

export class AdapterRuntimeModeError extends Error {
  readonly code = "adapter_runtime_mode_invalid";

  constructor(message: string) {
    super(message);
    this.name = "AdapterRuntimeModeError";
  }
}

/**
 * Resolve adapter runtime mode.
 * Fail-closed: unknown override values throw (never silently fall to sandbox).
 */
export function resolveAdapterRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): AdapterRuntimeMode {
  if (env.VITEST === "true" || env.NODE_ENV === "test") {
    return "test";
  }

  const override = env.ATLAS_ADAPTER_RUNTIME_MODE?.trim().toLowerCase();
  if (override) {
    if (
      override === "production" ||
      override === "preview" ||
      override === "test"
    ) {
      return override;
    }
    throw new AdapterRuntimeModeError(
      `Invalid ATLAS_ADAPTER_RUNTIME_MODE=${override}. Allowed: production|preview|test`,
    );
  }

  if (
    env.VERCEL_ENV === "production" ||
    env.ATLAS_RUNTIME === "production" ||
    env.ATLAS_PRODUCTION === "true"
  ) {
    return "production";
  }

  if (env.VERCEL_ENV === "preview") {
    return "preview";
  }

  // Local / unspecified → preview (explicit non-production). Never "sandbox".
  return "preview";
}

export function assertProductionDisallowsSandbox(mode: AdapterRuntimeMode): void {
  if (mode === "production") {
    const sandboxEnabled =
      envTruthy(process.env.ATLAS_ALLOW_SANDBOX_ADAPTERS) ||
      envTruthy(process.env.USE_SANDBOX) ||
      process.env.INTEGRATION_MODE?.trim().toLowerCase() === "sandbox";
    if (sandboxEnabled) {
      throw new AdapterRuntimeModeError(
        "Production forbids sandbox adapters (USE_SANDBOX / INTEGRATION_MODE=sandbox / ATLAS_ALLOW_SANDBOX_ADAPTERS)",
      );
    }
  }
}

function envTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Preview may enable live side-effects only with explicit opt-in. */
export function previewLiveExternalEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    envTruthy(env.ATLAS_PREVIEW_LIVE_EXTERNAL) ||
    envTruthy(env.AUTOMATION_E2E_LIVE_EXTERNAL)
  );
}
