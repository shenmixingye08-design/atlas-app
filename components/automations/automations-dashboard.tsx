"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { Automation } from "@/lib/automations/types";
import { prefillFromAssignment } from "@/lib/automations/detect-recurring";
import { defaultAutomationFormState } from "@/lib/automations/form-utils";
import { summarizeEntrustedJobs } from "@/lib/automations/display";
import { ui } from "@/lib/i18n";
import {
  fetchAutomations,
  runAutomationNow,
  setAutomationEnabled,
} from "@/lib/automations/client";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { AutomationCard } from "./automation-card";
import { AutomationDetailPanel } from "./automation-detail-panel";
import { CreateAutomationForm } from "./create-automation-form";

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
  const selectedIdParam = searchParams.get("id");
  const openedIdRef = useRef<string | null>(null);
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
  const [selected, setSelected] = useState<Automation | null>(null);

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
      setSelected((current) => {
        if (!current) return null;
        return items.find((item) => item.id === current.id) ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

  // Notification deep link (/automations?id=...) opens the exact automation's
  // detail panel once loaded, so「結果を見る」lands on the right item.
  useEffect(() => {
    if (!selectedIdParam || automations.length === 0) return;
    if (openedIdRef.current === selectedIdParam) return;
    const match = automations.find((item) => item.id === selectedIdParam);
    if (match) {
      openedIdRef.current = selectedIdParam;
      setSelected(match);
    }
  }, [selectedIdParam, automations]);

  const summary = useMemo(
    () => summarizeEntrustedJobs(automations),
    [automations],
  );

  const handleToggle = async (id: string, enabled: boolean) => {
    setUpdatingId(id);
    try {
      const updated = await setAutomationEnabled(id, enabled);
      setAutomations((prev) =>
        prev.map((item) => (item.id === id ? updated : item)),
      );
      setSelected((current) =>
        current?.id === id ? updated : current,
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

  if (isLoading && !showCreate && automations.length === 0) {
    return <LoadingState />;
  }

  const summaryCards = [
    { label: ui.entrustedJobs.summaryScheduled, value: summary.scheduled },
    { label: ui.entrustedJobs.summaryNeedsReview, value: summary.needsReview },
    { label: ui.entrustedJobs.summaryCompleted, value: summary.completed },
    { label: ui.entrustedJobs.summaryPaused, value: summary.paused },
  ] as const;

  return (
    <div className="space-y-10 sm:space-y-12 animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-accent">{ui.brand}</p>
          <h1 className="text-display text-foreground">
            {ui.entrustedJobs.title}
          </h1>
          <p className="text-body max-w-2xl text-[var(--text-secondary)]">
            {ui.entrustedJobs.subtitle}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 self-start sm:items-end">
          <Link
            href="/workspace"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-base font-medium text-white shadow-sm transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] focus-ring"
          >
            {ui.entrustedJobs.addNew}
          </Link>
          <Link
            href="/commander"
            className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card)] px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/40 focus-ring"
          >
            {ui.nav.commander}
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((item) => (
          <Card
            key={item.label}
            padding="md"
            className="border border-[var(--border-subtle)] bg-[var(--card)] text-center"
          >
            <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {item.value}
              <span className="ml-1 text-sm font-medium text-[var(--text-secondary)]">
                {ui.entrustedJobs.countSuffix}
              </span>
            </p>
          </Card>
        ))}
      </section>

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

      <section className="space-y-4">
        {isLoading ? (
          <LoadingState />
        ) : automations.length === 0 && !showCreate ? (
          <Card
            padding="lg"
            className="border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 px-6 py-14 text-center"
          >
            <h2 className="text-title text-foreground">
              {ui.entrustedJobs.emptyTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-body text-[var(--text-secondary)]">
              {ui.entrustedJobs.emptyDescription}
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/workspace"
                className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-white hover:bg-[var(--accent-hover)] focus-ring"
              >
                {ui.entrustedJobs.emptyCta}
              </Link>
              <Button
                variant="secondary"
                className="min-h-[48px]"
                onClick={() => setShowCreate(true)}
              >
                {ui.entrustedJobs.registerHere}
              </Button>
            </div>
          </Card>
        ) : (
          <ul className="space-y-4">
            {automations.map((automation) => (
              <li key={automation.id}>
                <AutomationCard
                  automation={automation}
                  onOpen={setSelected}
                  onToggleEnabled={(id, enabled) => void handleToggle(id, enabled)}
                  isUpdating={updatingId === automation.id}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <AutomationDetailPanel
          automation={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setAutomations((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item)),
            );
            setSelected(updated);
          }}
          onRunNow={(id) => void handleRunNow(id)}
          onToggleEnabled={(id, enabled) => void handleToggle(id, enabled)}
          isRunning={runningId === selected.id}
          isUpdating={updatingId === selected.id}
        />
      )}
    </div>
  );
}
