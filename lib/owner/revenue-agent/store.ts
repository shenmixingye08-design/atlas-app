import type { RevenueVisitor, VisitorUserLink } from "./attribution";
import { defaultRevenueGoals } from "./defaults";
import type { RevenueAgentEvent } from "./events";
import { normalizeRevenueContent } from "./normalize";
import type {
  GenerationCostRecord,
  MeasuredNumber,
  RevenueAgentSnapshot,
  RevenueContent,
  RevenueGoals,
} from "./types";

type Bucket = {
  goals: RevenueGoals;
  items: RevenueContent[];
  costs: GenerationCostRecord[];
  lastGeneratedOn: string | null;
  events: RevenueAgentEvent[];
  visitors: RevenueVisitor[];
  visitorUserLinks: VisitorUserLink[];
  adSpendYen: MeasuredNumber;
  adSpendUpdatedAt: string | null;
};

function emptyBucket(): Bucket {
  return {
    goals: defaultRevenueGoals(),
    items: [],
    costs: [],
    lastGeneratedOn: null,
    events: [],
    visitors: [],
    visitorUserLinks: [],
    adSpendYen: null,
    adSpendUpdatedAt: null,
  };
}

function getBucket(): Bucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasRevenueAgentStore?: Bucket;
  };
  if (!globalScope.__atlasRevenueAgentStore) {
    globalScope.__atlasRevenueAgentStore = emptyBucket();
  }
  const bucket = globalScope.__atlasRevenueAgentStore;
  if (!bucket.events) bucket.events = [];
  if (!bucket.visitors) bucket.visitors = [];
  if (!bucket.visitorUserLinks) bucket.visitorUserLinks = [];
  if (bucket.adSpendYen === undefined) bucket.adSpendYen = null;
  return bucket;
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
  return getBucket().items.map((item) =>
    normalizeRevenueContent({
      ...item,
      metrics: { ...item.metrics },
      metricSource: { ...item.metricSource },
    }),
  );
}

export function getRevenueItem(id: string): RevenueContent | null {
  return listRevenueItems().find((item) => item.id === id) ?? null;
}

export function upsertRevenueItem(item: RevenueContent): RevenueContent {
  const bucket = getBucket();
  const normalized = normalizeRevenueContent(item);
  const idx = bucket.items.findIndex((row) => row.id === normalized.id);
  if (idx >= 0) bucket.items[idx] = normalized;
  else bucket.items.unshift(normalized);
  if (bucket.items.length > 400) bucket.items.length = 400;
  return normalized;
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

export function listRevenueEvents(): RevenueAgentEvent[] {
  return getBucket().events.map((event) => ({
    ...event,
    metadata: { ...event.metadata },
  }));
}

export function findEventByDedupeKey(
  dedupeKey: string,
): RevenueAgentEvent | null {
  return listRevenueEvents().find((event) => event.dedupeKey === dedupeKey) ?? null;
}

export function insertRevenueEvent(event: RevenueAgentEvent): RevenueAgentEvent {
  const existing = findEventByDedupeKey(event.dedupeKey);
  if (existing) return existing;
  const bucket = getBucket();
  bucket.events.unshift(event);
  if (bucket.events.length > 5000) bucket.events.length = 5000;
  return event;
}

export function listRevenueVisitors(): RevenueVisitor[] {
  return getBucket().visitors.map((row) => ({ ...row }));
}

export function getRevenueVisitor(visitorId: string): RevenueVisitor | null {
  return listRevenueVisitors().find((row) => row.visitorId === visitorId) ?? null;
}

export function upsertRevenueVisitor(visitor: RevenueVisitor): RevenueVisitor {
  const bucket = getBucket();
  const idx = bucket.visitors.findIndex((row) => row.visitorId === visitor.visitorId);
  if (idx >= 0) bucket.visitors[idx] = visitor;
  else bucket.visitors.unshift(visitor);
  if (bucket.visitors.length > 2000) bucket.visitors.length = 2000;
  return visitor;
}

export function listVisitorUserLinks(): VisitorUserLink[] {
  return getBucket().visitorUserLinks.map((row) => ({ ...row }));
}

export function upsertVisitorUserLink(link: VisitorUserLink): VisitorUserLink {
  const bucket = getBucket();
  const idx = bucket.visitorUserLinks.findIndex(
    (row) => row.userId === link.userId && row.visitorId === link.visitorId,
  );
  if (idx >= 0) bucket.visitorUserLinks[idx] = link;
  else bucket.visitorUserLinks.unshift(link);
  if (bucket.visitorUserLinks.length > 2000) {
    bucket.visitorUserLinks.length = 2000;
  }
  return link;
}

export function getAdSpendYen(): MeasuredNumber {
  return getBucket().adSpendYen;
}

export function setAdSpendYen(amountYen: MeasuredNumber): MeasuredNumber {
  const bucket = getBucket();
  bucket.adSpendYen = amountYen;
  bucket.adSpendUpdatedAt = new Date().toISOString();
  return bucket.adSpendYen;
}

export function replaceRevenueAgentState(input: {
  goals?: RevenueGoals;
  items?: RevenueContent[];
  costs?: GenerationCostRecord[];
  lastGeneratedOn?: string | null;
  events?: RevenueAgentEvent[];
  visitors?: RevenueVisitor[];
  visitorUserLinks?: VisitorUserLink[];
  adSpendYen?: MeasuredNumber;
  adSpendUpdatedAt?: string | null;
}): void {
  const bucket = getBucket();
  if (input.goals) bucket.goals = input.goals;
  if (input.items) bucket.items = input.items.map(normalizeRevenueContent);
  if (input.costs) bucket.costs = input.costs;
  if (input.lastGeneratedOn !== undefined) {
    bucket.lastGeneratedOn = input.lastGeneratedOn;
  }
  if (input.events) bucket.events = input.events;
  if (input.visitors) bucket.visitors = input.visitors;
  if (input.visitorUserLinks) bucket.visitorUserLinks = input.visitorUserLinks;
  if (input.adSpendYen !== undefined) bucket.adSpendYen = input.adSpendYen;
  if (input.adSpendUpdatedAt !== undefined) {
    bucket.adSpendUpdatedAt = input.adSpendUpdatedAt;
  }
}

export function resetRevenueAgentStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasRevenueAgentStore?: Bucket;
  };
  globalScope.__atlasRevenueAgentStore = emptyBucket();
}

export function peekRevenueStoreMeta(): Pick<
  RevenueAgentSnapshot,
  "lastGeneratedOn"
> {
  return { lastGeneratedOn: getBucket().lastGeneratedOn };
}

export function getAdSpendUpdatedAt(): string | null {
  return getBucket().adSpendUpdatedAt;
}
