"use client";

import type { FunnelEventName } from "./events";

function detectDeviceType(): string {
  if (typeof window === "undefined") return "unknown";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/**
 * Fire-and-forget client tracker. Never sends prompt/file bodies.
 */
export function trackFunnelClient(
  name: FunnelEventName,
  meta?: Record<string, string | number | boolean | null>,
  extras?: {
    requestId?: string | null;
    jobId?: string | null;
    artifactId?: string | null;
    previousScreen?: string | null;
    currentScreen?: string | null;
    errorCode?: string | null;
    durationMs?: number | null;
  }
): void {
  try {
    const sessionId =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("atlas.funnelSession") ??
          (() => {
            const id = `fs_${Math.random().toString(36).slice(2, 10)}`;
            sessionStorage.setItem("atlas.funnelSession", id);
            return id;
          })()
        : null;

    const anonymousUserId =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("atlas.anonFunnelId") ??
          (() => {
            const id = `anon_${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem("atlas.anonFunnelId", id);
            return id;
          })()
        : null;

    void fetch("/api/product-funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        sessionId,
        anonymousUserId,
        deviceType: detectDeviceType(),
        viewport:
          typeof window !== "undefined"
            ? `${window.innerWidth}x${window.innerHeight}`
            : null,
        requestId: extras?.requestId ?? meta?.requestId ?? null,
        jobId: extras?.jobId ?? meta?.jobId ?? null,
        artifactId: extras?.artifactId ?? meta?.artifactId ?? null,
        previousScreen: extras?.previousScreen ?? null,
        currentScreen:
          extras?.currentScreen ??
          (typeof window !== "undefined" ? window.location.pathname : null),
        errorCode: extras?.errorCode ?? meta?.code ?? null,
        durationMs: extras?.durationMs ?? null,
        meta,
      }),
      keepalive: true,
    }).catch(() => {
      /* non-blocking */
    });
  } catch {
    /* ignore */
  }
}
