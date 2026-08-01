"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { Automation } from "@/lib/automations/types";
import type { AutomationV2 } from "@/lib/automation-platform/types";
import { prefillFromAssignment } from "@/lib/automations/detect-recurring";
import { defaultAutomationFormState } from "@/lib/automations/form-utils";
import { summarizeEntrustedJobs } from "@/lib/automations/display";
import { ui } from "@/lib/i18n";
import {
  fetchAutomations,
  runAutomationNow,
  setAutomationEnabled,
} from "@/lib/automations/client";
import {
  archiveAutomationV2,
  duplicateAutomationV2,
  fetchAutomationsV2,
  pauseAutomationV2,
  resumeAutomationV2,
  runAutomationV2,
} from "@/lib/automation-platform/client";
import { fetchFeatureAvailability } from "@/lib/feature-flags/client";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { AutomationCard } from "./automation-card";
import { AutomationDetailPanel } from "./automation-detail-panel";
import { CreateAutomationForm } from "./create-automation-form";
import { AutomationV2Card } from "./v2/automation-v2-card";

function parseInitialFormFromSearchParams(
  params: URLSearchParams,
): ReturnType<typeof defaultAutomationFormState> | null {
  if (params.get("create") !== "1") return null;

  const assignment = params.get("assignment") ?? "";
  const destinationParam = params.get("destination");
  const base = assignment
    ? prefillFromAssignment(assignment)
    : defaultAutomationFormState();

  return defaultAutomationFormState({
    ...base,
    title: params.get("title") ?? base.title,
    assignment: assignment || base.assignment,
    destination: destinationParam === "x" ? "x" : base.destination,
    frequency:
      (params.get("frequency") as
        | "daily"
        | "weekly"
        | "monthly"
        | "weekday"
        | "custom"
        | null) ?? base.frequency,
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
    executionLevel:
      (params.get("approval") as
        | "full_auto"
        | "approve_then_run"
        | "draft_save"
        | null) ?? base.executionLevel,
  });
}

export function AutomationsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdParam = searchParams.get("id");
  const openedIdRef = useRef<string | null>(null);
  const initialForm = useMemo(
    () => parseInitialFormFromSearchParams(searchParams),
    [searchParams],
  );

  const [v2Enabled, setV2Enabled] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationsV2, setAutomationsV2] = useState<AutomationV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(initialForm) && !v2Enabled);
  const [createInitialState, setCreateInitialState] = useState(initialForm);
  const [selected, setSelected] = useState<Automation | null>(null);

  useEffect(() => {
    void fetchFeatureAvailability()
      .then((flags) => {
        setV2Enabled(Boolean(flags.automation_v2_enabled));
      })
      .catch(() => setV2Enabled(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (initialForm && !v2Enabled) {
        setShowCreate(true);
        setCreateInitialState(initialForm);
      }
      if (initialForm && v2Enabled) {
        const seed = initialForm.assignment || initialForm.title;
        router.replace(
          `/automations/new${seed ? `?seed=${encodeURIComponent(seed)}` : ""}`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialForm, v2Enabled, router]);

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

  const loadV2 = useCallback(async () => {
    if (!v2Enabled) {
      setAutomationsV2([]);
      return;
    }
    try {
      const items = await fetchAutomationsV2();
      setAutomationsV2(items);
    } catch {
      // Flag race or API unavailable — keep V1 visible
      setAutomationsV2([]);
    }
  }, [v2Enabled]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadAutomations();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAutomations]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadV2();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadV2]);

  useEffect(() => {
    if (!selectedIdParam || automations.length === 0) return;
    if (openedIdRef.current === selectedIdParam) return;
    const match = automations.find((item) => item.id === selectedIdParam);
    if (!match) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      openedIdRef.current = selectedIdParam;
      setSelected(match);
    });
    return () => {
      cancelled = true;
    };
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
      setSelected((current) => (current?.id === id ? updated : current));
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

  const openCreate = () => {
    if (v2Enabled) {
      router.push("/automations/new");
      return;
    }
    setCreateInitialState(defaultAutomationFormState());
    setShowCreate(true);
  };

  if (isLoading && !showCreate && automations.length === 0 && automationsV2.length === 0) {
    return <LoadingState />;
  }

  const summaryCards = [
    { label: ui.entrustedJobs.summaryScheduled, value: summary.scheduled },
    { label: ui.entrustedJobs.summaryNeedsReview, value: summary.needsReview },
    { label: ui.entrustedJobs.summaryCompleted, value: summary.completed },
    { label: ui.entrustedJobs.summaryPaused, value: summary.paused },
  ] as const;

  return (
    <div className="space-y-10 sm:space-y-12 animate-fade-up pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
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
          <Button
            variant="primary"
            className="min-h-[48px] rounded-full px-6"
            onClick={openCreate}
          >
            {ui.entrustedJobs.registerHere}
          </Button>
          {v2Enabled ? (
            <Link
              href="/automations/new"
              className="text-sm text-accent underline"
            >
              下書きから続ける
            </Link>
          ) : (
            <Button
              variant="secondary"
              className="min-h-[44px] rounded-full px-4"
              onClick={() => {
                setCreateInitialState(defaultAutomationFormState());
                setShowCreate(true);
              }}
            >
              {ui.entrustedJobs.addNew}
            </Button>
          )}
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

      {showCreate && !v2Enabled ? (
        <CreateAutomationForm
          initialState={createInitialState ?? undefined}
          onCreated={() => void handleCreated()}
          onCancel={() => {
            setShowCreate(false);
            setCreateInitialState(null);
          }}
        />
      ) : null}

      {error ? <ErrorState message={error} /> : null}

      {v2Enabled && automationsV2.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-title">あなたの自動化</h2>
          <ul className="space-y-4">
            {automationsV2.map((automation) => (
              <li key={automation.id}>
                <AutomationV2Card
                  automation={automation}
                  busy={updatingId === automation.id || runningId === automation.id}
                  onOpen={() =>
                    router.push(`/automations?id=${automation.id}`)
                  }
                  onPause={() => {
                    setUpdatingId(automation.id);
                    void pauseAutomationV2(automation.id)
                      .then(loadV2)
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : ui.error.updateFailed,
                        ),
                      )
                      .finally(() => setUpdatingId(null));
                  }}
                  onResume={() => {
                    setUpdatingId(automation.id);
                    void resumeAutomationV2(automation.id)
                      .then(loadV2)
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : ui.error.updateFailed,
                        ),
                      )
                      .finally(() => setUpdatingId(null));
                  }}
                  onDuplicate={() => {
                    setUpdatingId(automation.id);
                    void duplicateAutomationV2(automation.id)
                      .then(loadV2)
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : ui.error.updateFailed,
                        ),
                      )
                      .finally(() => setUpdatingId(null));
                  }}
                  onRun={() => {
                    setRunningId(automation.id);
                    void runAutomationV2(automation.id)
                      .then((result) => {
                        void loadV2();
                        router.push(
                          `/automations/runs/${encodeURIComponent(result.run.id)}`,
                        );
                      })
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : ui.error.runFailed,
                        ),
                      )
                      .finally(() => setRunningId(null));
                  }}
                  onArchive={() => {
                    setUpdatingId(automation.id);
                    void archiveAutomationV2(automation.id)
                      .then(loadV2)
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : ui.error.updateFailed,
                        ),
                      )
                      .finally(() => setUpdatingId(null));
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        {v2Enabled && automations.length > 0 ? (
          <h2 className="text-title">これまでのスケジュール型の仕事</h2>
        ) : null}
        {isLoading ? (
          <LoadingState />
        ) : automations.length === 0 && automationsV2.length === 0 && !showCreate ? (
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
              <Button
                variant="primary"
                className="min-h-[48px]"
                onClick={openCreate}
              >
                {ui.entrustedJobs.emptyCta}
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

      {selected ? (
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
      ) : null}
    </div>
  );
}
