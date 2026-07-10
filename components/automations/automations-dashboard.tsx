"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { Automation } from "@/lib/automations/types";
import { prefillFromAssignment } from "@/lib/automations/detect-recurring";
import { defaultAutomationFormState } from "@/lib/automations/form-utils";
import { ui } from "@/lib/i18n";
import {
  fetchAutomations,
  runAutomationNow,
  setAutomationEnabled,
} from "@/lib/automations/client";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";

import { AutomationCard } from "./automation-card";
import { AutomationLevelSettings } from "./automation-level-settings";
import { AutomationModeSettings } from "./automation-mode-settings";
import { AutomationWorkflowSettings } from "./automation-workflow-settings";
import { CreateAutomationForm } from "./create-automation-form";
import { ActiveCompanyCard } from "@/components/company/active-company-card";
import { useActiveCompany } from "@/lib/company-templates/use-active-company";

function parseInitialFormFromSearchParams(
  params: URLSearchParams,
): ReturnType<typeof defaultAutomationFormState> | null {
  if (params.get("create") !== "1") return null;

  const assignment = params.get("assignment") ?? "";
  const base = assignment
    ? prefillFromAssignment(assignment)
    : defaultAutomationFormState();

  return defaultAutomationFormState({
    ...base,
    title: params.get("title") ?? base.title,
    assignment: assignment || base.assignment,
    frequency:
      (params.get("frequency") as "daily" | "weekly" | "monthly" | null) ??
      base.frequency,
    hour: params.get("hour") ? Number.parseInt(params.get("hour")!, 10) : base.hour,
    minute: params.get("minute")
      ? Number.parseInt(params.get("minute")!, 10)
      : base.minute,
    dayOfWeek: params.get("dayOfWeek")
      ? Number.parseInt(params.get("dayOfWeek")!, 10)
      : base.dayOfWeek,
    dayOfMonth: params.get("dayOfMonth")
      ? Number.parseInt(params.get("dayOfMonth")!, 10)
      : base.dayOfMonth,
  });
}

export function AutomationsDashboard() {
  const searchParams = useSearchParams();
  const initialForm = useMemo(
    () => parseInitialFormFromSearchParams(searchParams),
    [searchParams],
  );

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(initialForm));
  const [createInitialState, setCreateInitialState] = useState(initialForm);
  const { config: activeCompany } = useActiveCompany();

  useEffect(() => {
    if (initialForm) {
      setShowCreate(true);
      setCreateInitialState(initialForm);
    }
  }, [initialForm]);

  const loadAutomations = useCallback(async () => {
    try {
      const items = await fetchAutomations();
      setAutomations(items);
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
    void loadAutomations();
  }, [loadAutomations]);

  const handleToggle = async (id: string, enabled: boolean) => {
    setUpdatingId(id);
    try {
      const updated = await setAutomationEnabled(id, enabled);
      setAutomations((prev) =>
        prev.map((item) => (item.id === id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    setError(null);

    setAutomations((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "running" as const } : item,
      ),
    );

    try {
      await runAutomationNow(id);
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.runFailed);
      await loadAutomations();
    } finally {
      setRunningId(null);
    }
  };

  const handleCreated = async () => {
    setShowCreate(false);
    setCreateInitialState(null);
    setIsLoading(true);
    await loadAutomations();
  };

  const activeCount = automations.filter((item) => item.enabled).length;

  if (isLoading && !showCreate) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-12 animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-accent">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.habits.title}</h1>
          <p className="text-body max-w-2xl">{ui.habits.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex w-fit rounded-full bg-[var(--background-subtle)] px-3 py-1.5 text-caption">
            {ui.automations.enabled(activeCount, automations.length)}
          </span>
          {!showCreate && (
            <Button variant="primary" className="w-full sm:w-auto" onClick={() => setShowCreate(true)}>
              {ui.habits.addHabit}
            </Button>
          )}
        </div>
      </header>

      <ActiveCompanyCard config={activeCompany} compact />

      {showCreate && (
        <CreateAutomationForm
          initialState={createInitialState ?? undefined}
          onCreated={() => void handleCreated()}
          onCancel={() => {
            setShowCreate(false);
            setCreateInitialState(null);
          }}
        />
      )}

      {error && <ErrorState message={error} />}

      <AutomationLevelSettings
        automations={automations}
        onUpdated={(updated) =>
          setAutomations((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          )
        }
      />

      <AutomationModeSettings
        automations={automations}
        onUpdated={(updated) =>
          setAutomations((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          )
        }
      />

      <AutomationWorkflowSettings
        automations={automations}
        onUpdated={(updated) =>
          setAutomations((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          )
        }
      />

      <div className="space-y-4">
        {isLoading ? (
          <LoadingState />
        ) : automations.length === 0 ? (
          <p className="rounded-[var(--radius-2xl)] bg-[var(--background-subtle)] px-6 py-16 text-center text-body">
            {ui.habits.empty}
          </p>
        ) : (
          automations.map((automation, index) => (
            <div
              key={automation.id}
              className="animate-fade-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <AutomationCard
                automation={automation}
                onToggleEnabled={handleToggle}
                onRunNow={handleRunNow}
                isRunning={runningId === automation.id}
                isUpdating={updatingId === automation.id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
