"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";
import type {
  HierarchicalMemoryRecord,
  MemoryScope,
} from "@/lib/hierarchical-memory";

const SCOPE_TABS: Array<{ id: MemoryScope | "all"; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "user", label: "ユーザー全体" },
  { id: "project", label: "プロジェクト" },
  { id: "job", label: "仕事・自動化" },
  { id: "conversation", label: "一時情報" },
];

function scopeLabel(scope: MemoryScope): string {
  return SCOPE_TABS.find((tab) => tab.id === scope)?.label ?? scope;
}

export function HierarchicalMemorySettings() {
  const [scope, setScope] = useState<MemoryScope | "all">("all");
  const [memories, setMemories] = useState<HierarchicalMemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    startTransition(() => {
      setLoading(true);
      setError(null);
    });

    void (async () => {
      try {
        const query = scope === "all" ? "" : `?scope=${scope}`;
        const response = await fetch(`/api/hierarchical-memory${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("読み込みに失敗しました");
        const body = (await response.json()) as {
          memories: HierarchicalMemoryRecord[];
        };
        if (cancelled) return;
        startTransition(() => {
          setMemories(body.memories);
          setLoading(false);
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        startTransition(() => {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scope, startTransition]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const query = scope === "all" ? "" : `?scope=${scope}`;
      const response = await fetch(`/api/hierarchical-memory${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("読み込みに失敗しました");
      const body = (await response.json()) as {
        memories: HierarchicalMemoryRecord[];
      };
      setMemories(body.memories);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(id: string) {
    const response = await fetch(`/api/hierarchical-memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: draft }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "保存に失敗しました");
      return;
    }
    setEditingId(null);
    await reload();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/hierarchical-memory/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("削除に失敗しました");
      return;
    }
    await reload();
  }

  async function disable(id: string) {
    const response = await fetch(`/api/hierarchical-memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (!response.ok) {
      setError("無効化に失敗しました");
      return;
    }
    await reload();
  }

  async function changeScope(id: string, next: MemoryScope) {
    const response = await fetch(`/api/hierarchical-memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: next,
        isTemporary: next === "conversation",
      }),
    });
    if (!response.ok) {
      setError("範囲の変更に失敗しました");
      return;
    }
    await reload();
  }

  return (
    <section className="space-y-4" aria-labelledby="hierarchical-memory-heading">
      <div>
        <h2 id="hierarchical-memory-heading" className="text-title text-foreground">
          {ui.hierarchicalMemory.title}
        </h2>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {ui.hierarchicalMemory.subtitle}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScope(tab.id)}
            className={
              scope === tab.id
                ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-[var(--accent-foreground)]"
                : "rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--foreground-muted)]"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState message={ui.hierarchicalMemory.loading} />}
      {error && <ErrorState title="エラー" message={error} />}

      {!loading && memories.length === 0 && (
        <Card padding="md">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.hierarchicalMemory.empty}
          </p>
        </Card>
      )}

      <ul className="space-y-3">
        {memories.map((memory) => (
          <li key={memory.id}>
            <Card padding="md" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                  {scopeLabel(memory.scope)}
                </span>
                <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                  {memory.category}
                </span>
                {memory.isTemporary && (
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                    一時
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-foreground">{memory.key}</p>
              {editingId === memory.id ? (
                <div className="space-y-2">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveEdit(memory.id)}>
                      {ui.hierarchicalMemory.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      {ui.hierarchicalMemory.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--foreground-muted)]">{memory.value}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(memory.id);
                    setDraft(memory.value);
                  }}
                >
                  {ui.hierarchicalMemory.edit}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void changeScope(memory.id, "job")}
                >
                  {ui.hierarchicalMemory.scopeJobOnly}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void disable(memory.id)}
                >
                  {ui.hierarchicalMemory.disable}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(memory.id)}
                >
                  {ui.hierarchicalMemory.delete}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
