"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  WORK_MEMORY_TYPES,
  confirmWorkMemoryCandidateClient,
  createWorkMemoryClient,
  deleteWorkMemoryClient,
  fetchWorkMemories,
  formatWorkMemoryConfidencePercent,
  getWorkMemorySourceLabel,
  getWorkMemoryTypeLabel,
  rejectWorkMemoryCandidateClient,
  resetWorkMemoriesClient,
  updateWorkMemoryClient,
  updateWorkMemorySettingsClient,
  type WorkMemoryCandidate,
  type WorkMemoryListResponse,
  type WorkMemoryRecord,
  type WorkMemoryType,
} from "@/lib/work-memory";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";

type EditState = {
  id?: string;
  type: WorkMemoryType;
  title: string;
  summary: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return ui.workMemory.lastUsedNever;
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildRevisionHistory(memory: WorkMemoryRecord): string[] {
  const lines = [
    `${ui.workMemory.historyCreated}: ${formatDate(memory.createdAt)}`,
    `${ui.workMemory.historyUpdated}: ${formatDate(memory.updatedAt)}`,
  ];

  const data = memory.structuredData ?? {};
  if (typeof data.correctionBefore === "string" && data.correctionBefore) {
    lines.push(`修正前: ${data.correctionBefore.slice(0, 120)}`);
  }
  if (typeof data.correctionAfter === "string" && data.correctionAfter) {
    lines.push(`修正後: ${data.correctionAfter.slice(0, 120)}`);
  }
  if (data.correctionRequested === true) {
    lines.push("修正依頼から学習済み");
  }

  return lines;
}

function UnderstandingBar({ value }: { value: number }) {
  const percent = formatWorkMemoryConfidencePercent(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span>{ui.workMemory.confidenceShort}</span>
        <span className="font-medium text-foreground">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-full rounded-full bg-accent transition-all duration-[var(--motion-base)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function MemoryCard({
  memory,
  onOpen,
  onToggleAutomation,
}: {
  memory: WorkMemoryRecord;
  onOpen: (memory: WorkMemoryRecord) => void;
  onToggleAutomation: (memory: WorkMemoryRecord, next: boolean) => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(memory)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(memory);
          }
        }}
        className={cn(
          "group flex h-full w-full cursor-pointer flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-sm)] transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-ring animate-fade-up",
          !memory.isActive && "opacity-70",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
            {getWorkMemoryTypeLabel(memory.type)}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              memory.isActive
                ? "bg-[var(--accent-muted)] text-accent"
                : "bg-[var(--surface-muted)] text-[var(--text-muted)]",
            )}
          >
            {memory.isActive
              ? ui.workMemory.automationOn
              : ui.workMemory.automationOff}
          </span>
        </div>

        <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
          {memory.title}
        </h3>

        <dl className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
          <div className="flex items-center justify-between gap-3">
            <dt>{ui.workMemory.lastUsed}</dt>
            <dd className="text-foreground">{formatDate(memory.lastUsedAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>{ui.workMemory.usageCount}</dt>
            <dd className="text-foreground">
              {ui.workMemory.usageCountValue(memory.usageCount)}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <UnderstandingBar value={memory.confidence} />
        </div>

        <div
          className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="text-xs text-[var(--text-muted)]">
            {memory.isUserConfirmed
              ? ui.workMemory.confirmed
              : ui.workMemory.unconfirmed}
          </span>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>{ui.workMemory.automationOn}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={memory.isActive}
              onChange={(event) =>
                onToggleAutomation(memory, event.target.checked)
              }
              aria-label={
                memory.isActive
                  ? ui.workMemory.automationOff
                  : ui.workMemory.automationOn
              }
            />
          </label>
        </div>
      </div>
    </li>
  );
}

function DetailPanel({
  memory,
  onClose,
  onEdit,
  onDelete,
  onConfirm,
  onToggleAutomation,
}: {
  memory: WorkMemoryRecord;
  onClose: () => void;
  onEdit: (memory: WorkMemoryRecord) => void;
  onDelete: (id: string) => void;
  onConfirm: (memory: WorkMemoryRecord) => void;
  onToggleAutomation: (memory: WorkMemoryRecord, next: boolean) => void;
}) {
  const history = buildRevisionHistory(memory);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in"
        aria-label={ui.workMemory.close}
        onClick={onClose}
      />
      <Card
        padding="lg"
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] animate-fade-up sm:mx-4 sm:rounded-[var(--radius-2xl)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-memory-detail-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption text-accent">{ui.brand}</p>
            <h2
              id="work-memory-detail-title"
              className="mt-1 text-title text-foreground"
            >
              {memory.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {getWorkMemoryTypeLabel(memory.type)}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {ui.workMemory.close}
          </Button>
        </div>

        <div className="mt-8 space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.workMemory.detailContent}
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
              {memory.summary}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.workMemory.detailSource}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {getWorkMemorySourceLabel(memory.sourceType)}
              {memory.sourceReference ? `（${memory.sourceReference}）` : ""}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.workMemory.detailLastUsed}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatDate(memory.lastUsedAt)}
              </p>
            </div>
            <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                {ui.workMemory.usageCount}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {ui.workMemory.usageCountValue(memory.usageCount)}
              </p>
            </div>
          </section>

          <UnderstandingBar value={memory.confidence} />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {ui.workMemory.detailHistory}
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                {ui.workMemory.historyEmpty}
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((line) => (
                  <li
                    key={line}
                    className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-5">
          {!memory.isUserConfirmed && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onConfirm(memory)}
            >
              {ui.workMemory.confirm}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onEdit(memory)}>
            {ui.workMemory.edit}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onToggleAutomation(memory, !memory.isActive)}
          >
            {memory.isActive
              ? ui.workMemory.automationOff
              : ui.workMemory.automationOn}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(memory.id)}>
            {ui.workMemory.delete}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function WorkMemorySettings() {
  const [data, setData] = useState<WorkMemoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<WorkMemoryType | "all">("all");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<WorkMemoryRecord | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchWorkMemories({ query: search, type: typeFilter });
      setData(next);
      setSelected((current) => {
        if (!current) return null;
        return next.memories.find((item) => item.id === current.id) ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.workMemory.loadError);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => {
    const memories = data?.memories ?? [];
    const candidates = data?.candidates ?? [];
    const total = data?.total ?? memories.length;
    const automations = memories.filter((item) => item.isActive).length;
    const improvements =
      candidates.length +
      memories.filter((item) => item.type === "correction").length;
    const accuracy =
      memories.length === 0
        ? 0
        : Math.round(
            (memories.reduce((sum, item) => sum + item.confidence, 0) /
              memories.length) *
              100,
          );
    return { total, automations, improvements, accuracy };
  }, [data]);

  const handleSave = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        await updateWorkMemoryClient(editing.id, {
          type: editing.type,
          title: editing.title,
          summary: editing.summary,
          isUserConfirmed: true,
        });
      } else {
        await createWorkMemoryClient({
          type: editing.type,
          title: editing.title,
          summary: editing.summary,
          isUserConfirmed: true,
          sourceType: "manual",
        });
      }
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.workMemory.saveError);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(ui.workMemory.deleteConfirm)) return;
    await deleteWorkMemoryClient(id);
    setSelected(null);
    await reload();
  };

  const handleToggleAutomation = async (
    memory: WorkMemoryRecord,
    next: boolean,
  ) => {
    if (!next && !window.confirm(ui.workMemory.deactivateConfirm)) return;
    await updateWorkMemoryClient(memory.id, { isActive: next });
    await reload();
  };

  const handleConfirmMemory = async (memory: WorkMemoryRecord) => {
    await updateWorkMemoryClient(memory.id, { isUserConfirmed: true });
    await reload();
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setSavingSettings(true);
    try {
      await updateWorkMemorySettingsClient(enabled);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.workMemory.saveError);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleConfirmCandidate = async (candidateId: string) => {
    await confirmWorkMemoryCandidateClient(candidateId);
    await reload();
  };

  const handleRejectCandidate = async (candidateId: string) => {
    await rejectWorkMemoryCandidateClient(candidateId);
    await reload();
  };

  const handleReset = async (all: boolean) => {
    if (all) {
      if (!window.confirm(ui.workMemory.resetAllConfirm)) return;
      await resetWorkMemoriesClient({ all: true });
    } else if (typeFilter !== "all") {
      if (
        !window.confirm(
          ui.workMemory.resetTypeConfirm(getWorkMemoryTypeLabel(typeFilter)),
        )
      ) {
        return;
      }
      await resetWorkMemoriesClient({ type: typeFilter });
    }
    setSelected(null);
    await reload();
  };

  if (loading && !data) {
    return <LoadingState message={ui.workMemory.loading} />;
  }

  if (error && !data) {
    return <ErrorState message={error} />;
  }

  const memories = data?.memories ?? [];
  const candidates = data?.candidates ?? [];

  return (
    <div className="space-y-10 sm:space-y-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="space-y-3">
          <p className="text-caption text-accent">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.workMemory.pageTitle}</h1>
          <p className="text-body max-w-2xl text-[var(--text-secondary)]">
            {ui.workMemory.pageSubtitle}
          </p>
        </header>
        <Button
          variant="primary"
          size="lg"
          className="shrink-0 self-start"
          onClick={() =>
            setEditing({ type: "workflow", title: "", summary: "" })
          }
        >
          {ui.workMemory.add}
        </Button>
      </div>

      <Card padding="lg" className="border-[var(--border-subtle)] bg-[var(--card)]">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            checked={data?.settings.enabled ?? true}
            disabled={savingSettings}
            onChange={(e) => void handleToggleEnabled(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">
              {ui.workMemory.enabledLabel}
            </span>
            <span className="mt-1 block text-caption text-[var(--text-secondary)]">
              {ui.workMemory.enabledHint}
            </span>
          </span>
        </label>
        {data && !data.settings.enabled && (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            {ui.workMemory.disabledNotice}
          </p>
        )}
      </Card>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {ui.workMemory.searchLabel}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.workMemory.typeFilterLabel}
          </p>
        </div>

        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={ui.workMemory.searchPlaceholder}
          className="max-w-xl"
          aria-label={ui.workMemory.searchLabel}
        />

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={ui.workMemory.typeFilterLabel}
        >
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors focus-ring",
              typeFilter === "all"
                ? "bg-accent text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-foreground",
            )}
          >
            {ui.workMemory.allTypes}
          </button>
          {WORK_MEMORY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-colors focus-ring",
                typeFilter === type
                  ? "bg-accent text-white"
                  : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-foreground",
              )}
            >
              {getWorkMemoryTypeLabel(type)}
            </button>
          ))}
        </div>
      </section>

      {candidates.length > 0 && (
        <section className="space-y-4 animate-fade-up">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {ui.workMemory.candidatesTitle}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {ui.workMemory.candidatesHint}
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {candidates.map((candidate: WorkMemoryCandidate) => (
              <li key={candidate.candidateId}>
                <Card
                  padding="md"
                  className="h-full border border-dashed border-accent/30 bg-[var(--accent-muted)]/20"
                >
                  <span className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                    {getWorkMemoryTypeLabel(candidate.type)}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">
                    {candidate.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {candidate.summary}
                  </p>
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    {ui.workMemory.reasonLabel}: {candidate.reason}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {ui.workMemory.confirmPrompt}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        void handleConfirmCandidate(candidate.candidateId)
                      }
                    >
                      {ui.workMemory.confirmCandidate}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void handleRejectCandidate(candidate.candidateId)
                      }
                    >
                      {ui.workMemory.rejectCandidate}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <Card
          padding="lg"
          className="space-y-4 border border-[var(--border-subtle)] bg-[var(--card)] animate-fade-up"
        >
          <h3 className="text-title text-foreground">
            {editing.id ? ui.workMemory.editTitle : ui.workMemory.addTitle}
          </h3>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">
              {ui.workMemory.typeLabel}
            </span>
            <select
              value={editing.type}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  type: e.target.value as WorkMemoryType,
                })
              }
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-foreground"
            >
              {WORK_MEMORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getWorkMemoryTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">
              {ui.workMemory.titleLabel}
            </span>
            <Input
              value={editing.title}
              onChange={(e) =>
                setEditing({ ...editing, title: e.target.value })
              }
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">
              {ui.workMemory.summaryLabel}
            </span>
            <textarea
              value={editing.summary}
              onChange={(e) =>
                setEditing({ ...editing, summary: e.target.value })
              }
              rows={5}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              disabled={!editing.title.trim() || !editing.summary.trim()}
            >
              {ui.workMemory.save}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {ui.workMemory.cancel}
            </Button>
          </div>
        </Card>
      )}

      <section className="space-y-4">
        {memories.length === 0 ? (
          <Card
            padding="lg"
            className="border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 text-center"
          >
            <p className="text-sm text-[var(--text-secondary)]">
              {search || typeFilter !== "all"
                ? ui.workMemory.emptyFiltered
                : ui.workMemory.empty}
            </p>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onOpen={setSelected}
                onToggleAutomation={(item, next) =>
                  void handleToggleAutomation(item, next)
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 animate-fade-up">
        <h2 className="text-lg font-semibold text-foreground">
          {ui.workMemory.learningStatusTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ui.workMemory.learningMemories(stats.total),
            ui.workMemory.learningAutomations(stats.automations),
            ui.workMemory.learningImprovements(stats.improvements),
            ui.workMemory.learningAccuracy(stats.accuracy),
          ].map((label) => (
            <Card
              key={label}
              padding="md"
              className="border border-[var(--border-subtle)] bg-[var(--card)] text-center"
            >
              <p className="text-sm font-medium text-foreground">{label}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-sm font-semibold text-foreground">
          {ui.workMemory.resetTitle}
        </h2>
        <p className="text-caption text-[var(--text-secondary)]">
          {ui.workMemory.resetHint}
        </p>
        <div className="flex flex-wrap gap-2">
          {typeFilter !== "all" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleReset(false)}
            >
              {ui.workMemory.resetType(getWorkMemoryTypeLabel(typeFilter))}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void handleReset(true)}>
            {ui.workMemory.resetAll}
          </Button>
        </div>
      </section>

      {selected && (
        <DetailPanel
          memory={selected}
          onClose={() => setSelected(null)}
          onEdit={(memory) => {
            setSelected(null);
            setEditing({
              id: memory.id,
              type: memory.type,
              title: memory.title,
              summary: memory.summary,
            });
          }}
          onDelete={(id) => void handleDelete(id)}
          onConfirm={(memory) => void handleConfirmMemory(memory)}
          onToggleAutomation={(memory, next) =>
            void handleToggleAutomation(memory, next)
          }
        />
      )}

      {error && data && (
        <p className="text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
