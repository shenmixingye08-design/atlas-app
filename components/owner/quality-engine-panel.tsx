"use client";

import { useEffect, useState } from "react";

import type { QualityEngineTelemetry } from "@/lib/quality-engine/types";
import { Card } from "@/components/ui/card";

type QualityEngineLogEntry = QualityEngineTelemetry & {
  userId: string | null;
  assignmentHint: string;
};

type ApiResponse = {
  entries: QualityEngineLogEntry[];
};

/**
 * Owner-only panel. Shows Planner/Writer/Reviewer/Judge timings,
 * improve count, and quality score — never shown to end users.
 */
export function QualityEnginePanel() {
  const [entries, setEntries] = useState<QualityEngineLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/owner/quality-engine?limit=80", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        return (await res.json()) as ApiResponse;
      })
      .then((data) => {
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("品質ログを取得できませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Quality Engine</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          処理時間・改善回数・品質スコアのみ（一般ユーザーには非表示）
        </p>
      </div>

      {error && (
        <Card padding="md">
          <p className="text-sm text-[var(--status-error)]">{error}</p>
        </Card>
      )}

      {!error && entries.length === 0 && (
        <Card padding="md">
          <p className="text-sm text-[var(--text-muted)]">
            まだ品質エンジンの実行ログがありません。
          </p>
        </Card>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">時刻</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">種類</th>
              <th className="px-3 py-2 font-medium">スコア</th>
              <th className="px-3 py-2 font-medium">改善</th>
              <th className="px-3 py-2 font-medium">Planner</th>
              <th className="px-3 py-2 font-medium">Writer</th>
              <th className="px-3 py-2 font-medium">Reviewer</th>
              <th className="px-3 py-2 font-medium">Judge</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={`${entry.recordedAt}-${index}`}
                className="border-t border-[var(--border)]"
              >
                <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                  {new Date(entry.recordedAt).toLocaleString("ja-JP")}
                </td>
                <td className="px-3 py-2">{entry.tier}</td>
                <td className="px-3 py-2">{entry.promptKind}</td>
                <td className="px-3 py-2 tabular-nums font-medium">
                  {entry.finalScore ?? "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{entry.improveCount}</td>
                <td className="px-3 py-2 tabular-nums">
                  {entry.timings.plannerMs}ms
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {entry.timings.writerMs}ms
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {entry.timings.reviewerMs}ms
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {entry.timings.judgeMs}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
