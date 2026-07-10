"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  SystemPageActions,
  SystemPageLayout,
} from "@/components/system-pages/system-page-layout";
import { SystemPageIcon } from "@/components/system-pages/system-page-icon";
import { Button } from "@/components/ui/button";
import type { MaintenanceModeConfig } from "@/lib/owner/system-status/maintenance";
import { ui } from "@/lib/i18n";

async function fetchMaintenance(): Promise<MaintenanceModeConfig> {
  const response = await fetch("/api/maintenance", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load maintenance info");
  }
  return response.json() as Promise<MaintenanceModeConfig>;
}

function formatRecoveryDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MaintenancePageContent() {
  const [config, setConfig] = useState<MaintenanceModeConfig | null>(null);

  const load = useCallback(async () => {
    try {
      setConfig(await fetchMaintenance());
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const recovery = formatRecoveryDate(config?.estimatedRecoveryAt ?? null);
  const message = config?.message ?? ui.systemPages.maintenanceDefaultMessage;
  const announcement = config?.announcement?.trim();

  return (
    <SystemPageLayout
      icon={<SystemPageIcon variant="maintenance" />}
      badge={ui.systemPages.maintenanceBadge}
      title={ui.systemPages.maintenanceTitle}
      description={message}
    >
      <div className="system-page-card space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--terms-bg)] p-5 text-left shadow-[var(--shadow-sm)] sm:p-6">
        <div>
          <p className="text-sm font-semibold text-[var(--terms-heading)]">
            {ui.systemPages.recoveryEstimate}
          </p>
          <p className="mt-1 text-sm text-[var(--terms-muted)]">
            {recovery ?? ui.systemPages.recoveryUnknown}
          </p>
        </div>

        {announcement ? (
          <div>
            <p className="text-sm font-semibold text-[var(--terms-heading)]">
              {ui.systemPages.operatorAnnouncement}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--terms-body)]">
              {announcement}
            </p>
          </div>
        ) : null}
      </div>

      <SystemPageActions className="mt-6">
        <Link href="/status">
          <Button className="w-full sm:w-auto">{ui.systemPages.viewStatus}</Button>
        </Link>
        <Link href="/">
          <Button variant="secondary" className="w-full sm:w-auto">
            {ui.systemPages.backHome}
          </Button>
        </Link>
      </SystemPageActions>
    </SystemPageLayout>
  );
}
