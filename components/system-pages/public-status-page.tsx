"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SystemPageIcon } from "@/components/system-pages/system-page-icon";
import type {
  SystemServiceSnapshot,
  SystemServiceStatus,
  SystemStatusSnapshot,
} from "@/lib/owner/system-status/types";
import { cn } from "@/lib/design-system/cn";
import { formatOwnerPercent } from "@/lib/owner/format";
import { ui } from "@/lib/i18n";

async function fetchStatus(): Promise<SystemStatusSnapshot> {
  const response = await fetch("/api/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load status");
  }
  return response.json() as Promise<SystemStatusSnapshot>;
}

const STATUS_LABELS: Record<SystemServiceStatus, string> = {
  operational: ui.systemPages.statusOperational,
  outage: ui.systemPages.statusOutage,
  maintenance: ui.systemPages.statusMaintenance,
};

const STATUS_CLASSES: Record<SystemServiceStatus, string> = {
  operational: "bg-[var(--success-bg)] text-[var(--success)]",
  outage: "bg-[var(--error-bg)] text-[var(--error)]",
  maintenance: "bg-[var(--warning-bg)] text-[var(--warning)]",
};

function computeOverallUptime(services: readonly SystemServiceSnapshot[]): number {
  if (services.length === 0) return 99.95;
  const total = services.reduce((sum, service) => sum + service.uptimePercent, 0);
  return Math.round((total / services.length) * 100) / 100;
}

function StatusRow({ service }: { service: SystemServiceSnapshot }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-4 last:border-b-0">
      <div className="min-w-0 text-left">
        <p className="font-medium text-[var(--terms-heading)]">{service.label}</p>
        <p className="mt-0.5 text-xs text-[var(--terms-muted)]">
          {ui.systemPages.uptimeLabel}: {formatOwnerPercent(service.uptimePercent)}
          {service.isEstimated ? ` (${ui.systemPages.estimated})` : ""}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex rounded-full px-3 py-1 text-xs font-medium",
          STATUS_CLASSES[service.status],
        )}
      >
        {STATUS_LABELS[service.status]}
      </span>
    </div>
  );
}

export function PublicStatusPageContent() {
  const [snapshot, setSnapshot] = useState<SystemStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSnapshot(await fetchStatus());
      setError(null);
    } catch {
      setError(ui.systemPages.statusLoadError);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const overallUptime = snapshot ? computeOverallUptime(snapshot.services) : null;

  return (
    <div className="terms-page system-page min-h-screen bg-[var(--terms-bg)] text-[var(--terms-heading)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--terms-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-500/20">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-base font-semibold tracking-tight">{ui.brand}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--terms-toc-hover-bg)]">
            <SystemPageIcon variant="status" className="h-10 w-10" />
          </div>
          <p className="text-sm font-medium text-[var(--terms-accent)]">
            {ui.systemPages.statusBadge}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {ui.systemPages.statusTitle}
          </h1>
          <p className="mt-3 text-base text-[var(--terms-muted)]">
            {ui.systemPages.statusIntro}
          </p>
          {overallUptime !== null ? (
            <p className="mt-4 text-sm text-[var(--terms-muted)]">
              {ui.systemPages.overallUptime}:{" "}
              <span className="font-semibold text-[var(--terms-heading)]">
                {formatOwnerPercent(overallUptime)}
              </span>
            </p>
          ) : null}
        </div>

        <div className="system-page-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--terms-bg)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
          {error ? (
            <p className="text-sm text-[var(--error)]">{error}</p>
          ) : !snapshot ? (
            <p className="text-sm text-[var(--terms-muted)]">{ui.systemPages.statusLoading}</p>
          ) : (
            <>
              {snapshot.issueCount > 0 ? (
                <p className="mb-4 rounded-xl bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
                  {ui.systemPages.statusIssueAlert(snapshot.issueCount)}
                </p>
              ) : null}
              <div>
                {snapshot.services.map((service) => (
                  <StatusRow key={service.serviceId} service={service} />
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--terms-muted)]">
                {ui.systemPages.statusUpdated(
                  new Date(snapshot.generatedAt).toLocaleString("ja-JP"),
                )}
              </p>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
          <Link href="/contact" className="text-[var(--terms-accent)] hover:underline">
            {ui.systemPages.contact}
          </Link>
          <Link href="/maintenance" className="text-[var(--terms-accent)] hover:underline">
            {ui.systemPages.maintenanceInfo}
          </Link>
        </div>
      </main>
    </div>
  );
}
