"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_INTERVAL_MS = 30_000;

/**
 * Keeps the server-rendered owner dashboard current without a manual reload.
 * Re-runs the owner page's server render via `router.refresh()` on an interval
 * and on demand. No mock/demo data is introduced — it simply refetches the same
 * live snapshot the page already renders.
 */
export function OwnerRefreshControl() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastRefreshedAt(new Date());
    });
  }, [router]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-[var(--text-muted)]">
      <span>
        最終更新:{" "}
        {lastRefreshedAt.toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(event) => setAutoRefresh(event.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        自動更新（30秒）
      </label>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="touch-target rounded-full px-4 py-2 text-sm font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-muted)] focus-ring disabled:opacity-60"
      >
        {isPending ? "更新中…" : "最新の状態に更新"}
      </button>
    </div>
  );
}
