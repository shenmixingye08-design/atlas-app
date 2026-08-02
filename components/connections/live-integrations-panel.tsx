"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  LiveConnectionStatus,
  LiveIntegrationStatus,
  LiveIntegrationsDashboard,
} from "@/lib/live-integrations/types";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

function statusLabel(status: LiveConnectionStatus): string {
  switch (status) {
    case "connected":
      return "接続済み";
    case "not_connected":
      return "未接続";
    case "expired":
      return "期限切れ";
    case "insufficient_scope":
      return "権限不足";
    case "needs_reconnect":
      return "再接続が必要";
    case "feature_disabled":
      return "利用不可";
    default:
      return "エラー";
  }
}

function formatLastUsed(value: string | null): string {
  if (!value) return "未利用";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未利用";
  return d.toLocaleString("ja-JP");
}

function ServiceRow({ service }: { service: LiveIntegrationStatus }) {
  const href =
    service.status === "connected"
      ? service.connectHref
      : service.reconnectHref ?? service.connectHref;
  const actionLabel =
    service.status === "not_connected"
      ? "接続する"
      : service.status === "insufficient_scope"
        ? "権限を修正する"
        : service.status === "connected"
          ? "管理"
          : "再接続";

  return (
    <article className="space-y-3 border-b border-[var(--border)] py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            {service.label}
          </h3>
          <p className="text-sm text-[var(--foreground-muted)]">
            {service.message}
          </p>
        </div>
        <span className="text-caption font-medium text-foreground">
          {statusLabel(service.status)}
        </span>
      </div>
      <dl className="grid gap-2 text-sm text-[var(--foreground-muted)] sm:grid-cols-2">
        <div>
          <dt className="text-overline">最終利用</dt>
          <dd className="text-foreground">{formatLastUsed(service.lastUsedAt)}</dd>
        </div>
        <div>
          <dt className="text-overline">使用中Automation</dt>
          <dd className="text-foreground">{service.automationCount}件</dd>
        </div>
      </dl>
      {href ? (
        <Button
          variant={service.status === "connected" ? "secondary" : "primary"}
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.assign(href);
            }
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </article>
  );
}

export function LiveIntegrationsPanel() {
  const [dashboard, setDashboard] = useState<LiveIntegrationsDashboard | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live-integrations", { cache: "no-store" });
      if (!res.ok) throw new Error("連携状態を取得できませんでした");
      const payload = (await res.json()) as {
        dashboard?: LiveIntegrationsDashboard;
      };
      setDashboard(payload.dashboard ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!dashboard) return null;

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h2 className="text-title text-foreground">Live Integrations</h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          Automationが外部で仕事を完了するための連携状態です。接続済み{" "}
          {dashboard.connectedCount} / 要対応{" "}
          {dashboard.needsAttentionCount}
        </p>
      </header>
      <div className="divide-y-0">
        {dashboard.services.map((service) => (
          <ServiceRow key={service.serviceId} service={service} />
        ))}
      </div>
    </section>
  );
}
