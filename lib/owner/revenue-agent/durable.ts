import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import type { RevenueVisitor, VisitorUserLink } from "./attribution";
import type { RevenueAgentEvent } from "./events";
import {
  getAdSpendUpdatedAt,
  getAdSpendYen,
  getLastGeneratedOn,
  getRevenueGoals,
  listGenerationCosts,
  listRevenueEvents,
  listRevenueItems,
  listRevenueVisitors,
  listVisitorUserLinks,
  replaceRevenueAgentState,
} from "./store";
import type {
  GenerationCostRecord,
  MeasuredNumber,
  RevenueContent,
  RevenueGoals,
} from "./types";

export const REVENUE_AGENT_USER_ID = "__atlas_revenue_agent__";
export const REVENUE_AGENT_DOMAIN_KEY = "atlasRevenueAgent";

type DurablePayload = {
  version: 1;
  updatedAt: string;
  goals: RevenueGoals;
  items: RevenueContent[];
  costs: GenerationCostRecord[];
  lastGeneratedOn: string | null;
  events?: RevenueAgentEvent[];
  visitors?: RevenueVisitor[];
  visitorUserLinks?: VisitorUserLink[];
  adSpendYen?: MeasuredNumber;
  adSpendUpdatedAt?: string | null;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

function buildPayload(): DurablePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    goals: getRevenueGoals(),
    items: listRevenueItems(),
    costs: listGenerationCosts(),
    lastGeneratedOn: getLastGeneratedOn(),
    events: listRevenueEvents(),
    visitors: listRevenueVisitors(),
    visitorUserLinks: listVisitorUserLinks(),
    adSpendYen: getAdSpendYen(),
    adSpendUpdatedAt: getAdSpendUpdatedAt(),
  };
}

export async function persistRevenueAgentNow(): Promise<void> {
  const payload = buildPayload();
  const ok = await upsertSupabaseUserState(
    REVENUE_AGENT_USER_ID,
    REVENUE_AGENT_DOMAIN_KEY,
    { version: 1, updatedAt: payload.updatedAt, payload },
  );
  if (!ok) {
    console.warn(
      "[revenue-agent] durable persist skipped or failed (not treated as saved).",
    );
  }
}

export function schedulePersistRevenueAgent(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistRevenueAgentNow().catch((error) => {
      console.warn("[revenue-agent] persist failed:", error);
    });
  }, 300);
}

export async function ensureRevenueAgentHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const loaded = await loadSupabaseUserState<{
    payload?: DurablePayload;
  }>(REVENUE_AGENT_USER_ID, REVENUE_AGENT_DOMAIN_KEY);

  const root = loaded?.payload as
    | { payload?: DurablePayload }
    | DurablePayload
    | undefined;
  const payload =
    root && "payload" in root && root.payload && "goals" in root.payload
      ? root.payload
      : root && "goals" in (root as object)
        ? (root as DurablePayload)
        : null;

  if (!payload || payload.version !== 1) return;

  replaceRevenueAgentState({
    goals: payload.goals,
    items: payload.items ?? [],
    costs: payload.costs ?? [],
    lastGeneratedOn: payload.lastGeneratedOn ?? null,
    events: payload.events ?? [],
    visitors: payload.visitors ?? [],
    visitorUserLinks: payload.visitorUserLinks ?? [],
    adSpendYen: payload.adSpendYen ?? null,
    adSpendUpdatedAt: payload.adSpendUpdatedAt ?? null,
  });
}

export function resetRevenueAgentHydrationForTests(): void {
  hydrated = false;
}
