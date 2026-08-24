import { defaultRevenueGoals } from "./defaults";
import type {
  GenerationCostRecord,
  RevenueAgentSnapshot,
  RevenueContent,
  RevenueGoals,
} from "./types";

type Bucket = {
  goals: RevenueGoals;
  items: RevenueContent[];
  costs: GenerationCostRecord[];
  lastGeneratedOn: string | null;
};

function getBucket(): Bucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasRevenueAgentStore?: Bucket;
  };
  if (!globalScope.__atlasRevenueAgentStore) {
    globalScope.__atlasRevenueAgentStore = {
      goals: defaultRevenueGoals(),
      items: [],
      costs: [],
      lastGeneratedOn: null,
    };
  }
  return globalScope.__atlasRevenueAgentStore;
}

export function getRevenueGoals(): RevenueGoals {
  return { ...getBucket().goals, platforms: [...getBucket().goals.platforms] };
}

export function setRevenueGoals(goals: RevenueGoals): RevenueGoals {
  getBucket().goals = {
    ...goals,
    platforms: [...goals.platforms],
    bannedPhrases: [...goals.bannedPhrases],
  };
  return getRevenueGoals();
}

export function listRevenueItems(): RevenueContent[] {
  return getBucket().items.map((item) => ({
    ...item,
    metrics: { ...item.metrics },
    metricSource: { ...item.metricSource },
  }));
}

export function getRevenueItem(id: string): RevenueContent | null {
  return listRevenueItems().find((item) => item.id === id) ?? null;
}

export function upsertRevenueItem(item: RevenueContent): RevenueContent {
  const bucket = getBucket();
  const idx = bucket.items.findIndex((row) => row.id === item.id);
  if (idx >= 0) bucket.items[idx] = item;
  else bucket.items.unshift(item);
  if (bucket.items.length > 400) bucket.items.length = 400;
  return item;
}

export function findItemByIdempotencyKey(
  key: string,
): RevenueContent | null {
  return listRevenueItems().find((item) => item.idempotencyKey === key) ?? null;
}

export function listGenerationCosts(): GenerationCostRecord[] {
  return [...getBucket().costs];
}

export function addGenerationCost(row: GenerationCostRecord): void {
  const bucket = getBucket();
  bucket.costs.unshift(row);
  if (bucket.costs.length > 200) bucket.costs.length = 200;
}

export function getLastGeneratedOn(): string | null {
  return getBucket().lastGeneratedOn;
}

export function setLastGeneratedOn(day: string | null): void {
  getBucket().lastGeneratedOn = day;
}

export function replaceRevenueAgentState(input: {
  goals?: RevenueGoals;
  items?: RevenueContent[];
  costs?: GenerationCostRecord[];
  lastGeneratedOn?: string | null;
}): void {
  const bucket = getBucket();
  if (input.goals) bucket.goals = input.goals;
  if (input.items) bucket.items = input.items;
  if (input.costs) bucket.costs = input.costs;
  if (input.lastGeneratedOn !== undefined) {
    bucket.lastGeneratedOn = input.lastGeneratedOn;
  }
}

export function resetRevenueAgentStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasRevenueAgentStore?: Bucket;
  };
  globalScope.__atlasRevenueAgentStore = {
    goals: defaultRevenueGoals(),
    items: [],
    costs: [],
    lastGeneratedOn: null,
  };
}

export function peekRevenueStoreMeta(): Pick<
  RevenueAgentSnapshot,
  "lastGeneratedOn"
> {
  return { lastGeneratedOn: getBucket().lastGeneratedOn };
}
