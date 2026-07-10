"use client";

import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";
import { getDepartmentLabel, getTemplateDisplayName, ui } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/design-system/cn";

type MarketplacePackageCardProps = {
  pkg: WorkflowPackageView;
  isBusy: boolean;
  onPreview: (pkg: WorkflowPackageView) => void;
  onInstall: (templateId: WorkflowPackageView["templateId"]) => void;
  onUpdate: (templateId: WorkflowPackageView["templateId"]) => void;
  onRemove: (templateId: WorkflowPackageView["templateId"]) => void;
};

export function MarketplacePackageCard({
  pkg,
  isBusy,
  onPreview,
  onInstall,
  onUpdate,
  onRemove,
}: MarketplacePackageCardProps) {
  const displayName = getTemplateDisplayName(pkg.templateId, pkg.name);

  return (
    <Card
      variant={pkg.isActive ? "elevated" : "interactive"}
      padding="lg"
      className={cn(
        "animate-fade-up relative overflow-hidden",
        pkg.isActive && "ring-2",
      )}
      style={{
        boxShadow: pkg.isActive
          ? `inset 4px 0 0 0 ${pkg.brandColor}, var(--shadow-md)`
          : `inset 4px 0 0 0 ${pkg.brandColor}88`,
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-xl)] text-3xl ring-1 ring-[var(--border)]"
          style={{ backgroundColor: `${pkg.brandColor}18` }}
        >
          {pkg.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{displayName}</h3>
            {pkg.isActive && (
              <Badge
                variant="accent"
                className="uppercase tracking-wide"
                style={{ backgroundColor: `${pkg.brandColor}33`, color: pkg.brandColor }}
              >
                {ui.actions.active}
              </Badge>
            )}
            {pkg.isInstalled && !pkg.isActive && (
              <Badge variant="success">{ui.actions.installed}</Badge>
            )}
            {pkg.hasUpdate && <Badge variant="warning">{ui.actions.update}</Badge>}
          </div>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">{pkg.tagline}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
        {pkg.description}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {pkg.contents.departments.map((department) => (
          <Badge key={department} variant="default">
            {getDepartmentLabel(department)}
          </Badge>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 ring-1 ring-[var(--border)]">
          <p className="text-overline">{ui.marketplace.deliverables}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {pkg.contents.deliverableFormats.join(", ")}
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 ring-1 ring-[var(--border)]">
          <p className="text-overline">{ui.automations.title}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {ui.marketplace.presets(pkg.contents.automationPresets)}
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 ring-1 ring-[var(--border)]">
          <p className="text-overline">{ui.workflow.qa}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {ui.marketplace.qualityPass(pkg.contents.qualityPassThreshold)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isBusy}
          onClick={() => onPreview(pkg)}
        >
          {ui.actions.preview}
        </Button>

        {!pkg.isInstalled ? (
          <Button
            variant="primary"
            size="sm"
            disabled={isBusy}
            isLoading={isBusy}
            onClick={() => onInstall(pkg.templateId)}
            style={{
              background: `linear-gradient(135deg, ${pkg.brandColor}, ${pkg.brandColor}cc)`,
            }}
          >
            {ui.actions.install}
          </Button>
        ) : (
          <>
            {pkg.hasUpdate && (
              <Button
                variant="secondary"
                size="sm"
                disabled={isBusy}
                onClick={() => onUpdate(pkg.templateId)}
                className="text-[var(--status-warning)] ring-[var(--status-warning)]/30"
              >
                {ui.actions.update}
              </Button>
            )}
            {!pkg.isActive && (
              <Button
                variant="primary"
                size="sm"
                disabled={isBusy}
                onClick={() => onInstall(pkg.templateId)}
                style={{
                  background: `linear-gradient(135deg, ${pkg.brandColor}, ${pkg.brandColor}cc)`,
                }}
              >
                {ui.actions.activate}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={isBusy || pkg.isActive}
              onClick={() => onRemove(pkg.templateId)}
              className="hover:text-[var(--status-error)]"
              title={
                pkg.isActive ? ui.marketplace.removeActiveHint : undefined
              }
            >
              {ui.actions.remove}
            </Button>
          </>
        )}
      </div>

      <p className="mt-4 text-caption">
        v{pkg.version} · {pkg.author}
        {pkg.installedVersion
          ? ` · ${ui.marketplace.installedVersion(pkg.installedVersion)}`
          : ""}
      </p>
    </Card>
  );
}
