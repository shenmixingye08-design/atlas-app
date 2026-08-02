"use client";

import { useEffect, useState } from "react";

import type { LiveIntegrationsDashboard } from "@/lib/live-integrations/types";

/**
 * Compact home strip — connected / last used / failed / needs reconnect.
 * Additive only; does not replace Today dashboard core.
 */
export function HomeLiveIntegrationsStrip() {
  const [dashboard, setDashboard] = useState<LiveIntegrationsDashboard | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetch("/api/live-integrations", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as { dashboard?: LiveIntegrationsDashboard };
        })
        .then((payload) => {
          if (!cancelled) setDashboard(payload?.dashboard ?? null);
        })
        .catch(() => {
          if (!cancelled) setDashboard(null);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!dashboard) return null;

  const connected = dashboard.services.filter((s) => s.status === "connected");
  const attention = [
    ...dashboard.needsReconnect,
    ...dashboard.failed.filter(
      (s) => !dashboard.needsReconnect.some((n) => n.serviceId === s.serviceId),
    ),
  ];

  return (
    <section
      aria-label="接続サービス"
      className="mx-auto w-full max-w-2xl space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">接続サービス</h2>
        <a
          href="/connections"
          className="text-xs text-accent underline-offset-2 hover:underline"
        >
          接続画面へ
        </a>
      </div>
      <p className="text-xs text-[var(--foreground-muted)]">
        接続中 {connected.length}件
        {dashboard.lastUsed
          ? ` · 最後に使った連携: ${dashboard.lastUsed.label}`
          : ""}
      </p>
      {attention.length > 0 ? (
        <ul className="space-y-2 text-xs">
          {attention.map((service) => (
            <li
              key={service.serviceId}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-foreground">
                {service.label}
                {service.status === "expired"
                  ? "（期限切れ）"
                  : service.status === "insufficient_scope"
                    ? "（権限不足）"
                    : "（再接続必要）"}
              </span>
              {(service.reconnectHref || service.connectHref) && (
                <a
                  href={service.reconnectHref ?? service.connectHref ?? "#"}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  再接続
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--foreground-muted)]">
          失敗した連携はありません
        </p>
      )}
    </section>
  );
}
