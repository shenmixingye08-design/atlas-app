"use client";

import Link from "next/link";

import type { ActiveCompanyConfig } from "@/lib/company-templates/types";
import { formatDashboardClock } from "@/lib/dashboard/utils";
import { getGreeting, ui } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";

type DashboardHeaderProps = {
  company: ActiveCompanyConfig | null;
  automationEnabled: number;
  automationTotal: number;
  onNewProject: () => void;
};

export function DashboardHeader({
  company,
  automationEnabled,
  automationTotal,
  onNewProject,
}: DashboardHeaderProps) {
  return (
    <header className="animate-fade-up space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-display text-gradient sm:text-[2.75rem]">
            {getGreeting()}
          </p>
          <p className="text-lg text-[var(--foreground-muted)] sm:text-xl">
            {ui.dashboard.aiReady}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--foreground-muted)]">
          <span className="rounded-[var(--radius-lg)] bg-white/[0.04] px-3 py-2 ring-1 ring-[var(--border)] tabular-nums">
            {formatDashboardClock()}
          </span>
          <Badge
            variant={automationEnabled > 0 ? "success" : "default"}
            className="px-3 py-1"
          >
            {ui.dashboard.automationsActive(automationEnabled, automationTotal)}
          </Badge>
        </div>
      </div>

      {company && (
        <div
          className="flex flex-col gap-4 rounded-[var(--radius-2xl)] border border-[var(--border)] bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
          style={{ boxShadow: `inset 4px 0 0 0 ${company.brandColor}` }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-xl)] text-2xl ring-1 ring-[var(--border)]"
              style={{ backgroundColor: `${company.brandColor}18` }}
            >
              {company.icon}
            </div>
            <div>
              <p className="text-overline">{ui.dashboard.currentCompany}</p>
              <p className="text-title text-foreground">{company.name}</p>
              <p className="mt-0.5 text-caption">
                {company.enabledDepartments.length} {ui.dashboard.departments} ·{" "}
                {ui.marketplace.passThreshold(company.qualityCriteria.passThreshold)}
              </p>
            </div>
          </div>
          <Link href="/company">
            <Button variant="secondary" size="sm">
              {ui.dashboard.switchCompany}
            </Button>
          </Link>
        </div>
      )}

      <nav
        className="flex flex-wrap gap-2"
        aria-label={ui.nav.menu}
      >
        <Button variant="primary" onClick={onNewProject}>
          {ui.dashboard.newProject}
        </Button>
        <Link href="/workspace">
          <Button variant="secondary">{ui.dashboard.openWorkspace}</Button>
        </Link>
        <Link href="/mihon">
          <Button variant="ghost" className={cn("ring-1 ring-[var(--border)]")}>
            {ui.nav.marketplace}
          </Button>
        </Link>
      </nav>
    </header>
  );
}
