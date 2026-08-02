/**
 * Memory version history + undo (append-only, in-process with optional durable).
 */

import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";

export type MemoryVersionEvent = {
  id: string;
  at: string;
  memoryId: string;
  userId: string;
  action:
    | "created"
    | "approved"
    | "updated"
    | "paused"
    | "deleted"
    | "undo"
    | "promoted";
  approvedBy: string | null;
  snapshot: PersonalMemoryRecord | null;
  note: string | null;
};

const MAX_EVENTS = 500;

function getEvents(): MemoryVersionEvent[] {
  const scope = globalThis as typeof globalThis & {
    __atlasMemoryVersions?: MemoryVersionEvent[];
  };
  if (!scope.__atlasMemoryVersions) scope.__atlasMemoryVersions = [];
  return scope.__atlasMemoryVersions;
}

export function resetMemoryVersionsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasMemoryVersions?: MemoryVersionEvent[];
  };
  scope.__atlasMemoryVersions = [];
}

export function recordMemoryVersion(input: {
  memoryId: string;
  userId: string;
  action: MemoryVersionEvent["action"];
  snapshot?: PersonalMemoryRecord | null;
  approvedBy?: string | null;
  note?: string | null;
}): MemoryVersionEvent {
  const event: MemoryVersionEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    memoryId: input.memoryId,
    userId: input.userId,
    action: input.action,
    approvedBy: input.approvedBy ?? null,
    snapshot: input.snapshot ? structuredClone(input.snapshot) : null,
    note: input.note ?? null,
  };
  const buf = getEvents();
  buf.unshift(event);
  if (buf.length > MAX_EVENTS) buf.length = MAX_EVENTS;
  return event;
}

export function listMemoryVersions(input: {
  userId: string;
  memoryId?: string;
  limit?: number;
}): MemoryVersionEvent[] {
  const limit = input.limit ?? 50;
  return getEvents()
    .filter((event) => {
      if (event.userId !== input.userId) return false;
      if (input.memoryId && event.memoryId !== input.memoryId) return false;
      return true;
    })
    .slice(0, limit);
}

/** Find last snapshot before a delete/pause for undo. */
export function findUndoSnapshot(input: {
  userId: string;
  memoryId: string;
}): PersonalMemoryRecord | null {
  const events = listMemoryVersions({
    userId: input.userId,
    memoryId: input.memoryId,
    limit: 20,
  });
  for (const event of events) {
    if (
      event.snapshot &&
      (event.action === "created" ||
        event.action === "approved" ||
        event.action === "updated" ||
        event.action === "promoted")
    ) {
      return structuredClone(event.snapshot);
    }
  }
  return null;
}
