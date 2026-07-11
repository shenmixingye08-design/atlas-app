import "server-only";

import { isEnvPresent } from "@/lib/env/presence";

import { ENV_SERVICE_LABELS, OWNER_ENV_VAR_DEFINITIONS } from "./registry";
import type { OwnerEnvStatusSnapshot, OwnerEnvVarStatus } from "./types";

function isConfigured(keys: readonly string[]): boolean {
  return isEnvPresent(...keys);
}

export function buildOwnerEnvStatusSnapshot(): OwnerEnvStatusSnapshot {
  const variables: OwnerEnvVarStatus[] = OWNER_ENV_VAR_DEFINITIONS.map(
    (definition) => {
      const keys = [definition.key, ...(definition.aliases ?? [])];
      const configured = isConfigured(keys);
      return {
        key: definition.key,
        service: definition.service,
        serviceLabel: ENV_SERVICE_LABELS[definition.service],
        requirement: definition.requirement,
        purpose: definition.purpose,
        configured,
        displayValue: configured ? "******" : "（未設定）",
      };
    },
  );

  const configuredCount = variables.filter((row) => row.configured).length;
  const requiredMissing = variables.filter(
    (row) => row.requirement === "required" && !row.configured,
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: variables.length,
      configured: configuredCount,
      missing: variables.length - configuredCount,
      requiredMissing,
    },
    variables,
  };
}
