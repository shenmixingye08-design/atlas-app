"use client";

import { useState } from "react";

import {
  installMarketplacePackage,
} from "@/lib/workflow-marketplace/client";
import { applyCompanyTemplateClient } from "@/lib/company-templates/client";
import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";
import { getDepartmentLabel, ui } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type DashboardMarketplaceProps = {
  packages: WorkflowPackageView[];
  onRefresh: () => void;
};

export function DashboardMarketplace({
  packages,
  onRefresh,
}: DashboardMarketplaceProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async (templateId: WorkflowPackageView["templateId"]) => {
    setBusyId(templateId);
    setError(null);
    try {
      await installMarketplacePackage(templateId);
      applyCompanyTemplateClient(templateId);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.installFailed);
    } finally {
      setBusyId(null);
    }
  };

  if (packages.length === 0) return null;

  return (
    <section aria-labelledby="marketplace-heading">
      <h2 id="marketplace-heading" className="text-title text-foreground">
        {ui.marketplace.title}
      </h2>
      <p className="mt-1 text-caption">{ui.marketplace.recommended}</p>

      {error && <ErrorState message={error} className="mt-4" />}

      <div className="mt-5 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
        {packages.map((pkg) => (
          <Card
            key={pkg.templateId}
            variant="interactive"
            padding="md"
            className="min-w-[280px] max-w-[320px] shrink-0 snap-start"
            style={{
              boxShadow: `inset 3px 0 0 0 ${pkg.brandColor}`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] text-2xl"
                style={{ backgroundColor: `${pkg.brandColor}18` }}
              >
                {pkg.icon}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {pkg.name}
                </p>
                <p className="text-caption truncate">{pkg.tagline}</p>
              </div>
            </div>

            <p className="mt-3 line-clamp-2 text-sm text-[var(--foreground-muted)]">
              {pkg.description}
            </p>

            <div className="mt-3 flex flex-wrap gap-1">
              {pkg.contents.departments.slice(0, 3).map((d) => (
                <Badge key={d} variant="default">
                  {getDepartmentLabel(d)}
                </Badge>
              ))}
            </div>

            <div className="mt-4">
              {pkg.isInstalled ? (
                <Badge variant="success">{ui.actions.installed}</Badge>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busyId !== null}
                  isLoading={busyId === pkg.templateId}
                  onClick={() => void handleInstall(pkg.templateId)}
                  style={{
                    background: `linear-gradient(135deg, ${pkg.brandColor}, ${pkg.brandColor}cc)`,
                  }}
                >
                  {ui.actions.install}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
