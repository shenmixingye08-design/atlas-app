"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";

import {
  approvePersonalMemoryCandidate,
  createPersonalMemoryClient,
  deleteAllPersonalMemoriesClient,
  deletePersonalMemoryClient,
  exportPersonalMemoriesClient,
  fetchPersonalMemories,
  pauseAllPersonalMemoriesClient,
  rejectPersonalMemoryCandidate,
  updatePersonalMemoryClient,
  updatePersonalMemorySettingsClient,
} from "@/lib/personal-memory/client";
import { detectMemoryConflicts } from "@/lib/personal-memory/conflict";
import {
  KIND_LABELS,
  SCOPE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/personal-memory/labels";
import type {
  PersonalMemoryRecord,
  PersonalMemorySettings,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";
import { PERSONAL_MEMORY_SCOPES } from "@/lib/personal-memory/types";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";

type Tab = "active" | "candidate" | "paused" | "rejected" | "expired" | "superseded" | "deleted";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "candidate", label: "確認待ち" },
  { id: "active", label: "使用中" },
  { id: "paused", label: "停止中" },
  { id: "superseded", label: "置き換え済み" },
  { id: "rejected", label: "記憶しない" },
  { id: "expired", label: "期限切れ" },
  { id: "deleted", label: "削除済み" },
];

function layerLabel(memory: PersonalMemoryRecord): string {
  if (memory.appliesTo.automationIds.length > 0) return "この自動化だけ";
  if (memory.appliesTo.artifactTypes.includes("x_post")) return "X投稿";
  if (memory.appliesTo.artifactTypes.length > 0 && !memory.appliesTo.global) {
    return "この種類の仕事";
  }
  if (memory.scope === "preferred_formats") return "資料の形式";
  return "いつも";
}

const selectClassName =
  "minervot-form-control min-h-[44px] w-full rounded-[var(--radius-lg)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface-muted))] px-4 text-base text-[var(--form-control-text,var(--text-primary))] focus:border-[var(--form-control-focus,var(--accent))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25";

export function PersonalMemorySettingsPanel() {
  const [memories, setMemories] = useState<PersonalMemoryRecord[]>([]);
  const [settings, setSettings] = useState<PersonalMemorySettings | null>(null);
  const [tab, setTab] = useState<Tab>("candidate");
  const [tabReady, setTabReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState<PersonalMemoryScope>("writing_style");
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<PersonalMemoryScope | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PersonalMemoryRecord | null>(null);
  const [wipeAll, setWipeAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const payload = await fetchPersonalMemories("all");
    setMemories(payload.memories);
    setSettings(payload.settings);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPersonalMemories("all")
      .then((payload) => {
        if (cancelled) return;
        setMemories(payload.memories);
        setSettings(payload.settings);
        if (!tabReady) {
          const hasCandidates = payload.memories.some((row) => row.status === "candidate");
          setTab(hasCandidates ? "candidate" : "active");
          setTabReady(true);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tabReady]);

  useEffect(() => {
    if (!deleteTarget && !wipeAll) return;
    const node = dialogRef.current?.querySelector("button");
    node?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteTarget(null);
        setWipeAll(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, wipeAll]);

  const counts = useMemo(() => {
    const next = Object.fromEntries(TABS.map((item) => [item.id, 0])) as Record<Tab, number>;
    for (const memory of memories) {
      if (next[memory.status] !== undefined) next[memory.status] += 1;
    }
    return next;
  }, [memories]);

  const conflicts = useMemo(
    () =>
      detectMemoryConflicts({
        candidates: memories.filter((memory) => memory.status === "active"),
      }),
    [memories],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memories.filter((memory) => {
      if (memory.status !== tab) return false;
      if (scopeFilter !== "all" && memory.scope !== scopeFilter) return false;
      if (!needle) return true;
      const hay = [
        memory.title,
        memory.summary,
        SCOPE_LABELS[memory.scope],
        KIND_LABELS[memory.kind],
        layerLabel(memory),
        memory.candidateReason ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [memories, tab, scopeFilter, query]);

  const onToggleEnabled = (enabled: boolean) => {
    startTransition(async () => {
      try {
        const next = await updatePersonalMemorySettingsClient({
          enabled,
          onDisable: enabled ? undefined : "keep",
        });
        setSettings(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "設定の更新に失敗しました");
      }
    });
  };

  const onCreate = () => {
    if (!title.trim() || !summary.trim()) return;
    startTransition(async () => {
      try {
        await createPersonalMemoryClient({
          kind: "user_preference",
          scope,
          key: scope,
          value: { text: summary.trim() },
          title: title.trim(),
          summary: summary.trim(),
          source: "explicit",
          status: "active",
        });
        setTitle("");
        setSummary("");
        setTab("active");
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
      }
    });
  };

  const runAction = (task: () => Promise<void>) => {
    startTransition(async () => {
      try {
        setError(null);
        await task();
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "記憶の操作に失敗しました");
      }
    });
  };

  const moveTab = (delta: number) => {
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next.id);
    requestAnimationFrame(() => {
      tabListRef.current
        ?.querySelector<HTMLElement>(`#memory-tab-${next.id}`)
        ?.focus();
    });
  };

  if (error && !settings) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
        <Button onClick={() => void reload()}>再読み込み</Button>
      </div>
    );
  }
  if (!settings) return <LoadingState />;

  return (
    <div
      className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-6 pb-[max(6rem,env(safe-area-inset-bottom))]"
      aria-busy={pending || undefined}
    >
      <header className="space-y-2">
        <p className="text-caption text-accent">記憶</p>
        <h1 className="text-display text-foreground">MINERVOTが記憶していること</h1>
        <p className="text-body text-[var(--text-secondary)]">
          仕事の好みを安全に覚え、次回の入力と修正を減らします。勝手には保存しません。
        </p>
        <p className="text-caption text-[var(--text-muted)]">
          仕事の手順や型は{" "}
          <Link href="/settings/work-memory" className="text-accent underline underline-offset-2">
            仕事の記憶
          </Link>
          でも管理できます。
        </p>
      </header>

      {error ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-[var(--error)]">{error}</p>
          <Button
            size="sm"
            variant="secondary"
            className="w-full min-[390px]:w-auto"
            onClick={() => void reload()}
          >
            再読み込みして再試行
          </Button>
        </div>
      ) : null}

      <Card padding="md" className="space-y-3 border border-[var(--border-subtle)]">
        <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
          <div>
            <p className="font-medium text-foreground">記憶機能</p>
            <p className="text-caption text-[var(--text-secondary)]">
              オフにすると、新しい保存と利用を止めます
            </p>
          </div>
          <Button
            size="sm"
            variant={settings.enabled ? "secondary" : "primary"}
            disabled={pending}
            className="w-full min-[390px]:w-auto"
            onClick={() => onToggleEnabled(!settings.enabled)}
            aria-pressed={settings.enabled}
          >
            {settings.enabled ? "オン（停止する）" : "オフ（再開する）"}
          </Button>
        </div>
        {(
          [
            ["explicitOnly", "明示した内容だけ記憶する", settings.explicitOnly],
            ["proposeFromCorrections", "修正から候補を提案する", settings.proposeFromCorrections],
            [
              "blockSensitiveStorage",
              "送信先・保存先などの大切な情報は保存しない",
              settings.blockSensitiveStorage,
            ],
          ] as const
        ).map(([key, label, checked]) => (
          <label
            key={key}
            className="flex min-h-[44px] items-center gap-3 text-sm text-foreground"
          >
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={checked}
              onChange={(event) =>
                startTransition(async () => {
                  setSettings(
                    await updatePersonalMemorySettingsClient({
                      [key]: event.target.checked,
                    }),
                  );
                })
              }
            />
            {label}
          </label>
        ))}
      </Card>

      <Card padding="md" className="space-y-3 border border-[var(--border-subtle)]">
        <h2 className="text-section font-semibold text-foreground">明示して覚える</h2>
        <label className="block space-y-1.5 text-sm">
          <span className="text-[var(--text-secondary)]">種類</span>
          <select
            className={selectClassName}
            value={scope}
            onChange={(event) => setScope(event.target.value as PersonalMemoryScope)}
          >
            {Object.entries(SCOPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="タイトル"
          placeholder="例: 文体"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Textarea
          label="内容"
          placeholder="例: 短く丁寧に書く"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <Button
          disabled={pending || !settings.enabled}
          className="w-full min-[390px]:w-auto"
          onClick={onCreate}
        >
          記憶する
        </Button>
      </Card>

      <section className="space-y-3" aria-label="記憶の絞り込み">
        <Input
          label="検索"
          placeholder="タイトル・内容・種類で探す"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="block space-y-1.5 text-sm">
          <span className="text-[var(--text-secondary)]">種類で絞る</span>
          <select
            className={selectClassName}
            value={scopeFilter}
            onChange={(event) =>
              setScopeFilter(event.target.value as PersonalMemoryScope | "all")
            }
          >
            <option value="all">すべて</option>
            {PERSONAL_MEMORY_SCOPES.map((value) => (
              <option key={value} value={value}>
                {SCOPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {conflicts.length > 0 ? (
        <Card
          padding="md"
          className="space-y-2 border border-[var(--border-subtle)]"
          role="region"
          aria-labelledby="memory-conflicts-heading"
        >
          <h2 id="memory-conflicts-heading" className="text-section font-semibold">
            確認が必要な記憶
          </h2>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {conflicts.slice(0, 5).map((conflict) => (
              <li key={conflict.id}>{conflict.message}</li>
            ))}
          </ul>
          <p className="text-caption text-[var(--text-muted)]">
            矛盾がある場合は、使わない方を停止または削除してください。
          </p>
        </Card>
      ) : null}

      <section className="space-y-3" aria-labelledby="memory-list-heading">
        <h2 id="memory-list-heading" className="sr-only">
          記憶の一覧
        </h2>
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="記憶の状態"
          className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveTab(1);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveTab(-1);
            }
          }}
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`memory-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`memory-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              className={cn(
                "min-h-[44px] min-w-[44px] rounded-full px-4 text-sm focus-ring",
                tab === item.id
                  ? "bg-accent text-[var(--accent-foreground,#fff)]"
                  : "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
              )}
            >
              {item.label}
              {counts[item.id] > 0 ? ` ${counts[item.id]}` : ""}
            </button>
          ))}
        </div>

        <ul
          id={`memory-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`memory-tab-${tab}`}
          className="space-y-3"
        >
          {filtered.length === 0 ? (
            <li className="text-sm text-[var(--text-secondary)]">該当する記憶はありません</li>
          ) : (
            filtered.map((memory) => (
              <li key={memory.id}>
                <Card padding="md" className="border border-[var(--border-subtle)]">
                  <div className="flex flex-wrap gap-2 text-caption text-[var(--text-secondary)]">
                    <span>{SCOPE_LABELS[memory.scope]}</span>
                    <span>{layerLabel(memory)}</span>
                    <span>{SOURCE_LABELS[memory.source]}</span>
                    <span>{STATUS_LABELS[memory.status]}</span>
                  </div>
                  {editingId === memory.id ? (
                    <div className="mt-3 space-y-3">
                      <Input
                        label="タイトル"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                      />
                      <Textarea
                        label="内容"
                        value={editSummary}
                        onChange={(event) => setEditSummary(event.target.value)}
                      />
                      <div className="flex flex-col gap-2 min-[390px]:flex-row">
                        <Button
                          size="sm"
                          disabled={pending}
                          className="w-full min-[390px]:w-auto"
                          onClick={() =>
                            runAction(async () => {
                              await updatePersonalMemoryClient(memory.id, {
                                title: editTitle.trim(),
                                summary: editSummary.trim(),
                                value: { ...memory.value, text: editSummary.trim() },
                              });
                              setEditingId(null);
                            })
                          }
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full min-[390px]:w-auto"
                          onClick={() => setEditingId(null)}
                        >
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="mt-2 text-card-title font-semibold text-foreground">
                        {memory.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {memory.summary}
                      </p>
                    </>
                  )}
                  <p className="mt-2 text-caption text-[var(--text-muted)]">
                    最後に使った日:{" "}
                    {memory.lastUsedAt
                      ? new Date(memory.lastUsedAt).toLocaleString("ja-JP")
                      : "まだ使っていません"}
                    {memory.confirmedAt
                      ? ` · 確認 ${new Date(memory.confirmedAt).toLocaleString("ja-JP")}`
                      : ""}
                    {memory.expiresAt
                      ? ` · 期限 ${new Date(memory.expiresAt).toLocaleDateString("ja-JP")}`
                      : ""}
                  </p>
                  {memory.evidence[0] ? (
                    <p className="mt-1 text-caption text-[var(--text-muted)]">
                      根拠: {memory.evidence[0].summary}
                    </p>
                  ) : null}
                  {memory.candidateReason ? (
                    <p className="mt-1 text-caption text-[var(--text-muted)]">
                      提案理由: {memory.candidateReason}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2 min-[390px]:flex-row min-[390px]:flex-wrap">
                    {memory.status === "candidate" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={pending}
                          className="w-full min-[390px]:w-auto"
                          onClick={() =>
                            runAction(async () => {
                              await approvePersonalMemoryCandidate(memory.id, "global");
                            })
                          }
                        >
                          確認して記憶する
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          className="w-full min-[390px]:w-auto"
                          onClick={() =>
                            runAction(async () => {
                              await approvePersonalMemoryCandidate(memory.id, "automation");
                            })
                          }
                        >
                          この自動化だけ
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          className="w-full min-[390px]:w-auto"
                          onClick={() =>
                            runAction(async () => {
                              await rejectPersonalMemoryCandidate(memory.id);
                            })
                          }
                        >
                          記憶しない
                        </Button>
                      </>
                    ) : null}
                    {memory.status === "active" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        className="w-full min-[390px]:w-auto"
                        onClick={() =>
                          runAction(async () => {
                            await updatePersonalMemoryClient(memory.id, {
                              status: "paused",
                            });
                          })
                        }
                      >
                        使わない
                      </Button>
                    ) : null}
                    {memory.status === "paused" || memory.status === "superseded" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        className="w-full min-[390px]:w-auto"
                        onClick={() =>
                          runAction(async () => {
                            await updatePersonalMemoryClient(memory.id, {
                              status: "active",
                            });
                          })
                        }
                      >
                        使う
                      </Button>
                    ) : null}
                    {memory.status !== "deleted" && memory.status !== "candidate" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        className="w-full min-[390px]:w-auto"
                        onClick={() => {
                          setEditingId(memory.id);
                          setEditTitle(memory.title);
                          setEditSummary(memory.summary);
                        }}
                      >
                        編集
                      </Button>
                    ) : null}
                    {memory.status !== "deleted" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        className="w-full min-[390px]:w-auto"
                        onClick={() => setDeleteTarget(memory)}
                      >
                        削除
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-2 min-[390px]:flex-row min-[390px]:flex-wrap" aria-label="整理">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          className="w-full min-[390px]:w-auto"
          onClick={() =>
            startTransition(async () => {
              const data = await exportPersonalMemoriesClient();
              const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "minervot-memory.json";
              a.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          書き出す
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          className="w-full min-[390px]:w-auto"
          onClick={() =>
            runAction(async () => {
              await pauseAllPersonalMemoriesClient();
            })
          }
        >
          古い記憶を整理
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          className="w-full min-[390px]:w-auto"
          onClick={() => setWipeAll(true)}
        >
          すべて削除
        </Button>
      </section>

      {deleteTarget || wipeAll ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            setDeleteTarget(null);
            setWipeAll(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-delete-title"
            className="w-full max-w-sm rounded-[var(--radius-2xl)] bg-[var(--card)] p-5 shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="memory-delete-title" className="text-sm font-semibold text-foreground">
              {wipeAll ? "すべての記憶を削除しますか？" : "この記憶を削除しますか？"}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {wipeAll
                ? "削除した内容は、次回の作成に使われなくなります。"
                : `「${deleteTarget?.title}」は次回の作成に使われなくなります。`}
            </p>
            <div className="mt-4 flex flex-col gap-2 min-[390px]:flex-row">
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                className="w-full min-[390px]:w-auto"
                onClick={() =>
                  runAction(async () => {
                    if (wipeAll) {
                      await deleteAllPersonalMemoriesClient();
                    } else if (deleteTarget) {
                      await deletePersonalMemoryClient(deleteTarget.id);
                    }
                    setDeleteTarget(null);
                    setWipeAll(false);
                  })
                }
              >
                削除する
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full min-[390px]:w-auto"
                onClick={() => {
                  setDeleteTarget(null);
                  setWipeAll(false);
                }}
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
