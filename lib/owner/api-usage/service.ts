import "server-only";

import { isApiUsageProviderId } from "./budgets";
import { buildApiUsageMonitoringSnapshot } from "./engine";
import { setProviderBudgetUsd } from "./store";
import type {
  ApiUsageMonitoringSnapshot,
  ApiUsageProviderId,
} from "./types";

export function getApiUsageMonitoringSnapshot(
  now?: Date,
): ApiUsageMonitoringSnapshot {
  return buildApiUsageMonitoringSnapshot(now);
}

export function parseApiUsageBudgetUpdate(body: unknown):
  | { providerId: ApiUsageProviderId; budgetUsd: number }
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as { providerId?: unknown; budgetUsd?: unknown };

  if (typeof record.providerId !== "string" || !isApiUsageProviderId(record.providerId)) {
    return { error: "providerId is invalid" };
  }

  const budgetUsd = Number(record.budgetUsd);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    return { error: "budgetUsd must be a positive number" };
  }

  return { providerId: record.providerId, budgetUsd };
}

export function updateApiUsageBudget(
  providerId: ApiUsageProviderId,
  budgetUsd: number,
): ApiUsageMonitoringSnapshot {
  setProviderBudgetUsd(providerId, budgetUsd);
  return getApiUsageMonitoringSnapshot();
}
