"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

type Tab = "active" | "candidate" | "paused" | "rejected" | "expired" | "superseded" | "deleted";

function layerLabel(memory: PersonalMemoryRecord): string {
  if (memory.appliesTo.automationIds.length > 0) return "自動化専用";
  if (memory.appliesTo.artifactTypes.includes("x_post")) return "X投稿専用";
  if (memory.appliesTo.artifactTypes.length > 0 && !memory.appliesTo.global) {
    return "チャンネル専用";
  }
  if (memory.scope === "preferred_formats") return "成果物形式";
  return "ユーザー共通";
}

export function PersonalMemorySettingsPanel() {
  const [memories, setMemories] = useState<PersonalMemoryRecord[]>([]);
  const [settings, setSettings] = useState<PersonalMemorySettings | null>(null);
  const [tab, setTab] = useState<Tab>("active");
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

  const reload = useCallback(async () => {
    const payload = await fetchPersonalMemories("all");
    setMemories(payload.memories);
    setSettings(payload.settings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPersonalMemories("all")
      .then((payload) => {
        if (cancelled) return;
        setMemories(payload.memories);
        setSettings(payload.settings);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (error && !settings) {
    return (
      <div className="space-y-3 p-4">
        <ErrorState message={error} />
        <Button onClick={() => void reload()}>再読み込み</Button>
      </div>
    );
  }
  if (!settings) return <LoadingState />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 pb-[max(6rem,env(safe-area-inset-bottom))]">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          MINERVOTが記憶していること
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          仕事の好みを安全に覚え、次回の入力と修正を減らします。勝手には保存しません。
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          仕事の手順・テンプレの詳細は{" "}
          <Link href="/settings/work-memory" className="text-accent underline">
            仕事の記憶
          </Link>
          でも管理できます。
        </p>
      </header>

      <section className="space-y-3 rounded-2xl bg-[var(--surface-muted)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">記憶機能</p>
            <p className="text-xs text-[var(--text-secondary)]">
              OFFにすると新規保存と利用を止めます
            </p>
          </div>
          <Button
            size="sm"
            variant={settings.enabled ? "secondary" : "primary"}
            disabled={pending}
            onClick={() => onToggleEnabled(!settings.enabled)}
          >
            {settings.enabled ? "ON（停止する）" : "OFF（再開する）"}
          </Button>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.explicitOnly}
            onChange={(e) =>
              startTransition(async () => {
                setSettings(
                  await updatePersonalMemorySettingsClient({
                    explicitOnly: e.target.checked,
                  }),
                );
              })
            }
          />
          明示した内容だけ記憶する
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.proposeFromCorrections}
            onChange={(e) =>
              startTransition(async () => {
                setSettings(
                  await updatePersonalMemorySettingsClient({
                    proposeFromCorrections: e.target.checked,
                  }),
                );
              })
            }
          />
          修正から候補を提案する
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.blockSensitiveStorage}
            onChange={(e) =>
              startTransition(async () => {
                setSettings(
                  await updatePersonalMemorySettingsClient({
                    blockSensitiveStorage: e.target.checked,
                  }),
                );
              })
            }
          />
          送信先・保存先などの大切な情報は保存しない
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">明示して覚える</h2>
        <select
          className="min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          value={scope}
          onChange={(e) => setScope(e.target.value as PersonalMemoryScope)}
        >
          {Object.entries(SCOPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          placeholder="タイトル（例: 文体）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          placeholder="内容（例: 短く丁寧に書く）"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <Button disabled={pending || !settings.enabled} onClick={onCreate}>
          記憶する
        </Button>
      </section>

      <section className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span>検索</span>
          <input
            className="min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            placeholder="タイトル・内容・スコープで検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>スコープ</span>
          <select
            className="min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={scopeFilter}
            onChange={(e) =>
              setScopeFilter(e.target.value as PersonalMemoryScope | "all")
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
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium">競合している記憶</h2>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {conflicts.slice(0, 5).map((conflict) => (
              <li key={conflict.id}>{conflict.message}</li>
            ))}
          </ul>
          <p className="text-xs text-[var(--text-muted)]">
            矛盾が自動で解けない場合は、不要な記憶を無効化または削除してください。
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["active", "使用中"],
              ["candidate", "候補"],
              ["paused", "使用停止"],
              ["rejected", "拒否済み"],
              ["expired", "期限切れ"],
              ["superseded", "置き換え済み"],
              ["deleted", "削除済み"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[44px] min-w-[44px] rounded-full px-4 text-xs ${
                tab === id
                  ? "bg-accent text-[var(--accent-foreground)]"
                  : "bg-[var(--surface-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="space-y-3">
          {filtered.length === 0 ? (
            <li className="text-sm text-[var(--text-secondary)]">該当する記憶はありません</li>
          ) : (
            filtered.map((memory) => (
              <li
                key={memory.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                  <span>{KIND_LABELS[memory.kind]}</span>
                  <span>{SCOPE_LABELS[memory.scope]}</span>
                  <span>{layerLabel(memory)}</span>
                  <span>{SOURCE_LABELS[memory.source]}</span>
                  <span>{STATUS_LABELS[memory.status]}</span>
                </div>
                {editingId === memory.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      className="min-h-[44px] w-full rounded-xl border border-[var(--border)] px-3 text-sm"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
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
                        onClick={() => setEditingId(null)}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-semibold">{memory.title}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {memory.summary}
                    </p>
                  </>
                )}
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  最終適用:{" "}
                  {memory.lastUsedAt
                    ? new Date(memory.lastUsedAt).toLocaleString("ja-JP")
                    : "未使用"}
                  {memory.confirmedAt
                    ? ` · 確認 ${new Date(memory.confirmedAt).toLocaleString("ja-JP")}`
                    : ""}
                  {memory.expiresAt
                    ? ` · 期限 ${new Date(memory.expiresAt).toLocaleDateString("ja-JP")}`
                    : ""}
                </p>
                {memory.evidence[0] ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    根拠: {memory.evidence[0].summary}
                    {memory.sourceJobId ? ` · job ${memory.sourceJobId}` : ""}
                    {memory.sourceBatchId ? ` · batch ${memory.sourceBatchId}` : ""}
                  </p>
                ) : null}
                {memory.candidateReason ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    作成理由: {memory.candidateReason}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {memory.status === "candidate" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
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
                      onClick={() =>
                        runAction(async () => {
                          await updatePersonalMemoryClient(memory.id, {
                            status: "paused",
                          });
                        })
                      }
                    >
                      無効化
                    </Button>
                  ) : null}
                  {memory.status === "paused" || memory.status === "superseded" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        runAction(async () => {
                          await updatePersonalMemoryClient(memory.id, {
                            status: "active",
                          });
                        })
                      }
                    >
                      有効化
                    </Button>
                  ) : null}
                  {memory.status !== "deleted" && memory.status !== "candidate" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
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
                      onClick={() => setDeleteTarget(memory)}
                    >
                      削除
                    </Button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const data = await exportPersonalMemoriesClient();
              const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "atlas-personal-memory.json";
              a.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          エクスポート
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            runAction(async () => {
              await pauseAllPersonalMemoriesClient();
            })
          }
        >
          古い記憶を整理（一括停止）
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (!window.confirm("すべての記憶を削除します。よろしいですか？")) {
                return;
              }
              await deleteAllPersonalMemoriesClient();
              await reload();
            })
          }
        >
          全削除
        </Button>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5">
            <p className="text-sm font-medium">この記憶を削除しますか？</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              「{deleteTarget.title}」は次回の生成に使われなくなります。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  runAction(async () => {
                    await deletePersonalMemoryClient(deleteTarget.id);
                    setDeleteTarget(null);
                  })
                }
              >
                削除する
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--danger,#9b2c2c)]">{error}</p>
          <Button size="sm" variant="secondary" onClick={() => void reload()}>
            再読み込みして再試行
          </Button>
        </div>
      ) : null}
    </div>
  );
}
