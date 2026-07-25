"use client";

import type { DocumentOutlineResponse } from "@/lib/deliverables/client";
import {
  listDocumentThemes,
  type DesignTemplateId,
} from "@/lib/deliverables/document-model";
import { ui } from "@/lib/i18n";

type DocumentLayoutControlsProps = {
  designTemplate: DesignTemplateId;
  onDesignTemplateChange: (template: DesignTemplateId) => void;
  documentOutline: DocumentOutlineResponse | null;
  disabled?: boolean;
};

export function DocumentLayoutControls({
  designTemplate,
  onDesignTemplateChange,
  documentOutline,
  disabled = false,
}: DocumentLayoutControlsProps) {
  const themes = listDocumentThemes();

  return (
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {ui.work.designTemplateLabel}
        </p>
        <p className="text-xs text-[var(--foreground-muted)]">
          {ui.work.designTemplateHint}
        </p>
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
              </button>
            );
          })}
        </div>
      </div>

      {documentOutline ? (
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-sm font-medium text-foreground">
            {ui.work.documentPreviewLabel}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">
            {documentOutline.documentTypeLabel}
            {documentOutline.subtitle ? ` · ${documentOutline.subtitle}` : ""}
          </p>
          <p className="text-base font-semibold text-foreground">
            {documentOutline.title}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {documentOutline.sectionTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-[var(--foreground-muted)]">
          {ui.work.documentPreviewPending}
        </p>
      )}
    </div>
  );
}
