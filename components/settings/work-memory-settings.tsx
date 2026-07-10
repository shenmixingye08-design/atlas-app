"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  WORK_MEMORY_TYPES,
  confirmWorkMemoryCandidateClient,
  createWorkMemoryClient,
  deleteWorkMemoryClient,
  fetchWorkMemories,
  formatWorkMemoryConfidence,
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

function MemoryRow({
  memory,
  onEdit,
  onDelete,
  onDeactivate,
}: {
  memory: WorkMemoryRecord;
  onEdit: (memory: WorkMemoryRecord) => void;
  onDelete: (id: string) => void;
  onDeactivate: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-[var(--radius-xl)] border bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]",
        !memory.isActive && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
          {getWorkMemoryTypeLabel(memory.type)}
        </span>
        {memory.isUserConfirmed ? (
          <span className="text-[10px] font-medium text-accent">
            {ui.workMemory.confirmed}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)]">
            {ui.workMemory.unconfirmed}
          </span>
        )}
        <span className="text-[10px] text-[var(--text-muted)]">
          {ui.workMemory.confidence(formatWorkMemoryConfidence(memory.confidence))}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{memory.title}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{memory.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => onEdit(memory)}>
          {ui.workMemory.edit}
        </Button>
        {memory.isActive && (
          <Button variant="ghost" size="sm" onClick={() => onDeactivate(memory.id)}>
            {ui.workMemory.deactivate}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onDelete(memory.id)}>
          {ui.workMemory.delete}
        </Button>
      </div>
    </li>
  );
}

function CandidateRow({
  candidate,
  onConfirm,
  onReject,
}: {
  candidate: WorkMemoryCandidate;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-dashed border-accent/30 bg-[var(--accent-muted)]/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium">
          {getWorkMemoryTypeLabel(candidate.type)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          {ui.workMemory.reasonLabel}: {candidate.reason}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{candidate.title}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{candidate.summary}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{ui.workMemory.confirmPrompt}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onConfirm(candidate.candidateId)}
        >
          {ui.workMemory.confirmCandidate}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onReject(candidate.candidateId)}
        >
          {ui.workMemory.rejectCandidate}
        </Button>
      </div>
    </li>
  );
}

export function WorkMemorySettings() {
  const [data, setData] = useState<WorkMemoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<WorkMemoryType | "all">("all");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchWorkMemories({ query: search, type: typeFilter }));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.workMemory.loadError);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredMemories = useMemo(() => {
    if (!data) return [];
    return data.memories;
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
    await reload();
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm(ui.workMemory.deactivateConfirm)) return;
    await updateWorkMemoryClient(id, { isActive: false });
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
    await reload();
  };

  if (loading && !data) {
    return <LoadingState message={ui.workMemory.loading} />;
  }

  if (error && !data) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="space-y-8">
      <Card padding="lg" className="border-[var(--border-subtle)]">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={data?.settings.enabled ?? true}
            disabled={savingSettings}
            onChange={(e) => void handleToggleEnabled(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">
              {ui.workMemory.enabledLabel}
            </span>
            <span className="mt-1 block text-caption text-[var(--foreground-muted)]">
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

      {data && data.candidates.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-title text-foreground">{ui.workMemory.candidatesTitle}</h2>
            <p className="mt-1 text-caption text-[var(--foreground-muted)]">
              {ui.workMemory.candidatesHint}
            </p>
          </div>
          <ul className="space-y-3">
            {data.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.candidateId}
                candidate={candidate}
                onConfirm={(id) => void handleConfirmCandidate(id)}
                onReject={(id) => void handleRejectCandidate(id)}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ui.workMemory.searchPlaceholder}
          className="max-w-md"
        />
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as WorkMemoryType | "all")
          }
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option value="all">{ui.workMemory.allTypes}</option>
          {WORK_MEMORY_TYPES.map((type) => (
            <option key={type} value={type}>
              {getWorkMemoryTypeLabel(type)}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setEditing({ type: "workflow", title: "", summary: "" })
          }
        >
          {ui.workMemory.add}
        </Button>
      </div>

      {editing && (
        <Card padding="lg" className="space-y-4">
          <h3 className="text-title text-foreground">
            {editing.id ? ui.workMemory.editTitle : ui.workMemory.addTitle}
          </h3>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">{ui.workMemory.typeLabel}</span>
            <select
              value={editing.type}
              onChange={(e) =>
                setEditing({ ...editing, type: e.target.value as WorkMemoryType })
              }
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            >
              {WORK_MEMORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getWorkMemoryTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">{ui.workMemory.titleLabel}</span>
            <Input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">{ui.workMemory.summaryLabel}</span>
            <textarea
              value={editing.summary}
              onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              rows={4}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void handleSave()}>
              {ui.workMemory.save}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {ui.workMemory.cancel}
            </Button>
          </div>
        </Card>
      )}

      {filteredMemories.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{ui.workMemory.empty}</p>
      ) : (
        <ul className="space-y-3">
          {filteredMemories.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              onEdit={(item) =>
                setEditing({
                  id: item.id,
                  type: item.type,
                  title: item.title,
                  summary: item.summary,
                })
              }
              onDelete={(id) => void handleDelete(id)}
              onDeactivate={(id) => void handleDeactivate(id)}
            />
          ))}
        </ul>
      )}

      <section className="space-y-3 border-t border-[var(--border-subtle)] pt-6">
        <h2 className="text-title text-foreground">{ui.workMemory.resetTitle}</h2>
        <p className="text-caption text-[var(--foreground-muted)]">
          {ui.workMemory.resetHint}
        </p>
        <div className="flex flex-wrap gap-2">
          {typeFilter !== "all" && (
            <Button variant="secondary" size="sm" onClick={() => void handleReset(false)}>
              {ui.workMemory.resetType(getWorkMemoryTypeLabel(typeFilter))}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void handleReset(true)}>
            {ui.workMemory.resetAll}
          </Button>
        </div>
      </section>
    </div>
  );
}
