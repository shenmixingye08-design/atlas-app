import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type {
  XAutoPostMode,
  XAutoPostRun,
  XAutoPostRunStatus,
  XAutoPostType,
} from "./autopost-types";

const TABLE = "atlas_x_autopost_runs" as const;

type RunRow = {
  id: string;
  user_id: string;
  slot_key: string;
  scheduled_for: string | null;
  status: string;
  mode: string;
  post_type: string | null;
  text: string | null;
  tweet_id: string | null;
  tweet_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function getMemoryStore(): Map<string, XAutoPostRun> {
  const scope = globalThis as typeof globalThis & {
    __atlasXAutoPostRuns?: Map<string, XAutoPostRun>;
  };
  if (!scope.__atlasXAutoPostRuns) {
    scope.__atlasXAutoPostRuns = new Map();
  }
  return scope.__atlasXAutoPostRuns;
}

function memoryKey(userId: string, slotKey: string): string {
  return `${userId}::${slotKey}`;
}

function rowToRun(row: RunRow): XAutoPostRun {
  return {
    id: row.id,
    userId: row.user_id,
    slotKey: row.slot_key,
    scheduledFor: row.scheduled_for,
    status: (row.status as XAutoPostRunStatus) ?? "processing",
    mode: (row.mode as XAutoPostMode) ?? "approval",
    postType: (row.post_type as XAutoPostType | null) ?? null,
    text: row.text,
    tweetId: row.tweet_id,
    tweetUrl: row.tweet_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ClaimSlotResult =
  | { claimed: true; run: XAutoPostRun }
  | { claimed: false };

/**
 * Atomically claim a scheduled slot. Returns `claimed: false` when the slot was
 * already claimed (unique (user_id, slot_key)) — the key to idempotency: a
 * retried / overlapping cron cannot post the same slot twice.
 */
export async function claimXAutoPostSlot(input: {
  userId: string;
  slotKey: string;
  scheduledFor: string | null;
  mode: XAutoPostMode;
}): Promise<ClaimSlotResult> {
  const nowIso = new Date().toISOString();
  const client = createServiceRoleClientIfConfigured();

  if (!client) {
    const key = memoryKey(input.userId, input.slotKey);
    const store = getMemoryStore();
    if (store.has(key)) return { claimed: false };
    const run: XAutoPostRun = {
      id: crypto.randomUUID(),
      userId: input.userId,
      slotKey: input.slotKey,
      scheduledFor: input.scheduledFor,
      status: "processing",
      mode: input.mode,
      postType: null,
      text: null,
      tweetId: null,
      tweetUrl: null,
      errorMessage: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.set(key, run);
    return { claimed: true, run };
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .insert({
        user_id: input.userId,
        slot_key: input.slotKey,
        scheduled_for: input.scheduledFor,
        status: "processing",
        mode: input.mode,
      })
      .select("*")
      .single();

    if (error) {
      // 23505 = unique_violation -> slot already claimed by a prior tick.
      if (error.code === "23505") return { claimed: false };
      console.warn("[X AutoPost] slot claim failed:", error.message);
      return { claimed: false };
    }
    return { claimed: true, run: rowToRun(data as RunRow) };
  } catch (error) {
    console.warn("[X AutoPost] slot claim skipped");
    if (error instanceof Error) {
      console.warn("[X AutoPost] claim detail:", error.message);
    }
    return { claimed: false };
  }
}

export async function updateXAutoPostRun(
  runId: string,
  patch: Partial<
    Pick<
      XAutoPostRun,
      | "status"
      | "postType"
      | "text"
      | "tweetId"
      | "tweetUrl"
      | "errorMessage"
    >
  >,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const client = createServiceRoleClientIfConfigured();

  if (!client) {
    const store = getMemoryStore();
    for (const [key, run] of store) {
      if (run.id === runId) {
        store.set(key, { ...run, ...patch, updatedAt: nowIso });
        break;
      }
    }
    return;
  }

  try {
    const { error } = await client
      .from(TABLE)
      .update({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.postType !== undefined && { post_type: patch.postType }),
        ...(patch.text !== undefined && { text: patch.text }),
        ...(patch.tweetId !== undefined && { tweet_id: patch.tweetId }),
        ...(patch.tweetUrl !== undefined && { tweet_url: patch.tweetUrl }),
        ...(patch.errorMessage !== undefined && {
          error_message: patch.errorMessage,
        }),
        updated_at: nowIso,
      })
      .eq("id", runId);
    if (error) {
      console.warn("[X AutoPost] run update failed:", error.message);
    }
  } catch (error) {
    console.warn("[X AutoPost] run update skipped");
    if (error instanceof Error) {
      console.warn("[X AutoPost] update detail:", error.message);
    }
  }
}

/** Recent runs for one user (newest first). */
export async function listXAutoPostRuns(
  userId: string,
  limit = 20,
): Promise<XAutoPostRun[]> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return [...getMemoryStore().values()]
      .filter((run) => run.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, limit);
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[X AutoPost] runs list failed:", error.message);
      return [];
    }
    return (data as RunRow[]).map(rowToRun);
  } catch (error) {
    console.warn("[X AutoPost] runs list skipped");
    if (error instanceof Error) {
      console.warn("[X AutoPost] runs detail:", error.message);
    }
    return [];
  }
}

export function resetXAutoPostRunsMemory(): void {
  getMemoryStore().clear();
}
