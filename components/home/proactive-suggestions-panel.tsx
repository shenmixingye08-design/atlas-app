"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { runAutomationNow } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { ui } from "@/lib/i18n";
import {
  dismissProactiveSuggestion,
  filterVisibleProactiveSuggestions,
  generateProactiveSuggestions,
  snoozeProactiveSuggestion,
  type ProactiveSuggestion,
} from "@/lib/proactive-suggestions";
import { loadUserWorkProfile } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type ProactiveSuggestionsPanelProps = {
  automations: Automation[];
  /** When true, renders inside today's dashboard without outer section title. */
  embedded?: boolean;
};

export function ProactiveSuggestionsPanel({
  automations,
  embedded = false,
}: ProactiveSuggestionsPanelProps) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const suggestions = useMemo(() => {
    void refreshKey;
    const generated = generateProactiveSuggestions({
      automations,
      profile: loadUserWorkProfile(),
    });
    return filterVisibleProactiveSuggestions(generated).filter(
      (item) => !hiddenIds.includes(item.id),
    );
  }, [automations, hiddenIds, refreshKey]);

  const hideLocally = useCallback((id: string) => {
    setHiddenIds((prev) => [...prev, id]);
    setRefreshKey((value) => value + 1);
  }, []);

  const handleRunNow = async (suggestion: ProactiveSuggestion) => {
    setError(null);
    setRunningId(suggestion.id);

    try {
      if (suggestion.action.automationId) {
        await runAutomationNow(suggestion.action.automationId);
        hideLocally(suggestion.id);
        return;
      }

      const assignment = suggestion.action.workspaceAssignment;
      if (assignment) {
        router.push(`/workspace?assignment=${encodeURIComponent(assignment)}`);
        hideLocally(suggestion.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setRunningId(null);
    }
  };

  const handleLater = (id: string) => {
    snoozeProactiveSuggestion(id);
    hideLocally(id);
  };

  const handleDismiss = (id: string) => {
    dismissProactiveSuggestion(id);
    hideLocally(id);
  };

  if (suggestions.length === 0 && !error) {
    if (embedded) {
      return (
        <p className="text-sm text-[var(--foreground-muted)] sm:text-base">
          {ui.todayDashboard.empty.suggestions}
        </p>
      );
    }
    return null;
  }

  const content = (
    <>
      {error && <ErrorState message={error} />}

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion.id}
            padding="lg"
            className={
              embedded
                ? "border-[var(--border-subtle)] bg-[var(--background-subtle)]"
                : "border-accent/15 bg-gradient-to-br from-accent/[0.04] to-white shadow-[var(--shadow-soft)]"
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-accent">
                  {ui.proactiveSuggestions.badge}
                </p>
                <p className="text-base leading-relaxed text-foreground">
                  {suggestion.message}
                </p>
                {suggestion.automationName && (
                  <p className="text-caption text-[var(--foreground-muted)]">
                    {ui.proactiveSuggestions.linkedHabit(suggestion.automationName)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={runningId === suggestion.id}
                  disabled={runningId !== null && runningId !== suggestion.id}
                  onClick={() => void handleRunNow(suggestion)}
                >
                  {ui.proactiveSuggestions.runNow}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={runningId === suggestion.id}
                  onClick={() => handleLater(suggestion.id)}
                >
                  {ui.proactiveSuggestions.later}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={runningId === suggestion.id}
                  onClick={() => handleDismiss(suggestion.id)}
                >
                  {ui.proactiveSuggestions.dismiss}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div>
        {content}
      </div>
    );
  }

  return (
    <section aria-labelledby="proactive-suggestions-heading" className="space-y-4">
      <div>
        <h2 id="proactive-suggestions-heading" className="text-title text-foreground">
          {ui.proactiveSuggestions.title}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.proactiveSuggestions.subtitle}
        </p>
      </div>

      {content}
    </section>
  );
}
