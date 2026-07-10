"use client";

import type { CompanyTemplate, CompanyTemplateId } from "@/lib/company-templates/types";
import { getDepartmentLabel, getTemplateDisplayName, ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type CompanyTemplateCardProps = {
  template: CompanyTemplate;
  isActive: boolean;
  isSelecting: boolean;
  onSelect: (id: CompanyTemplateId) => void;
};

export function CompanyTemplateCard({
  template,
  isActive,
  isSelecting,
  onSelect,
}: CompanyTemplateCardProps) {
  const displayName = getTemplateDisplayName(template.id, template.name);

  return (
    <Card
      variant={isActive ? "elevated" : "interactive"}
      padding="lg"
      className="h-full"
      style={{
        boxShadow: isActive
          ? `inset 4px 0 0 0 ${template.brandColor}, var(--shadow-md)`
          : `inset 4px 0 0 0 ${template.brandColor}66, var(--shadow-md)`,
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-2xl"
          style={{ backgroundColor: `${template.brandColor}14` }}
        >
          {template.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{displayName}</h2>
            {isActive && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: template.brandColor }}
              >
                {ui.actions.active}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {template.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {template.enabledDepartments.map((department) => (
          <span
            key={department}
            className="rounded-full bg-[var(--background-subtle)] px-2 py-0.5 text-[10px] text-[var(--foreground-muted)]"
          >
            {getDepartmentLabel(department)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="atlas-surface-subtle px-3 py-2">
          <p className="text-overline">{ui.marketplace.deliverables}</p>
          <p className="mt-1 font-medium text-foreground">
            {template.deliverables.defaultFormats.join(", ").toUpperCase()}
          </p>
        </div>
        <div className="atlas-surface-subtle px-3 py-2">
          <p className="text-overline">{ui.marketplace.workflowPresets}</p>
          <p className="mt-1 font-medium text-foreground">
            {ui.marketplace.presets(template.defaultWorkflows.length)}
          </p>
        </div>
        <div className="atlas-surface-subtle px-3 py-2">
          <p className="text-overline">{ui.automations.title}</p>
          <p className="mt-1 font-medium text-foreground">
            {ui.marketplace.presets(template.automationPresets.length)}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={isActive || isSelecting}
        onClick={() => onSelect(template.id)}
        className="mt-6 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all duration-[var(--motion-base)] hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-ring"
        style={{
          background: isActive
            ? "var(--background-subtle)"
            : `linear-gradient(135deg, ${template.brandColor}, ${template.brandColor}dd)`,
          color: isActive ? "var(--foreground-muted)" : "white",
        }}
      >
        {isActive
          ? ui.actions.currentTemplate
          : isSelecting
            ? ui.actions.selecting
            : ui.actions.select}
      </button>
    </Card>
  );
}
