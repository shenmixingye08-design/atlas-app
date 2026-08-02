"use client";

import { useState, useTransition } from "react";

import type { ProductionOpsDashboardView } from "@/lib/production/types";

function LevelBadge({ level }: { level: string }) {
  const color =
    level === "ok" || level === "true"
      ? "bg-emerald-100 text-emerald-800"
      : level === "warn" || level === "degraded"
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-900";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {level}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

export function ProductionReadinessPanel({
  initialData,
}: {
  initialData: ProductionOpsDashboardView;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/owner/production-readiness", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as ProductionOpsDashboardView;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "load failed");
      }
    });
  };

  const runAction = (action: string) => {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/owner/production-readiness", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const refresh = await fetch("/api/owner/production-readiness", {
          cache: "no-store",
        });
        if (refresh.ok) {
          setData((await refresh.json()) as ProductionOpsDashboardView);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "action failed");
      }
    });
  };

  const latencyList = Array.isArray(data.latency) ? data.latency : [data.latency];

  return (
    <div className="space-y-8" data-testid="production-readiness-panel">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-[var(--brand)]">
          PRODUCTION READINESS · 1000 USERS
        </p>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          運用ダッシュボード
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          CPU / Memory / Queue / Worker / Retry / Failure / Storage / OpenAI /
          Supabase / Cron / Latency (P95/P99)
        </p>
        <div className="flex flex-wrap gap-2">
          <LevelBadge level={data.health.status} />
          <span className="text-xs text-[var(--text-muted)]">
            generated {data.generatedAt}
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="CPU load (1m)" value={data.gauges.cpuLoad1m ?? "—"} />
        <Stat label="Memory %" value={data.gauges.memoryUsagePercent} />
        <Stat label="Heap MB" value={data.gauges.heapUsedMb} />
        <Stat label="Uptime sec" value={data.gauges.uptimeSec} />
        <Stat label="Queue" value={data.queue.queued + data.queue.retrying} />
        <Stat label="Worker running" value={data.counters.workerRunning} />
        <Stat label="Retries" value={data.counters.retries} />
        <Stat label="Failures" value={data.counters.failures} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Health</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.health.components.map((component) => (
            <li
              key={component.id}
              className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{component.id}</span>
                <LevelBadge level={component.status} />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {component.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Monitors</h2>
        <ul className="space-y-2">
          {data.monitors.map((monitor) => (
            <li
              key={monitor.id}
              className="flex items-center justify-between gap-3 rounded border border-[var(--border)] px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{monitor.id}</p>
                <p className="text-xs text-[var(--text-muted)]">{monitor.detail}</p>
              </div>
              <LevelBadge level={monitor.level} />
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="DAU" value={data.analytics.dau} />
        <Stat label="WAU" value={data.analytics.wau} />
        <Stat label="MAU" value={data.analytics.mau} />
        <Stat
          label="Cost / user (USD)"
          value={data.cost.costPerUserUsd ?? "—"}
        />
        <Stat label="OpenAI USD" value={data.cost.openaiUsd} />
        <Stat label="Storage USD" value={data.cost.storageUsd} />
        <Stat label="Bandwidth USD" value={data.cost.bandwidthUsd} />
        <Stat label="Automation USD" value={data.cost.automationUsd} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Latency</h2>
        {latencyList.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">まだサンプルがありません</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {latencyList.map((row) => (
              <li key={row.name}>
                {row.name}: p50={row.p50 ?? "—"} p95={row.p95 ?? "—"} p99=
                {row.p99 ?? "—"} (n={row.count})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Security / Backup / Alerts</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Alert channels:{" "}
          {data.alertChannels.length > 0
            ? data.alertChannels.join(", ")
            : "未設定（Webhook env を追加）"}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Owner gate: {data.security.leastPrivilegeOwnerGate ? "ON" : "OFF"} ·
          Encryption key:{" "}
          {data.security.tokenEncryptionAvailable ? "ON" : "OFF"}
        </p>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)]">
          {data.backup.domains.map((domain) => (
            <li key={domain.id}>
              {domain.label} — {domain.status}
            </li>
          ))}
        </ul>
        {data.security.recommendations.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-amber-800">
            {data.security.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => runAction("self_heal")}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
        >
          Self-heal queue
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => runAction("backup")}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium"
        >
          Backup checkpoint
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => runAction("test_alert")}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium"
        >
          Test alert
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => load()}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium"
        >
          Refresh
        </button>
      </section>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
