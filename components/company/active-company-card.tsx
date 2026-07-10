"use client";

import Link from "next/link";

import type { ActiveCompanyConfig } from "@/lib/company-templates/types";
import { getTemplateDisplayName, ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ActiveCompanyCardProps = {
  config: ActiveCompanyConfig | null;
  compact?: boolean;
};

export function ActiveCompanyCard({ config, compact = false }: ActiveCompanyCardProps) {
  if (!config) {
    return (
      <Card padding="md">
        <p className="text-body">{ui.loading}</p>
      </Card>
    );
  }

  const displayName = getTemplateDisplayName(config.id, config.name);

  return (
    <Card
      padding="md"
      className="atlas-lift"
      style={{
        boxShadow: `inset 4px 0 0 0 ${config.brandColor}, var(--shadow-md)`,
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-2xl"
            style={{ backgroundColor: `${config.brandColor}14` }}
          >
            {config.icon}
          </div>
          <div>
            <p className="text-overline">{ui.company.activeLabel}</p>
            <h2 className="mt-1 text-title text-foreground">{displayName}</h2>
            {!compact && (
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                {config.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-caption">
              <span className="rounded-full bg-[var(--background-subtle)] px-2.5 py-1">
                {ui.company.departments(config.enabledDepartments.length)}
              </span>
              <span className="rounded-full bg-[var(--background-subtle)] px-2.5 py-1">
                {ui.company.qualityThreshold(config.qualityCriteria.passThreshold)}
              </span>
              <span className="rounded-full bg-[var(--background-subtle)] px-2.5 py-1">
                {ui.company.automations(config.automationPresets.length)}
              </span>
            </div>
          </div>
        </div>

        <Link href="/company">
          <Button variant="secondary" size="sm">
            {ui.company.changeTemplate}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
