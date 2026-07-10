"use client";

import { useCallback, useEffect, useState } from "react";

import { applyCompanyTemplateClient } from "@/lib/company-templates/client";
import {
  fetchMarketplaceCatalog,
  installMarketplacePackage,
} from "@/lib/workflow-marketplace/client";
import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";
import { getTemplateDisplayName, ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

export function MarketplaceDashboard() {
  const [packages, setPackages] = useState<WorkflowPackageView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchMarketplaceCatalog();
      const featured = catalog.sections.featured ?? [];
      const items = featured
        .map((id) => catalog.packages.find((p) => p.templateId === id))
        .filter((p): p is WorkflowPackageView => p !== undefined);
      setPackages(items.length > 0 ? items : catalog.packages.slice(0, 6));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInstall = async (templateId: WorkflowPackageView["templateId"]) => {
    setBusyId(templateId);
    setError(null);
    try {
      await installMarketplacePackage(templateId);
      applyCompanyTemplateClient(templateId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.installFailed);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-16 animate-fade-up">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.marketplace.title}</h1>
        <p className="text-body">{ui.marketplace.subtitle}</p>
      </header>

      {error && <ErrorState message={error} />}

      <div className="grid gap-8 sm:grid-cols-2">
        {packages.map((pkg, index) => (
          <Card
            key={pkg.templateId}
            padding="lg"
            className={`atlas-lift animate-status-in ${index % 3 === 1 ? "delay-75" : index % 3 === 2 ? "delay-100" : ""}`}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl" aria-hidden="true">
                {pkg.icon}
              </span>
              <h2 className="text-title text-foreground">
                {getTemplateDisplayName(pkg.templateId, pkg.name)}
              </h2>
            </div>
            <p className="mt-4 text-body line-clamp-2">{pkg.tagline}</p>
            <div className="mt-8">
              {pkg.isInstalled ? (
                <p className="text-caption">{ui.actions.installed}</p>
              ) : (
                <Button
                  variant="primary"
                  disabled={busyId !== null}
                  isLoading={busyId === pkg.templateId}
                  onClick={() => void handleInstall(pkg.templateId)}
                >
                  {ui.actions.install}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
