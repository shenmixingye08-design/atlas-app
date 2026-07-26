"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import type {
  ArtifactFeedbackRecord,
  ArtifactFeedbackSummary,
  FeedbackDivergenceWarning,
  FeedbackImprovementCandidate,
} from "@/lib/artifact-feedback/types";
import type { ArtifactFeedbackOwnerNotice } from "@/lib/artifact-feedback/notifications";

type SummaryPayload = {
  summary: ArtifactFeedbackSummary;
  positiveReasonRanking: Array<{ reason: string; count: number; rate: number | null }>;
  negativeReasonRanking: Array<{ reason: string; count: number; rate: number | null }>;
  byArtifactType: Array<{ key: string; total: number; positiveRate: number | null }>;
  byModel: Array<{ key: string; total: number; positiveRate: number | null }>;
  byPromptVersion: Array<{ key: string; total: number; positiveRate: number | null }>;
  byTemplate: Array<{ key: string; total: number; positiveRate: number | null }>;
  byKnowledgeVersion: Array<{ key: string; total: number; positiveRate: number | null }>;
  bySmartContext: Array<{ key: string; total: number; positiveRate: number | null }>;
  divergence: FeedbackDivergenceWarning[];
  improvements: FeedbackImprovementCandidate[];
  notices: ArtifactFeedbackOwnerNotice[];
  dataStatus: "ok" | "insufficient_data";
};

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "データ不足";
  return `${v}%`;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return String(v);
}

/**
 * Owner-only artifact feedback analytics. No synthetic fill data.
 */
export function ArtifactFeedbackPanel() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [records, setRecords] = useState<ArtifactFeedbackRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<"all" | "positive" | "negative">(
    "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerComment, setOwnerComment] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [sRes, lRes] = await Promise.all([
          fetch("/api/owner/artifact-feedback/summary", { cache: "no-store" }),
          fetch("/api/owner/artifact-feedback?limit=500", { cache: "no-store" }),
        ]);
        if (!sRes.ok || !lRes.ok) throw new Error("failed");
        const s = (await sRes.json()) as SummaryPayload;
        const l = (await lRes.json()) as { records: ArtifactFeedbackRecord[] };
        if (!cancelled) {
          setSummary(s);
          setRecords(l.records ?? []);
        }
      } catch {
        if (!cancelled) setError("成果物評価を取得できませんでした。");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (ratingFilter === "all") return records;
    return records.filter((r) => r.ratingType === ratingFilter);
  }, [records, ratingFilter]);

  const selected = filtered.find((r) => r.id === selectedId) ?? null;

  async function exportCsv() {
    window.open("/api/owner/artifact-feedback/export?format=csv", "_blank");
  }

  async function saveOwnerRating(ratingType: "positive" | "negative") {
    if (!selected) return;
    const res = await fetch(
      `/api/owner/artifact-feedback/${selected.id}/owner-rating`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId: selected.artifactId,
          ratingType,
          comment: ownerComment || null,
        }),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as { feedback: ArtifactFeedbackRecord };
      setRecords((prev) => {
        const without = prev.filter(
          (r) =>
            !(
              r.userId === data.feedback.userId &&
              r.artifactId === data.feedback.artifactId
            ),
        );
        return [data.feedback, ...without];
      });
    }
  }

  if (error) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--status-error)]">{error}</p>
      </Card>
    );
  }

  const s = summary?.summary;

  return (
    <section className="space-y-6" data-testid="owner-artifact-feedback">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium text-foreground">成果物評価</h2>
          <p className="text-sm text-[var(--foreground-muted)]">
            ユーザーの👍👎評価を集計・分析します（自動学習なし）
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-4 text-sm"
          onClick={() => void exportCsv()}
        >
          CSV出力
        </button>
      </div>

      {summary?.notices && summary.notices.length > 0 && (
        <Card padding="lg" className="space-y-2">
          <h3 className="text-sm font-medium">通知</h3>
          {summary.notices.map((n) => (
            <p key={n.id} className="text-sm text-[var(--status-warning)]">
              {n.message}（{n.count}件）
            </p>
          ))}
        </Card>
      )}

      {summary?.divergence && summary.divergence.length > 0 && (
        <Card padding="lg" className="space-y-2">
          <h3 className="text-sm font-medium">乖離警告</h3>
          {summary.divergence.slice(0, 10).map((d) => (
            <p key={`${d.artifactId}:${d.message}`} className="text-sm">
              {d.message} — {d.artifactId}（Score {fmtNum(d.qualityScore)}）
            </p>
          ))}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["総評価数", fmtNum(s?.totalRatings)],
          ["👍数", fmtNum(s?.positiveCount)],
          ["👎数", fmtNum(s?.negativeCount)],
          ["高評価率", fmtRate(s?.positiveRate)],
          ["低評価率", fmtRate(s?.negativeRate)],
          ["評価付き成果物数", fmtNum(s?.ratedArtifactCount)],
          ["評価なし成果物数", fmtNum(s?.unratedArtifactCount)],
          ["そのまま利用率", fmtRate(s?.acceptedWithoutEditRate)],
          ["再生成率", fmtRate(s?.regenerateRate)],
          ["ダウンロード率", fmtRate(s?.downloadRate)],
          ["共有率", fmtRate(s?.shareRate)],
          ["平均Quality Score", fmtNum(s?.avgQualityScore)],
          ["平均API原価", fmtNum(s?.avgApiCost)],
          ["高評価の平均原価", fmtNum(s?.avgPositiveCost)],
          ["低評価の平均原価", fmtNum(s?.avgNegativeCost)],
        ].map(([label, value]) => (
          <Card key={label} padding="md">
            <p className="text-xs text-[var(--foreground-muted)]">{label}</p>
            <p className="mt-1 text-lg font-medium">{value}</p>
          </Card>
        ))}
      </div>

      {!s || s.totalRatings === 0 ? (
        <Card padding="lg">
          <p className="text-sm text-[var(--foreground-muted)]">
            データ不足 — まだユーザー評価はありません。
          </p>
        </Card>
      ) : null}

      <Card padding="lg" className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "すべて"],
              ["positive", "👍のみ"],
              ["negative", "👎のみ"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`min-h-11 rounded-xl border px-3 text-sm ${
                ratingFilter === id
                  ? "border-foreground bg-[var(--surface-muted)]"
                  : "border-[var(--border-subtle)]"
              }`}
              onClick={() => setRatingFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--foreground-muted)]">
                {[
                  "評価",
                  "成果物種類",
                  "ユーザー",
                  "作成日時",
                  "Quality Score",
                  "Model",
                  "Prompt",
                  "再生成",
                  "原価",
                  "理由",
                  "コメント",
                  "詳細",
                ].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border-subtle)]"
                >
                  <td className="px-2 py-2">
                    {r.ratingType === "positive" ? "👍" : "👎"}
                  </td>
                  <td className="px-2 py-2">{r.artifactType ?? "—"}</td>
                  <td className="px-2 py-2">{r.userId.slice(0, 8)}…</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {r.createdAt.slice(0, 16)}
                  </td>
                  <td className="px-2 py-2">{fmtNum(r.qualityScore)}</td>
                  <td className="px-2 py-2">{r.model ?? "—"}</td>
                  <td className="px-2 py-2">{r.promptVersion ?? "—"}</td>
                  <td className="px-2 py-2">{fmtNum(r.regenerationCount)}</td>
                  <td className="px-2 py-2">{fmtNum(r.totalApiCost)}</td>
                  <td className="px-2 py-2 max-w-[12rem] truncate">
                    {[...r.positiveReasons, ...r.negativeReasons].join(", ") ||
                      "—"}
                  </td>
                  <td className="px-2 py-2 max-w-[10rem] truncate">
                    {r.comment ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setSelectedId(r.id)}
                    >
                      開く
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <Card padding="lg" className="space-y-3">
          <h3 className="text-sm font-medium">評価詳細</h3>
          <p className="text-sm">
            {selected.ratingType === "positive" ? "👍 良かった" : "👎 改善が必要"}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">
            成果物ID: {selected.artifactId}
          </p>
          <p className="text-sm">
            理由:{" "}
            {[...selected.positiveReasons, ...selected.negativeReasons].join(
              " / ",
            ) || "なし"}
          </p>
          <p className="text-sm">コメント: {selected.comment || "なし"}</p>
          <p className="text-sm">
            Quality Score: {fmtNum(selected.qualityScore)} / Model:{" "}
            {selected.model ?? "—"} / Prompt: {selected.promptVersion ?? "—"}
          </p>
          <p className="text-sm">
            Template: {selected.templateId ?? selected.templateVersion ?? "—"} /
            Knowledge: {selected.knowledgeVersion ?? "—"}
          </p>
          <p className="text-sm">
            Token: in {fmtNum(selected.inputTokens)} / out{" "}
            {fmtNum(selected.outputTokens)} / 原価 {fmtNum(selected.totalApiCost)}
          </p>
          <p className="text-sm">
            再生成 {fmtNum(selected.regenerationCount)} / 改善{" "}
            {fmtNum(selected.improvementCount)} / DL{" "}
            {selected.downloaded === true ? "済" : "未"} / 最終利用{" "}
            {selected.finalUsed === true ? "あり" : "なし"}
          </p>
          <textarea
            className="w-full rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm"
            rows={2}
            placeholder="Owner改善メモ（任意）"
            value={ownerComment}
            onChange={(e) => setOwnerComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3 text-sm"
              onClick={() => void saveOwnerRating("positive")}
            >
              Owner 👍
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3 text-sm"
              onClick={() => void saveOwnerRating("negative")}
            >
              Owner 👎
            </button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg" className="space-y-2">
          <h3 className="text-sm font-medium">高評価理由ランキング</h3>
          {(summary?.positiveReasonRanking?.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">データ不足</p>
          ) : (
            summary?.positiveReasonRanking.map((row) => (
              <p key={row.reason} className="text-sm">
                {row.reason}: {row.count}（{fmtRate(row.rate)}）
              </p>
            ))
          )}
        </Card>
        <Card padding="lg" className="space-y-2">
          <h3 className="text-sm font-medium">低評価理由ランキング</h3>
          {(summary?.negativeReasonRanking?.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">データ不足</p>
          ) : (
            summary?.negativeReasonRanking.map((row) => (
              <p key={row.reason} className="text-sm">
                {row.reason}: {row.count}（{fmtRate(row.rate)}）
              </p>
            ))
          )}
        </Card>
      </div>

      <Card padding="lg" className="space-y-2">
        <h3 className="text-sm font-medium">分析（高評価率）</h3>
        {(
          [
            ["成果物種類別", summary?.byArtifactType],
            ["Model別", summary?.byModel],
            ["Prompt Version別", summary?.byPromptVersion],
            ["Template別", summary?.byTemplate],
            ["Knowledge Version別", summary?.byKnowledgeVersion],
            ["Smart Context", summary?.bySmartContext],
          ] as const
        ).map(([title, rows]) => (
          <div key={title} className="space-y-1">
            <p className="text-xs text-[var(--foreground-muted)]">{title}</p>
            {!rows || rows.length === 0 ? (
              <p className="text-sm">データ不足</p>
            ) : (
              rows.slice(0, 8).map((row) => (
                <p key={`${title}:${row.key}`} className="text-sm">
                  {row.key}: {fmtRate(row.positiveRate)}（n={row.total}）
                </p>
              ))
            )}
          </div>
        ))}
      </Card>

      <Card padding="lg" className="space-y-2">
        <h3 className="text-sm font-medium">改善候補（ルールベース・自動反映なし）</h3>
        {(summary?.improvements?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            十分な件数の候補はありません。
          </p>
        ) : (
          summary?.improvements.map((c) => (
            <p key={c.id} className="text-sm">
              {c.message} — {c.evidenceCount}件
              {c.evidenceRate != null ? `（${c.evidenceRate}%）` : ""}
              {c.status === "reference" ? "［参考値］" : ""}
            </p>
          ))
        )}
      </Card>
    </section>
  );
}
