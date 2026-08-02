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
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

type Tab = "active" | "candidate" | "paused" | "rejected" | "expired" | "deleted";

export function PersonalMemorySettingsPanel() {
  const [memories, setMemories] = useState<PersonalMemoryRecord[]>([]);
  const [settings, setSettings] = useState<PersonalMemorySettings | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState<PersonalMemoryScope>("writing_style");

  const reload = useCallback(async () => {
    const payload = await fetchPersonalMemories("all");
    setMemories(payload.memories);
    setSettings(payload.settings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Initial fetch from server — async completion updates local view state.
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

  const filtered = useMemo(
    () => memories.filter((m) => m.status === tab),
    [memories, tab],
  );

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">覚えていること</h1>
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
        <label className="flex items-center gap-2 text-sm">
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
        <label className="flex items-center gap-2 text-sm">
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
        <label className="flex items-center gap-2 text-sm">
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
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
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
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
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
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["active", "使用中"],
              ["candidate", "候補"],
              ["paused", "使用停止"],
              ["rejected", "拒否済み"],
              ["expired", "期限切れ"],
              ["deleted", "削除済み"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 text-xs ${
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
                  <span>{SOURCE_LABELS[memory.source]}</span>
                  <span>{STATUS_LABELS[memory.status]}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{memory.title}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {memory.summary}
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  最終使用:{" "}
                  {memory.lastUsedAt
                    ? new Date(memory.lastUsedAt).toLocaleString("ja-JP")
                    : "未使用"}
                  {memory.expiresAt
                    ? ` · 期限 ${new Date(memory.expiresAt).toLocaleDateString("ja-JP")}`
                    : ""}
                  {memory.appliesTo.global
                    ? " · 全体"
                    : ` · 自動化限定 (${memory.appliesTo.automationIds.length})`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {memory.status === "candidate" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await approvePersonalMemoryCandidate(memory.id, "global");
                            await reload();
                          })
                        }
                      >
                        今後も使う
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await approvePersonalMemoryCandidate(
                              memory.id,
                              "automation",
                            );
                            await reload();
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
                          startTransition(async () => {
                            await rejectPersonalMemoryCandidate(memory.id);
                            await reload();
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
                        startTransition(async () => {
                          await updatePersonalMemoryClient(memory.id, {
                            status: "paused",
                          });
                          await reload();
                        })
                      }
                    >
                      無効化
                    </Button>
                  ) : null}
                  {memory.status === "paused" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await updatePersonalMemoryClient(memory.id, {
                            status: "active",
                          });
                          await reload();
                        })
                      }
                    >
                      有効化
                    </Button>
                  ) : null}
                  {memory.status !== "deleted" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await deletePersonalMemoryClient(memory.id);
                          await reload();
                        })
                      }
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
            startTransition(async () => {
              await pauseAllPersonalMemoriesClient();
              await reload();
            })
          }
        >
          一括停止
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (
                !window.confirm(
                  "すべての記憶を削除します。よろしいですか？",
                )
              ) {
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

      {error ? <p className="text-sm text-[var(--danger,#9b2c2c)]">{error}</p> : null}
    </div>
  );
}
