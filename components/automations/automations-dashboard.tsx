"use client";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
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
  fetchAutomationRunsAll,
  fetchAutomationsV2,
  pauseAutomationV2,
  resumeAutomationV2,
  runAutomationV2,
} from "@/lib/automation-platform/client";
import type { AutomationRun } from "@/lib/automation-platform/types";
import {
  buildAutomationListRows,
  filterAutomationListRows,
  sortAutomationListRows,
  type AutomationListFilter,
  type AutomationListSort,
} from "@/lib/automation-platform/operations/list-model";
import { fetchFeatureAvailability } from "@/lib/feature-flags/client";
import {
  automationToVisualStatus,
  formatRunInstant,
} from "@/lib/automation-first/automation-status";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AutomationRow } from "@/components/automation-first/automation-row";
import { PageHeader } from "@/components/automation-first/page-header";

import { AutomationCard } from "./automation-card";
import { AutomationDetailPanel } from "./automation-detail-panel";
import { CreateAutomationForm } from "./create-automation-form";
import { AutomationListControls } from "./v2/automation-list-controls";
import { AutomationV2Card } from "./v2/automation-v2-card";
import { AutomationV2DetailPanel } from "./v2/automation-v2-detail-panel";
import { OperationsDashboard } from "./v2/operations-dashboard";

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
  const selectedV2Param = searchParams.get("v2");
  const openedIdRef = useRef<string | null>(null);
  const openedV2Ref = useRef<string | null>(null);
  const initialForm = useMemo(
    () => parseInitialFormFromSearchParams(searchParams),
    [searchParams],
  );

  const [v2Enabled, setV2Enabled] = useState(false);
  const [dashboardV2, setDashboardV2] = useState(false);
  const [operationsEnabled, setOperationsEnabled] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationsV2, setAutomationsV2] = useState<AutomationV2[]>([]);
  const [runsV2, setRunsV2] = useState<AutomationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(initialForm) && !v2Enabled);
  const [createInitialState, setCreateInitialState] = useState(initialForm);
  const [selected, setSelected] = useState<Automation | null>(null);
  const [selectedV2, setSelectedV2] = useState<AutomationV2 | null>(null);
  const [listFilter, setListFilter] = useState<AutomationListFilter>("all");
  const [listSort, setListSort] = useState<AutomationListSort>("next_run");
  const [listQuery, setListQuery] = useState("");

  useEffect(() => {
    void fetchFeatureAvailability()
      .then((flags) => {
        setV2Enabled(Boolean(flags.automation_v2_enabled));
        setDashboardV2(Boolean(flags.automation_dashboard_v2_enabled));
        setOperationsEnabled(Boolean(flags.automation_operations_enabled));
      })
      .catch(() => {
        setV2Enabled(false);
        setDashboardV2(false);
        setOperationsEnabled(false);
      });
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
      setRunsV2([]);
      return;
    }
    try {
      const items = await fetchAutomationsV2();
      setAutomationsV2(items);
      if (operationsEnabled) {
        try {
          const runs = await fetchAutomationRunsAll({ sort: "newest" });
          setRunsV2(runs);
        } catch {
          setRunsV2([]);
        }
      }
    } catch {
      // Flag race or API unavailable — keep V1 visible
      setAutomationsV2([]);
    }
  }, [v2Enabled, operationsEnabled]);

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

  useEffect(() => {
    if (!selectedV2Param || automationsV2.length === 0) return;
    if (openedV2Ref.current === selectedV2Param) return;
    const match = automationsV2.find((item) => item.id === selectedV2Param);
    if (!match) return;
    return scheduleMountWork(() => {
      openedV2Ref.current = selectedV2Param;
      setSelectedV2(match);
    });
  }, [selectedV2Param, automationsV2]);

  const summary = useMemo(
    () => summarizeEntrustedJobs(automations),
    [automations],
  );

  const v2Rows = useMemo(() => {
    const rows = buildAutomationListRows(automationsV2, runsV2);
    return sortAutomationListRows(
      filterAutomationListRows(rows, listFilter, listQuery),
      listSort,
    );
  }, [automationsV2, runsV2, listFilter, listQuery, listSort]);

  const openV2Detail = (automation: AutomationV2) => {
    setSelectedV2(automation);
    router.replace(`/automations?v2=${encodeURIComponent(automation.id)}`);
  };

  const closeV2Detail = () => {
    setSelectedV2(null);
    openedV2Ref.current = null;
    router.replace("/automations");
  };

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
      {dashboardV2 ? (
        <PageHeader
          eyebrow={ui.brand}
          title="自動化"
          description="稼働中の仕事、次回実行、最終結果を一覧で運用できます。"
          actions={
            <Button
              variant="primary"
              className="min-h-[var(--touch-target)] rounded-[var(--radius-md)] px-5"
              onClick={openCreate}
            >
              新しい自動化を作る
            </Button>
          }
        />
      ) : (
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
      )}

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

      {v2Enabled && (operationsEnabled || dashboardV2) ? (
        <OperationsDashboard enabled={operationsEnabled || dashboardV2} />
      ) : null}

      {v2Enabled ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-title">あなたの自動化</h2>
            <Link
              href="/automations/runs"
              className="text-sm text-accent underline"
            >
              実行履歴
            </Link>
          </div>
          {(operationsEnabled || dashboardV2) && automationsV2.length > 0 ? (
            <AutomationListControls
              filter={listFilter}
              sort={listSort}
              query={listQuery}
              onFilterChange={setListFilter}
              onSortChange={setListSort}
              onQueryChange={setListQuery}
            />
          ) : null}
          {automationsV2.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              まだ自動化がありません。新しい自動化を作成してください。
            </p>
          ) : null}
          <ul className="space-y-4">
            {(operationsEnabled || dashboardV2 ? v2Rows.map((row) => row.automation) : automationsV2).map(
              (automation) => {
                const row = v2Rows.find(
                  (item) => item.automation.id === automation.id,
                );
                return (
              <li key={automation.id}>
                <AutomationV2Card
                  automation={automation}
                  busy={updatingId === automation.id || runningId === automation.id}
                  onOpen={() => openV2Detail(automation)}
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
                {row && (operationsEnabled || dashboardV2) ? (
                  <p className="mt-2 px-1 text-xs text-[var(--muted)]">
                    最終結果: {row.lastResultLabel}
                    {row.successRate != null ? ` · 成功率 ${row.successRate}%` : ""}
                    {row.recentFailure ? " · 最近失敗あり" : ""}
                    {" · "}
                    {row.memorySummary}
                  </p>
                ) : null}
              </li>
                );
              },
            )}
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
        ) : dashboardV2 ? (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
            <div className="hidden border-b border-[var(--border)] px-3 py-2 text-[length:var(--text-caption)] text-[var(--text-muted)] sm:grid sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
              <span>自動化</span>
              <span>状態</span>
              <span>次回</span>
              <span>最終</span>
            </div>
            {automations.map((automation) => (
              <AutomationRow
                key={automation.id}
                id={automation.id}
                name={automation.name}
                description={automation.schedule.label}
                status={automationToVisualStatus(automation)}
                nextRunLabel={formatRunInstant(automation.nextRun)}
                lastRunLabel={formatRunInstant(automation.lastRun)}
                href={`/automations?id=${encodeURIComponent(automation.id)}`}
              />
            ))}
          </div>
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

      {selectedV2 ? (
        <AutomationV2DetailPanel
          automation={selectedV2}
          busy={
            updatingId === selectedV2.id || runningId === selectedV2.id
          }
          onClose={closeV2Detail}
          onPause={() => {
            setUpdatingId(selectedV2.id);
            void pauseAutomationV2(selectedV2.id)
              .then(async () => {
                await loadV2();
                setSelectedV2((current) =>
                  current
                    ? { ...current, status: "paused", nextRunAt: null }
                    : current,
                );
              })
              .catch((err: unknown) =>
                setError(
                  err instanceof Error ? err.message : ui.error.updateFailed,
                ),
              )
              .finally(() => setUpdatingId(null));
          }}
          onResume={() => {
            setUpdatingId(selectedV2.id);
            void resumeAutomationV2(selectedV2.id)
              .then(async (updated) => {
                await loadV2();
                setSelectedV2(updated);
              })
              .catch((err: unknown) =>
                setError(
                  err instanceof Error ? err.message : ui.error.updateFailed,
                ),
              )
              .finally(() => setUpdatingId(null));
          }}
          onRun={() => {
            setRunningId(selectedV2.id);
            void runAutomationV2(selectedV2.id)
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
          onDuplicate={() => {
            setUpdatingId(selectedV2.id);
            void duplicateAutomationV2(selectedV2.id)
              .then(loadV2)
              .catch((err: unknown) =>
                setError(
                  err instanceof Error ? err.message : ui.error.updateFailed,
                ),
              )
              .finally(() => setUpdatingId(null));
          }}
          onArchive={() => {
            setUpdatingId(selectedV2.id);
            void archiveAutomationV2(selectedV2.id)
              .then(async () => {
                await loadV2();
                closeV2Detail();
              })
              .catch((err: unknown) =>
                setError(
                  err instanceof Error ? err.message : ui.error.updateFailed,
                ),
              )
              .finally(() => setUpdatingId(null));
          }}
        />
      ) : null}
    </div>
  );
}
