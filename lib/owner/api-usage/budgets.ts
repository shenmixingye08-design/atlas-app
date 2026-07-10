import type { ApiUsageProviderId } from "./types";

export const API_USAGE_PROVIDER_IDS: readonly ApiUsageProviderId[] = [
  "openai",
  "google",
  "stripe",
  "x",
  "wordpress",
] as const;

const DEFAULT_BUDGETS_USD: Record<ApiUsageProviderId, number> = {
  openai: 500,
  google: 200,
  stripe: 150,
  x: 100,
  wordpress: 50,
};

const ENV_KEYS: Record<ApiUsageProviderId, string> = {
  openai: "ATLAS_API_BUDGET_OPENAI_USD",
  google: "ATLAS_API_BUDGET_GOOGLE_USD",
  stripe: "ATLAS_API_BUDGET_STRIPE_USD",
  x: "ATLAS_API_BUDGET_X_USD",
  wordpress: "ATLAS_API_BUDGET_WORDPRESS_USD",
};

export function parseBudgetUsd(
  providerId: ApiUsageProviderId,
  override?: number,
): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }

  const envValue = process.env[ENV_KEYS[providerId]]?.trim();
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_BUDGETS_USD[providerId];
}

export function isApiUsageProviderId(
  value: string,
): value is ApiUsageProviderId {
  return API_USAGE_PROVIDER_IDS.includes(value as ApiUsageProviderId);
}
