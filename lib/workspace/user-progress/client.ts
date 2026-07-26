"use client";

import { useEffect, useState } from "react";

import type { UserProgressSnapshot } from "./types";

const POLL_MS = 900;

export async function startClientProgressSession(input: {
  sessionId: string;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<UserProgressSnapshot | null> {
  const response = await fetch("/api/work-progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return null;
  return (await response.json()) as UserProgressSnapshot;
}

export async function patchClientProgressSession(input: {
  sessionId: string;
  action: "file_generating" | "file_done" | "failed";
}): Promise<UserProgressSnapshot | null> {
  const response = await fetch("/api/work-progress", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return null;
  return (await response.json()) as UserProgressSnapshot;
}

export function useUserFacingProgressPoll(
  sessionId: string | null,
  enabled: boolean,
): UserProgressSnapshot | null {
  const [snapshot, setSnapshot] = useState<UserProgressSnapshot | null>(null);

  useEffect(() => {
    if (!sessionId || !enabled) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch(
          `/api/work-progress?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as UserProgressSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        // Keep last snapshot on transient poll errors.
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId, enabled]);

  return snapshot;
}
