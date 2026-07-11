"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { cn } from "@/lib/design-system/cn";
import {
  assignmentFromLearnedMemory,
  deleteWorkMemoryClient,
  fetchWorkMemories,
  isTaughtWorkflowData,
  parseTaughtSteps,
  updateWorkMemoryClient,
  type WorkMemoryRecord,
} from "@/lib/work-memory";

function formatDate(iso: string | null): string {
  if (!iso) return "未利用";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未利用";
  return date.toLocaleDateString("ja-JP");
}

export function LearnedJobsDashboard() {
  const router = useRouter();
  const [items, setItems] = useState<WorkMemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWorkMemories({ type: "template" });
      const sorted = [...response.memories].sort((a, b) => {
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      });
      setItems(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました。");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasItems = items.length > 0;

  const startEdit = (memory: WorkMemoryRecord) => {
    setEditingId(memory.id);
    setEditTitle(memory.title);
    setEditSummary(memory.summary);
  };

  const saveEdit = async (memory: WorkMemoryRecord) => {
    setBusyId(memory.id);
    try {
      const updated = await updateWorkMemoryClient(memory.id, {
        title: editTitle.trim() || memory.title,
        summary: editSummary.trim() || memory.summary,
        structuredData: {
          ...memory.structuredData,
          assignmentPattern:
            editSummary.trim() ||
            (typeof memory.structuredData.assignmentPattern === "string"
              ? memory.structuredData.assignmentPattern
              : memory.summary),
        },
      });
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (memory: WorkMemoryRecord) => {
    setBusyId(memory.id);
    try {
      const updated = await updateWorkMemoryClient(memory.id, {
        isActive: !memory.isActive,
      });
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (memory: WorkMemoryRecord) => {
    if (!window.confirm(`「${memory.title}」を削除しますか？`)) return;
    setBusyId(memory.id);
    try {
      await deleteWorkMemoryClient(memory.id);
      setItems((prev) => prev.filter((item) => item.id !== memory.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  const emptyHint = useMemo(
    () => "まだ覚えた仕事はありません。仕事完了後にテンプレート化できます。",
    [],
  );

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent">AI秘書</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          AI秘書が覚えた仕事
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
          一度行った仕事をテンプレートとして再利用できます。
        </p>
      </header>

      {error && <ErrorState message={error} />}

      {!hasItems ? (
        <div className="rounded-[28px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-12 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">{emptyHint}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((memory) => {
            const editing = editingId === memory.id;
            const busy = busyId === memory.id;
            return (
              <li
                key={memory.id}
                className="flex h-full flex-col rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]"
              >
                {editing ? (
                  <div className="space-y-3">
                    <Input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      aria-label="仕事名"
                    />
                    <Textarea
                      value={editSummary}
                      onChange={(event) => setEditSummary(event.target.value)}
                      rows={4}
                      aria-label="依頼内容"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => void saveEdit(memory)}
                      >
                        保存
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">
                          {memory.title}
                        </p>
                        <p className="mt-2 line-clamp-2 text-sm text-[var(--foreground-muted)]">
                          {memory.summary}
                        </p>
                        {isTaughtWorkflowData(memory.structuredData) && (
                          <p className="mt-2 text-xs text-accent">
                            教えられた流れ {parseTaughtSteps(memory.structuredData).length} ステップ
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                          memory.isActive
                            ? "bg-accent/10 text-accent"
                            : "bg-[var(--background-subtle)] text-[var(--foreground-muted)]",
                        )}
                      >
                        自動化 {memory.isActive ? "ON" : "OFF"}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--foreground-muted)]">
                      <div>
                        <dt>最終利用日</dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {formatDate(memory.lastUsedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt>利用回数</dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {memory.usageCount}回
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          const assignment = assignmentFromLearnedMemory(memory);
                          if (!assignment) return;
                          const taught = isTaughtWorkflowData(memory.structuredData)
                            ? "&taught=1"
                            : "";
                          router.push(
                            `/workspace?assignment=${encodeURIComponent(assignment)}${taught}`,
                          );
                        }}
                      >
                        依頼する
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => void toggleActive(memory)}
                      >
                        自動化{memory.isActive ? "OFF" : "ON"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => startEdit(memory)}
                      >
                        編集
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        disabled={busy}
                        onClick={() => void remove(memory)}
                      >
                        削除
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
