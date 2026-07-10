"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createUserMemoryClient,
  deleteUserMemoryClient,
  fetchUserMemories,
  resetUserMemoriesClient,
  toggleUserMemoryPinClient,
  updateUserMemoryClient,
  formatConfidence,
  getMemoryCategoryLabel,
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type MemoryListResponse,
  type UserMemory,
} from "@/lib/user-memory";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";

type EditState = {
  memoryId?: string;
  category: MemoryCategory;
  title: string;
  content: string;
};

function MemoryCard({
  memory,
  onEdit,
  onDelete,
  onPin,
}: {
  memory: UserMemory;
  onEdit: (memory: UserMemory) => void;
  onDelete: (memoryId: string) => void;
  onPin: (memoryId: string) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-[var(--radius-xl)] border bg-[var(--card)] p-4 shadow-[var(--shadow-sm)] transition-colors duration-[var(--motion-base)]",
        memory.pinned ? "border-accent/30 bg-[var(--accent-muted)]/30" : "border-[var(--border)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              {getMemoryCategoryLabel(memory.category)}
            </span>
            {memory.pinned && (
              <span className="text-[10px] font-medium text-accent">{ui.memory.pinned}</span>
            )}
            <span className="text-[10px] text-[var(--text-muted)]">
              {ui.memory.confidence(formatConfidence(memory.confidence))}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{memory.title}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{memory.content}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => onPin(memory.memoryId)}>
          {memory.pinned ? ui.memory.unpin : ui.memory.pin}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(memory)}>
          {ui.memory.edit}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(memory.memoryId)}>
          {ui.memory.delete}
        </Button>
      </div>
    </li>
  );
}

function SectionBlock({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-title text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function MemorySettings() {
  const [data, setData] = useState<MemoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | "all">("all");
  const [editing, setEditing] = useState<EditState | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchUserMemories());
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.memory.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredMemories = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.memories.filter((memory) => {
      if (categoryFilter !== "all" && memory.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        memory.title.toLowerCase().includes(query) ||
        memory.content.toLowerCase().includes(query)
      );
    });
  }, [data, search, categoryFilter]);

  const handleSave = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.memoryId) {
        await updateUserMemoryClient(editing.memoryId, {
          category: editing.category,
          title: editing.title.trim(),
          content: editing.content.trim(),
        });
      } else {
        await createUserMemoryClient({
          category: editing.category,
          title: editing.title.trim(),
          content: editing.content.trim(),
          confidence: 0.9,
        });
      }
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.memory.saveError);
    }
  };

  const handleDelete = async (memoryId: string) => {
    if (!window.confirm(ui.memory.deleteConfirm)) return;
    await deleteUserMemoryClient(memoryId);
    await reload();
  };

  const handlePin = async (memoryId: string) => {
    await toggleUserMemoryPinClient(memoryId);
    await reload();
  };

  const handleResetCategory = async () => {
    if (categoryFilter === "all") return;
    if (!window.confirm(ui.memory.resetCategoryConfirm(getMemoryCategoryLabel(categoryFilter)))) {
      return;
    }
    await resetUserMemoriesClient({ category: categoryFilter });
    await reload();
  };

  const handleResetAll = async () => {
    if (!window.confirm(ui.memory.resetAllConfirm)) return;
    await resetUserMemoriesClient({ all: true });
    await reload();
  };

  if (loading && !data) {
    return <LoadingState message={ui.memory.loading} />;
  }

  return (
    <div className="space-y-8">
      {error && <ErrorState message={error} />}

      {data && data.suggestions.length > 0 && (
        <Card padding="lg" className="landing-glass space-y-3 shadow-[var(--shadow-soft)]">
          <h2 className="text-title text-foreground">{ui.memory.suggestionsTitle}</h2>
          <p className="text-caption text-[var(--foreground-muted)]">{ui.memory.suggestionsHint}</p>
          <ul className="space-y-2">
            {data.suggestions.map((item) => (
              <li
                key={item.id}
                className="rounded-[var(--radius-lg)] bg-[var(--accent-muted)]/40 px-4 py-3 text-sm text-foreground"
              >
                {item.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={ui.memory.searchPlaceholder}
          className="flex-1"
        />
        <select
          value={categoryFilter}
          onChange={(event) =>
            setCategoryFilter(event.target.value as MemoryCategory | "all")
          }
          className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-3 text-sm"
        >
          <option value="all">{ui.memory.allCategories}</option>
          {MEMORY_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {getMemoryCategoryLabel(category)}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          onClick={() =>
            setEditing({ category: "other", title: "", content: "" })
          }
        >
          {ui.memory.add}
        </Button>
      </div>

      {editing && (
        <Card padding="lg" className="space-y-4 shadow-[var(--shadow-soft)]">
          <h3 className="text-title text-foreground">
            {editing.memoryId ? ui.memory.editTitle : ui.memory.addTitle}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-secondary)]">{ui.memory.categoryLabel}</span>
              <select
                value={editing.category}
                onChange={(event) =>
                  setEditing((prev) =>
                    prev
                      ? { ...prev, category: event.target.value as MemoryCategory }
                      : prev,
                  )
                }
                className="h-11 w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3"
              >
                {MEMORY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {getMemoryCategoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--text-secondary)]">{ui.memory.titleLabel}</span>
              <Input
                value={editing.title}
                onChange={(event) =>
                  setEditing((prev) =>
                    prev ? { ...prev, title: event.target.value } : prev,
                  )
                }
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--text-secondary)]">{ui.memory.contentLabel}</span>
              <textarea
                value={editing.content}
                onChange={(event) =>
                  setEditing((prev) =>
                    prev ? { ...prev, content: event.target.value } : prev,
                  )
                }
                rows={3}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void handleSave()}>
              {ui.memory.save}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {ui.memory.cancel}
            </Button>
          </div>
        </Card>
      )}

      {data && (
        <>
          <SectionBlock
            title={ui.memory.pinnedTitle}
            empty={data.sections.pinned.length === 0}
          >
            <ul className="grid gap-3">
              {data.sections.pinned.map((memory) => (
                <MemoryCard
                  key={memory.memoryId}
                  memory={memory}
                  onEdit={(item) =>
                    setEditing({
                      memoryId: item.memoryId,
                      category: item.category,
                      title: item.title,
                      content: item.content,
                    })
                  }
                  onDelete={(id) => void handleDelete(id)}
                  onPin={(id) => void handlePin(id)}
                />
              ))}
            </ul>
          </SectionBlock>

          <SectionBlock title={ui.memory.recentTitle} subtitle={ui.memory.recentHint}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(search || categoryFilter !== "all" ? filteredMemories : data.sections.recent).map(
                (memory) => (
                  <MemoryCard
                    key={memory.memoryId}
                    memory={memory}
                    onEdit={(item) =>
                      setEditing({
                        memoryId: item.memoryId,
                        category: item.category,
                        title: item.title,
                        content: item.content,
                      })
                    }
                    onDelete={(id) => void handleDelete(id)}
                    onPin={(id) => void handlePin(id)}
                  />
                ),
              )}
            </ul>
          </SectionBlock>

          <div className="grid gap-8 lg:grid-cols-2">
            <SectionBlock title={ui.memory.workStyleTitle}>
              <ul className="space-y-2">
                {data.sections.workStyle.slice(0, 5).map((memory) => (
                  <li
                    key={memory.memoryId}
                    className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{memory.title}</span>
                    <span className="text-[var(--text-secondary)]"> — {memory.content}</span>
                  </li>
                ))}
              </ul>
            </SectionBlock>

            <SectionBlock title={ui.memory.preferredAiTitle}>
              <ul className="space-y-2">
                {data.sections.preferredAi.slice(0, 5).map((memory) => (
                  <li
                    key={memory.memoryId}
                    className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                  >
                    {memory.title}: {memory.content}
                  </li>
                ))}
              </ul>
            </SectionBlock>

            <SectionBlock title={ui.memory.usageTrendsTitle}>
              <ul className="space-y-2">
                {data.sections.usageTrends.slice(0, 5).map((memory) => (
                  <li
                    key={memory.memoryId}
                    className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                  >
                    {memory.content}
                  </li>
                ))}
              </ul>
            </SectionBlock>

            <SectionBlock title={ui.memory.automationTrendsTitle}>
              <ul className="space-y-2">
                {data.sections.automationTrends.slice(0, 5).map((memory) => (
                  <li
                    key={memory.memoryId}
                    className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                  >
                    {memory.title}: {memory.content}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          </div>
        </>
      )}

      <Card padding="lg" className="space-y-3 border-[var(--border)]">
        <h2 className="text-title text-foreground">{ui.memory.resetTitle}</h2>
        <p className="text-caption text-[var(--foreground-muted)]">{ui.memory.resetHint}</p>
        <div className="flex flex-wrap gap-2">
          {categoryFilter !== "all" && (
            <Button variant="secondary" onClick={() => void handleResetCategory()}>
              {ui.memory.resetCategory(getMemoryCategoryLabel(categoryFilter))}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void handleResetAll()}>
            {ui.memory.resetAll}
          </Button>
        </div>
      </Card>
    </div>
  );
}
