"use client";

import { useCallback, useEffect, useState } from "react";

import type { ActiveCompanyConfig, CompanyTemplate, CompanyTemplateId } from "@/lib/company-templates/types";
import {
  applyCompanyTemplateClient,
  fetchActiveCompany,
  fetchCompanyTemplates,
  selectCompanyTemplate,
} from "@/lib/company-templates/client";
import { getTemplateDisplayName, ui } from "@/lib/i18n";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SuccessState } from "@/components/ui/success-state";

import { ActiveCompanyCard } from "./active-company-card";
import { CompanyTemplateCard } from "./company-template-card";

export function CompanySelectionDashboard() {
  const [templates, setTemplates] = useState<CompanyTemplate[]>([]);
  const [activeConfig, setActiveConfig] = useState<ActiveCompanyConfig | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<CompanyTemplateId | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [templateList, active] = await Promise.all([
        fetchCompanyTemplates(),
        fetchActiveCompany(),
      ]);
      setTemplates(templateList);
      setActiveConfig(active.config);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ui.error.loadFailed,
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = async (templateId: CompanyTemplateId) => {
    setSelectingId(templateId);
    setError(null);
    setSuccessMessage(null);

    try {
      applyCompanyTemplateClient(templateId);
      const result = await selectCompanyTemplate(templateId);
      setActiveConfig({ ...result.template, selectedAt: result.state.selectedAt });
      const name = getTemplateDisplayName(result.template.id, result.template.name);
      setSuccessMessage(
        `${name} を適用しました。既存のプロジェクトデータは保持されています。${
          result.automationsMerged > 0
            ? `（自動化 ${result.automationsMerged} 件を追加）`
            : ""
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setSelectingId(null);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-12 animate-fade-up">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.company.title}</h1>
        <p className="text-body max-w-2xl">{ui.company.subtitle}</p>
      </header>

      <ActiveCompanyCard config={activeConfig} />

      {error && <ErrorState message={error} />}
      {successMessage && <SuccessState message={successMessage} />}

      <div className="grid gap-6 md:grid-cols-2">
        {templates.map((template, index) => (
          <div
            key={template.id}
            className="animate-fade-up"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <CompanyTemplateCard
              template={template}
              isActive={activeConfig?.id === template.id}
              isSelecting={selectingId === template.id}
              onSelect={handleSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
