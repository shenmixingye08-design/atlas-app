"use client";

import type { FunnelEventName } from "./events";

/**
 * Fire-and-forget client tracker. Never sends prompt/file bodies.
 */
export function trackFunnelClient(
  name: FunnelEventName,
  meta?: Record<string, string | number | boolean | null>
): void {
  try {
    const sessionKey =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("atlas.funnelSession") ??
          (() => {
            const id = `fs_${Math.random().toString(36).slice(2, 10)}`;
            sessionStorage.setItem("atlas.funnelSession", id);
            return id;
          })()
        : null;

    void fetch("/api/product-funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sessionKey, meta }),
      keepalive: true,
    }).catch(() => {
      /* non-blocking */
    });
  } catch {
    /* ignore */
  }
}
