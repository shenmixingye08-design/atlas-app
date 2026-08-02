"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import {
  createPersonalMemoryClient,
  decidePersonalMemoryCandidate,
  deleteAllPersonalMemoriesClient,
  deletePersonalMemoryClient,
  disableMemoryForThisRunClient,
  exportPersonalMemoriesClient,
  fetchMemoryApplyPreview,
  fetchMemoryQualityDashboard,
  fetchPersonalMemories,
  fetchPredictiveApplyPreview,
  fetchPredictiveMemoryDashboard,
  pauseAllPersonalMemoriesClient,
  updatePersonalMemoryClient,
  updatePersonalMemorySettingsClient,
} from "@/lib/personal-memory/client";
import { confidenceLabel } from "@/lib/personal-memory/confidence";
import {
  KIND_LABELS,
  SCOPE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/personal-memory/labels";
import type {
  MemoryApplyPreviewItem,
  PersonalMemoryRecord,
  PersonalMemorySettings,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";
import type { MemoryQualityDashboard } from "@/lib/personal-memory/quality/types";
import type {
  PredictiveApplyPreview,
  PredictiveMemoryDashboard,
} from "@/lib/personal-memory/predict/types";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { MemoryQualityDashboardPanel } from "@/components/personal-memory/memory-quality-dashboard";
import { PredictiveMemoryDashboardPanel } from "@/components/personal-memory/predictive-memory-dashboard";
import { PredictiveMemoryPreview } from "@/components/personal-memory/predictive-memory-preview";

type Tab = "active" | "candidate" | "paused" | "rejected" | "expired" | "deleted";

const DISPLAY_GROUPS: Array<{
  id: string;
  label: string;
  scopes: PersonalMemoryScope[];
}> = [
  {
    id: "writing",
    label: "文体",
    scopes: ["writing_style", "work_content_style", "language"],
  },
  {
    id: "layout",
    label: "レイアウト",
    scopes: [
      "document_design",
      "color_palette",
      "word_template",
      "excel_template",
      "powerpoint_theme",
      "pdf_layout",
    ],
  },
  {
    id: "destination",
    label: "保存先",
    scopes: ["default_storage_locations", "file_naming", "artifact_naming"],
  },
  {
    id: "notify",
    label: "通知",
    scopes: ["notification_preferences"],
  },
  {
    id: "approval",
    label: "承認",
    scopes: ["approval_preferences", "automation_execution"],
  },
  {
    id: "formats",
    label: "成果物形式",
    scopes: ["preferred_formats", "title_format", "sheet_naming"],
  },
  {
    id: "common",
    label: "よく使う設定",
    scopes: [
      "recurring_work_preferences",
      "calendar_defaults",
      "wordpress_defaults",
      "date_format",
      "timezone",
      "currency",
    ],
  },
];

function scopeGroupLabel(memory: PersonalMemoryRecord): string {
  if (memory.appliesTo.automationIds.length > 0) return "Automation専用";
  if (memory.appliesTo.workCategories.length > 0) return "仕事カテゴリ";
  if (memory.appliesTo.companyIds.length > 0) return "会社別";
  if (memory.appliesTo.templateIds.length > 0) return "テンプレート別";
  const group = DISPLAY_GROUPS.find((g) => g.scopes.includes(memory.scope));
  return group?.label ?? "その他";
}

export function PersonalMemorySettingsPanel() {
  const [memories, setMemories] = useState<PersonalMemoryRecord[]>([]);
  const [settings, setSettings] = useState<PersonalMemorySettings | null>(null);
  const [dashboard, setDashboard] = useState<MemoryQualityDashboard | null>(
    null,
  );
  const [predictDash, setPredictDash] =
    useState<PredictiveMemoryDashboard | null>(null);
  const [prediction, setPrediction] = useState<PredictiveApplyPreview | null>(
    null,
  );
  const [applyPreview, setApplyPreview] = useState<MemoryApplyPreviewItem[]>(
    [],
  );
  const [tab, setTab] = useState<Tab>("active");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState<PersonalMemoryScope>("writing_style");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");

  const reload = useCallback(async () => {
    const payload = await fetchPersonalMemories("all");
    setMemories(payload.memories);
    setSettings(payload.settings);
    try {
      setDashboard(await fetchMemoryQualityDashboard());
    } catch {
      setDashboard(null);
    }
    try {
      setPredictDash(await fetchPredictiveMemoryDashboard());
    } catch {
      setPredictDash(null);
    }
    try {
      setApplyPreview(await fetchMemoryApplyPreview({ workCategory: "営業資料" }));
    } catch {
      setApplyPreview([]);
    }
    try {
      setPrediction(
        await fetchPredictiveApplyPreview({ workCategory: "営業資料" }),
      );
    } catch {
      setPrediction(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPersonalMemories("all")
      .then(async (payload) => {
        if (cancelled) return;
        setMemories(payload.memories);
        setSettings(payload.settings);
        try {
          const nextDash = await fetchMemoryQualityDashboard();
          if (!cancelled) setDashboard(nextDash);
        } catch {
          if (!cancelled) setDashboard(null);
        }
        try {
          const nextPred = await fetchPredictiveMemoryDashboard();
          if (!cancelled) setPredictDash(nextPred);
        } catch {
          if (!cancelled) setPredictDash(null);
        }
        try {
          const preview = await fetchMemoryApplyPreview({
            workCategory: "営業資料",
          });
          if (!cancelled) setApplyPreview(preview);
        } catch {
          if (!cancelled) setApplyPreview([]);
        }
        try {
          const pred = await fetchPredictiveApplyPreview({
            workCategory: "営業資料",
          });
          if (!cancelled) setPrediction(pred);
        } catch {
          if (!cancelled) setPrediction(null);
        }
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

  const grouped = useMemo(() => {
    const map = new Map<string, PersonalMemoryRecord[]>();
    for (const memory of filtered) {
      const label = scopeGroupLabel(memory);
      const list = map.get(label) ?? [];
      list.push(memory);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [filtered]);

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
        <p className="text-xs font-semibold tracking-[0.08em] text-[var(--brand)]">
          MINERVOT
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          MINERVOTが覚えていること
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          成果物の好みを安全に覚え、使うほど手直しが減ります。推測は候補までで、あなたの承認後だけ使います。
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          仕事の手順・テンプレの詳細は{" "}
          <Link href="/settings/work-memory" className="text-[var(--brand)] underline">
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

      <PredictiveMemoryPreview
        prediction={prediction}
        onAccepted={(next) => setPrediction(next)}
      />

      <PredictiveMemoryDashboardPanel
        dashboard={predictDash}
        onRefresh={() => void reload()}
      />

      <MemoryQualityDashboardPanel
        dashboard={dashboard}
        applyPreview={applyPreview}
      />

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
                  ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                  : "bg-[var(--surface-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            該当する記憶はありません
          </p>
        ) : (
          grouped.map(([groupLabel, rows]) => (
            <div key={groupLabel} className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">
                {groupLabel}
              </h3>
              <ul className="space-y-3">
                {rows.map((memory) => (
                  <li
                    key={memory.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                      <span>{KIND_LABELS[memory.kind]}</span>
                      <span>{SCOPE_LABELS[memory.scope]}</span>
                      <span>{SOURCE_LABELS[memory.source]}</span>
                      <span>{STATUS_LABELS[memory.status]}</span>
                      <span>{confidenceLabel(memory.confidence)}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold">{memory.title}</p>
                    {editingId === memory.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className="min-h-20 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                          value={editSummary}
                          onChange={(e) => setEditSummary(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await updatePersonalMemoryClient(memory.id, {
                                  summary: editSummary.trim(),
                                  value: {
                                    ...memory.value,
                                    text: editSummary.trim(),
                                  },
                                });
                                setEditingId(null);
                                await reload();
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
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {memory.summary}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      最終使用:{" "}
                      {memory.lastUsedAt
                        ? new Date(memory.lastUsedAt).toLocaleString("ja-JP")
                        : "未使用"}
                      {memory.appliesTo.automationIds.length > 0
                        ? " · Automation専用"
                        : memory.appliesTo.workCategories.length > 0
                          ? ` · カテゴリ: ${memory.appliesTo.workCategories.join(", ")}`
                          : " · 全体"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {memory.status === "candidate" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await decidePersonalMemoryCandidate(
                                  memory.id,
                                  "always",
                                );
                                await reload();
                              })
                            }
                          >
                            はい
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await decidePersonalMemoryCandidate(
                                  memory.id,
                                  "once",
                                );
                                await reload();
                              })
                            }
                          >
                            今回だけ
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await decidePersonalMemoryCandidate(
                                  memory.id,
                                  "never",
                                );
                                await reload();
                              })
                            }
                          >
                            いいえ
                          </Button>
                        </>
                      ) : null}
                      {memory.status === "active" || memory.status === "paused" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            setEditingId(memory.id);
                            setEditSummary(memory.summary);
                          }}
                        >
                          編集
                        </Button>
                      ) : null}
                      {memory.status === "active" ? (
                        <>
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
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await disableMemoryForThisRunClient(memory.id);
                                await reload();
                              })
                            }
                          >
                            今回だけ無効
                          </Button>
                        </>
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
                ))}
              </ul>
            </div>
          ))
        )}
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
              a.download = "minervot-memory.json";
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
                  "MINERVOTが覚えていることをすべて削除します。よろしいですか？",
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

      {error ? (
        <p className="text-sm text-[var(--error)]">{error}</p>
      ) : null}
    </div>
  );
}
