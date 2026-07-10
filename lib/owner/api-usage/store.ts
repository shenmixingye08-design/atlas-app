import { API_USAGE_PROVIDER_IDS, parseBudgetUsd } from "./budgets";
import type {
  ApiUsageProviderId,
  ApiUsageRecord,
  ApiUsageRecordSource,
} from "./types";

type UsageBucket = ApiUsageRecord[];
type BudgetBucket = Map<ApiUsageProviderId, number>;

function getUsageBucket(): UsageBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasApiUsageStore?: UsageBucket;
  };

  if (!globalScope.__atlasApiUsageStore) {
    globalScope.__atlasApiUsageStore = [];
  }

  return globalScope.__atlasApiUsageStore;
}

function getBudgetBucket(): BudgetBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasApiUsageBudgetStore?: BudgetBucket;
  };

  if (!globalScope.__atlasApiUsageBudgetStore) {
    globalScope.__atlasApiUsageBudgetStore = new Map();
  }

  return globalScope.__atlasApiUsageBudgetStore;
}

export function recordApiUsage(input: {
  providerId: ApiUsageProviderId;
  amountUsd: number;
  timestamp?: string;
  source?: ApiUsageRecordSource;
}): ApiUsageRecord {
  const amountUsd = Math.max(0, input.amountUsd);
  const record: ApiUsageRecord = {
    providerId: input.providerId,
    amountUsd,
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: input.source ?? "external",
  };

  if (amountUsd > 0) {
    getUsageBucket().push(record);
  }

  return record;
}

export function listApiUsageRecords(): ApiUsageRecord[] {
  return [...getUsageBucket()];
}

export function listApiUsageRecordsForProvider(
  providerId: ApiUsageProviderId,
): ApiUsageRecord[] {
  return getUsageBucket().filter((record) => record.providerId === providerId);
}

export function getProviderBudgetUsd(providerId: ApiUsageProviderId): number {
  const override = getBudgetBucket().get(providerId);
  return parseBudgetUsd(providerId, override);
}

export function setProviderBudgetUsd(
  providerId: ApiUsageProviderId,
  budgetUsd: number,
): number {
  const normalized = Math.max(1, budgetUsd);
  getBudgetBucket().set(providerId, normalized);
  return normalized;
}

export function resetApiUsageStore(): void {
  getUsageBucket().length = 0;
  getBudgetBucket().clear();
}

export function seedApiUsageStore(records: readonly ApiUsageRecord[]): void {
  getUsageBucket().push(...records);
}

export function hasRecordedUsage(providerId: ApiUsageProviderId): boolean {
  return getUsageBucket().some((record) => record.providerId === providerId);
}

export function listConfiguredProviderIds(): readonly ApiUsageProviderId[] {
  return API_USAGE_PROVIDER_IDS;
}
