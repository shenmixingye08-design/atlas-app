"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { applyCompanyTemplateClient } from "@/lib/company-templates/client";
import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { MIHON_SHOWCASE_COMPANIES } from "@/lib/showcase/mihon-definitions";
import {
  fetchMarketplaceCatalog,
  installMarketplacePackage,
} from "@/lib/workflow-marketplace/client";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

import { MihonCompanyCard } from "./mihon-company-card";

export function MihonDashboard() {
  const [activeTemplateId, setActiveTemplateId] =
    useState<CompanyTemplateId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<CompanyTemplateId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchMarketplaceCatalog();
      setActiveTemplateId(catalog.activeTemplateId);
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

  const handleAdd = async (templateId: CompanyTemplateId) => {
    setBusyId(templateId);
    setError(null);
    setShowSuccess(false);

    try {
      applyCompanyTemplateClient(templateId);
      await installMarketplacePackage(templateId);
      setActiveTemplateId(templateId);
      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.installFailed);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-20 animate-fade-up">
      <header className="max-w-xl space-y-4">
        <p className="text-caption">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.mihon.title}</h1>
        <p className="whitespace-pre-line text-body leading-relaxed">
          {ui.mihon.subtitle}
        </p>
      </header>

      {showSuccess && (
        <Card padding="md" className="max-w-md animate-check-in">
          <div className="flex items-start gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-sm text-[var(--status-success)]"
              aria-hidden="true"
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {ui.mihon.addSuccessTitle}
              </p>
              <p className="mt-2 text-body">{ui.mihon.addSuccessPrompt}</p>
              <div className="mt-6">
                <Link href="/workspace">
                  <Button variant="primary" size="md">
                    {ui.mihon.startWork}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {error && <ErrorState message={error} />}

      <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-3">
        {MIHON_SHOWCASE_COMPANIES.map((company, index) => (
          <MihonCompanyCard
            key={company.id}
            company={company}
            index={index}
            isBusy={busyId === company.templateId}
            isActive={
              company.templateId !== undefined &&
              activeTemplateId === company.templateId
            }
            onAdd={handleAdd}
          />
        ))}
      </div>
    </div>
  );
}
