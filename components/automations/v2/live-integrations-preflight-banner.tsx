"use client";

import { useEffect, useState } from "react";

import type { PreflightIssue, PreflightResult } from "@/lib/live-integrations/types";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";

type LiveIntegrationsPreflightBannerProps = {
  draft: AutomationWizardDraft;
};

/**
 * Shows before create when required live integrations are missing.
 * Example: Dropbox未接続です → 接続する
 */
export function LiveIntegrationsPreflightBanner({
  draft,
}: LiveIntegrationsPreflightBannerProps) {
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  const capabilityIds = draft.steps
    .filter((s) => s.enabled)
    .map((s) => s.type)
    .join(",");

  useEffect(() => {
    if (!capabilityIds) {
      const clearTimer = setTimeout(() => setPreflight(null), 0);
      return () => clearTimeout(clearTimer);
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetch(
        `/api/live-integrations?capabilities=${encodeURIComponent(capabilityIds)}`,
        { cache: "no-store" },
      )
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as { preflight?: PreflightResult };
        })
        .then((payload) => {
          if (!cancelled) setPreflight(payload?.preflight ?? null);
        })
        .catch(() => {
          if (!cancelled) setPreflight(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [capabilityIds]);

  const blockers = (preflight?.issues ?? []).filter(
    (issue) => issue.severity === "block",
  );
  if (blockers.length === 0) return null;

  return (
    <div
      role="alert"
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm"
    >
      <p className="font-medium text-foreground">
        連携の準備が必要です（作成前に接続してください）
      </p>
      <ul className="space-y-2">
        {blockers.map((issue: PreflightIssue) => (
          <li
            key={`${issue.serviceId}-${issue.code}`}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[var(--foreground-muted)]">
              {issue.title}
              {issue.description ? ` — ${issue.description}` : ""}
            </span>
            {issue.actionHref && issue.actionLabel ? (
              <a
                href={issue.actionHref}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                {issue.actionLabel}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
