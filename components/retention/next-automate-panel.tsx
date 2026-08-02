"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import {
  buildNextAutomateSuggestions,
  trackRetentionEvent,
} from "@/lib/retention";

export function NextAutomatePanel({ automations }: { automations: Automation[] }) {
  const suggestions = useMemo(
    () => buildNextAutomateSuggestions({ automations }),
    [automations],
  );

  if (suggestions.length === 0) return null;

  return (
    <section
      aria-labelledby="retention-next-automate-heading"
      className="space-y-3"
      data-testid="retention-next-automate"
    >
      <div>
        <h2
          id="retention-next-automate-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          次はこれを自動化できます
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          使っていない機能だけを提案します。
        </p>
      </div>
      <ul className="space-y-2">
        {suggestions.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={() =>
                trackRetentionEvent("retention_suggestion_clicked", {
                  id: item.id,
                })
              }
              className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {item.title}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{item.reason}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
