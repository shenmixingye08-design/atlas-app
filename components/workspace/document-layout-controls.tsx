"use client";

import { listSelectableTemplates } from "@/lib/artifact-engine/templates";
import type { ArtifactTemplateId } from "@/lib/artifact-engine/templates/types";
import { ui } from "@/lib/i18n";

type DocumentLayoutControlsProps = {
  designTemplate: ArtifactTemplateId;
  recommendedTemplate?: ArtifactTemplateId | null;
  onDesignTemplateChange: (template: ArtifactTemplateId) => void;
  disabled?: boolean;
};

export function DocumentLayoutControls({
  designTemplate,
  recommendedTemplate,
  onDesignTemplateChange,
  disabled = false,
}: DocumentLayoutControlsProps) {
  const themes = listSelectableTemplates();

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">デザイン</p>
        <p className="text-xs text-[var(--foreground-muted)]">
          {ui.work.designTemplateHint}
          {recommendedTemplate
            ? `（推奨: ${themes.find((theme) => theme.id === recommendedTemplate)?.label ?? recommendedTemplate}）`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {themes.map((theme) => {
          const selected = theme.id === designTemplate;
          return (
            <button
              key={theme.id}
              type="button"
              disabled={disabled}
              onClick={() => onDesignTemplateChange(theme.id)}
              className={
                selected
                  ? "rounded-full bg-accent px-4 py-2 text-sm font-medium text-[var(--accent-foreground)]"
                  : "rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-2 text-sm text-foreground hover:bg-[var(--surface-muted)] disabled:opacity-40"
              }
            >
              {theme.label}
              {recommendedTemplate === theme.id ? " · 推奨" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
