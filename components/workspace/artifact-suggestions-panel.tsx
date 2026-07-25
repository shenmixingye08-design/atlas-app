"use client";

import Link from "next/link";

import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";
import { ui } from "@/lib/i18n";

type ArtifactSuggestionsPanelProps = {
  suggestions: readonly ArtifactSuggestion[];
  onRequestExcel?: () => void;
};

function actionHref(kind: ArtifactSuggestion["kind"]): string | null {
  if (kind === "company_profile") return "/settings";
  if (kind === "learning_template") return "/settings/learning";
  return null;
}

/**
 * Post-completion AI-assist tips (rule-based, no LLM).
 */
export function ArtifactSuggestionsPanel({
  suggestions,
  onRequestExcel,
}: ArtifactSuggestionsPanelProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4">
      <p className="text-sm font-semibold text-foreground">
        {ui.work.artifactSuggestionsTitle}
      </p>
      <ul className="space-y-3">
        {suggestions.map((suggestion) => {
          const href = actionHref(suggestion.kind);
          return (
            <li
              key={suggestion.id}
              className="space-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
            >
              <p className="text-sm font-medium text-foreground">
                {suggestion.title}
              </p>
              <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                {suggestion.message}
              </p>
              {suggestion.kind === "excel" && onRequestExcel ? (
                <button
                  type="button"
                  onClick={onRequestExcel}
                  className="text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  {suggestion.actionLabel ?? "Excelを生成"}
                </button>
              ) : null}
              {href && suggestion.actionLabel ? (
                <Link
                  href={href}
                  className="inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  {suggestion.actionLabel}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
