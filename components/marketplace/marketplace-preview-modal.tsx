"use client";

import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";
import { getDepartmentLabel, getTemplateDisplayName, ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type MarketplacePreviewModalProps = {
  pkg: WorkflowPackageView | null;
  onClose: () => void;
  onInstall: (templateId: WorkflowPackageView["templateId"]) => void;
  isBusy: boolean;
};

export function MarketplacePreviewModal({
  pkg,
  onClose,
  onInstall,
  isBusy,
}: MarketplacePreviewModalProps) {
  if (!pkg) return null;

  const displayName = getTemplateDisplayName(pkg.templateId, pkg.name);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="marketplace-preview-title"
      onClick={onClose}
    >
      <Card
        padding="lg"
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto animate-fade-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-2xl"
              style={{ backgroundColor: `${pkg.brandColor}14` }}
            >
              {pkg.icon}
            </div>
            <div>
              <h2
                id="marketplace-preview-title"
                className="text-title text-foreground"
              >
                {displayName}
              </h2>
              <p className="mt-1 text-caption">{pkg.tagline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] px-2 py-1 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-subtle)] focus-ring"
            aria-label={ui.actions.close}
          >
            ✕
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
          {pkg.description}
        </p>

        <div className="mt-8 space-y-6">
          <section>
            <h3 className="text-overline">{ui.marketplace.departments}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pkg.contents.departments.map((department) => (
                <span
                  key={department}
                  className="rounded-full bg-[var(--background-subtle)] px-2.5 py-1 text-xs text-foreground"
                >
                  {getDepartmentLabel(department)}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-overline">{ui.marketplace.workflowPresets}</h3>
            <ul className="mt-2 space-y-2">
              {pkg.preview.workflows.map((workflow) => (
                <li
                  key={workflow.id}
                  className="atlas-surface-subtle px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-foreground">{workflow.name}</p>
                  <p className="mt-1 text-caption">{workflow.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-overline">{ui.marketplace.automationPresets}</h3>
            <ul className="mt-2 space-y-2">
              {pkg.preview.automations.map((automation) => (
                <li
                  key={automation.id}
                  className="atlas-surface-subtle px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-foreground">{automation.name}</p>
                  <p className="mt-1 text-caption">{automation.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="text-overline">{ui.marketplace.deliverables}</h3>
              <p className="mt-2 text-sm text-foreground">
                {ui.marketplace.defaultFormats(
                  pkg.contents.deliverableFormats.join(", "),
                )}
              </p>
            </section>
            <section>
              <h3 className="text-overline">{ui.marketplace.qualityProfile}</h3>
              <p className="mt-2 text-sm text-foreground">
                {ui.marketplace.passThreshold(pkg.contents.qualityPassThreshold)}
              </p>
            </section>
            <section>
              <h3 className="text-overline">{ui.marketplace.memoryProfile}</h3>
              <p className="mt-2 text-sm text-foreground">
                {ui.marketplace.historyDays(
                  pkg.preview.memoryPreferences.conversationHistoryDays,
                )}
              </p>
            </section>
            <section>
              <h3 className="text-overline">{ui.integrations.title}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pkg.contents.integrations.map((integration) => (
                  <span
                    key={integration}
                    className="rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-xs text-accent"
                  >
                    {integration.replace("_", " ")}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <section>
            <h3 className="text-overline">{ui.marketplace.researchGuidance}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {pkg.preview.researchGuidance}
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--border)] pt-6">
          {!pkg.isInstalled ? (
            <Button
              variant="primary"
              disabled={isBusy}
              onClick={() => onInstall(pkg.templateId)}
            >
              {ui.marketplace.installPackage}
            </Button>
          ) : (
            <span className="text-sm text-[var(--status-success)] animate-check-in">
              {pkg.isActive
                ? ui.marketplace.installedActive
                : ui.marketplace.installedOnly}
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            {ui.actions.close}
          </Button>
        </div>
      </Card>
    </div>
  );
}
