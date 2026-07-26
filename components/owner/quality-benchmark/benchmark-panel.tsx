"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";

type Measurable = number | null;

type Overview = {
  sampleCount: number;
  avgQualityScore: Measurable;
  avgOwnerRating: Measurable;
  avgUserRating: Measurable;
  readyToUseRate: Measurable;
  regenerateRate: Measurable;
  downloadRate: Measurable;
  avgApiCost: Measurable;
  avgInputTokens: Measurable;
  avgOutputTokens: Measurable;
  avgProcessingTimeMs: Measurable;
  avgImprovementCount: Measurable;
  avgSmartContextReduction: Measurable;
  failureRate: Measurable;
  dataStatus: "ok" | "insufficient_data";
};

type KindRow = {
  artifactType: string;
  count: number;
  avgQuality: Measurable;
  avgCost: Measurable;
  avgTimeMs: Measurable;
  regenerateRate: Measurable;
  avgOwnerRating: Measurable;
  avgUserRating: Measurable;
  noEditRate: Measurable;
};

type MatrixRow = {
  recordId: string;
  artifactType: string;
  title: string | null;
  priorityScore: number;
  reasons: string[];
  quadrant: string;
};

type CaseRow = {
  id: string;
  name: string;
  artifactType: string;
  enabled: boolean;
};

type RecordRow = {
  id: string;
  artifactType: string;
  title: string | null;
  createdAt: string;
  quality: { qualityScore: Measurable };
  costInfo: { estimatedCost: Measurable; totalApiCost: Measurable };
  contextInfo: {
    estimatedContextTokens: Measurable;
    compressionRate: Measurable;
  };
  processing: { improvementCount: Measurable; extraLlmCalls: Measurable };
  featureFlags: { smartContext: boolean; knowledge: boolean };
  versions: { qualityEngineVersion: string; writerPromptVersion: string };
  ruleEvaluation: { score: number; passed: boolean } | null;
  ownerEvaluation: { overall: number } | null;
  patternLabel: string | null;
};

type ApiPayload = {
  overview: Overview;
  byKind: KindRow[];
  matrix: MatrixRow[];
  regressions: Array<{
    artifactType: string;
    status: string;
    message: string;
  }>;
  smartContextAb: Array<{
    labelA: string;
    labelB: string;
    qualityScoreDelta: Measurable;
    apiCostDelta: Measurable;
    inputTokenDelta: Measurable;
    compressionRateDelta: Measurable;
    notes: string;
  }>;
  cases: CaseRow[];
  records: RecordRow[];
  trends: {
    quality: Array<{ at: string; value: Measurable }>;
    cost: Array<{ at: string; value: Measurable }>;
  };
};

function fmt(v: Measurable, suffix = ""): string {
  if (v == null) return "未計測";
  return `${v}${suffix}`;
}

function pct(v: Measurable): string {
  if (v == null) return "データ不足";
  return `${v}%`;
}

const DEFAULT_PATTERNS = [
  {
    label: "SC_OFF",
    knowledge: true,
    smartContext: false,
    reviewer: true,
    judge: true,
    template: true,
    reference: false,
    maxImproveRounds: null,
    contextBudget: null,
    model: null,
  },
  {
    label: "SC_ON",
    knowledge: true,
    smartContext: true,
    reviewer: true,
    judge: true,
    template: true,
    reference: false,
    maxImproveRounds: null,
    contextBudget: null,
    model: null,
  },
];

export function QualityBenchmarkPanel() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [ownerScore, setOwnerScore] = useState(80);
  const [ratingRecordId, setRatingRecordId] = useState<string>("");

  const load = useCallback(() => {
    void fetch("/api/owner/quality-benchmark", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        return (await res.json()) as ApiPayload;
      })
      .then((payload) => {
        setData(payload);
        setSelectedCases(
          payload.cases.filter((c) => c.enabled).slice(0, 5).map((c) => c.id),
        );
      })
      .catch(() => setError("Benchmarkデータを取得できませんでした。"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const estimatedCost = useMemo(() => {
    // Analyze mode cost is always 0
    return 0;
  }, []);

  async function runBenchmark() {
    setRunMessage(null);
    const res = await fetch("/api/owner/quality-benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run",
        confirmCost: true,
        config: {
          artifactTypes: [],
          caseIds: selectedCases,
          patterns: DEFAULT_PATTERNS,
          repeats: 1,
          tags: ["owner-ui"],
          memo: "Smart Context A/B (no generation LLM)",
          executeGeneration: false,
          aiReevaluate: false,
        },
      }),
    });
    const json = (await res.json()) as {
      errors?: string[];
      run?: { status: string; resultCount: number };
    };
    if (!res.ok) {
      setRunMessage(json.errors?.join(" / ") ?? "実行に失敗しました");
      return;
    }
    setRunMessage(
      `完了: ${json.run?.resultCount ?? 0} 件（追加LLMなし / 予想原価 $${estimatedCost}）`,
    );
    load();
  }

  async function saveOwnerRating() {
    if (!ratingRecordId) return;
    const res = await fetch("/api/owner/quality-benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "owner_feedback",
        recordId: ratingRecordId,
        ownerEvaluation: {
          overall: ownerScore,
          accuracy: ownerScore,
          information: ownerScore,
          persuasiveness: ownerScore,
          readability: ownerScore,
          appearance: ownerScore,
          brandFit: ownerScore,
          lowEditNeed: ownerScore,
          practicalUse: ownerScore,
          betterThanChatGpt: ownerScore,
          usability:
            ownerScore >= 85
              ? "ready"
              : ownerScore >= 70
                ? "minor_edit"
                : ownerScore >= 50
                  ? "major_edit"
                  : "unusable",
          pros: "",
          cons: "",
          missingInfo: "",
          unnecessaryInfo: "",
          nextImprovements: "",
          ratedAt: new Date().toISOString(),
          ratedBy: "owner",
        },
      }),
    });
    if (res.ok) {
      setRunMessage("Owner評価を保存しました");
      load();
    } else {
      setRunMessage("Owner評価の保存に失敗しました");
    }
  }

  if (error) {
    return (
      <Card padding="md">
        <p className="text-sm text-[var(--status-error)]">{error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card padding="md">
        <p className="text-sm text-[var(--text-muted)]">読み込み中…</p>
      </Card>
    );
  }

  const o = data.overview;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Quality Benchmark
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          実データのみ表示。不足時は「データ不足 / 未計測」。通常生成への追加LLMは0。
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">概要KPI</h3>
        {o.dataStatus === "insufficient_data" ? (
          <Card padding="md">
            <p className="text-sm text-[var(--text-muted)]">データ不足</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <tbody>
                {[
                  ["件数", String(o.sampleCount)],
                  ["平均Quality Score", fmt(o.avgQualityScore)],
                  ["平均Owner評価", fmt(o.avgOwnerRating)],
                  ["平均ユーザー評価", fmt(o.avgUserRating)],
                  ["そのまま利用率", pct(o.readyToUseRate)],
                  ["再生成率", pct(o.regenerateRate)],
                  ["ダウンロード率", pct(o.downloadRate)],
                  ["平均API原価", fmt(o.avgApiCost, " USD")],
                  ["平均入力Token", fmt(o.avgInputTokens)],
                  ["平均出力Token", fmt(o.avgOutputTokens)],
                  ["平均処理時間", fmt(o.avgProcessingTimeMs, " ms")],
                  ["平均改善回数", fmt(o.avgImprovementCount)],
                  ["Smart Context削減率", pct(o.avgSmartContextReduction)],
                  ["失敗率", pct(o.failureRate)],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{k}</td>
                    <td className="px-3 py-2 tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">成果物種類別</h3>
        {data.byKind.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">データ不足</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">種類</th>
                  <th className="px-3 py-2">件数</th>
                  <th className="px-3 py-2">品質</th>
                  <th className="px-3 py-2">原価</th>
                  <th className="px-3 py-2">時間</th>
                  <th className="px-3 py-2">再生成</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">修正なし</th>
                </tr>
              </thead>
              <tbody>
                {data.byKind.map((row) => (
                  <tr key={row.artifactType} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{row.artifactType}</td>
                    <td className="px-3 py-2 tabular-nums">{row.count}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.avgQuality)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.avgCost)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.avgTimeMs)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(row.regenerateRate)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.avgOwnerRating)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.avgUserRating)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(row.noEditRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Quality / Cost Matrix（改善優先）</h3>
        {data.matrix.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">データ不足</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">優先度</th>
                  <th className="px-3 py-2">象限</th>
                  <th className="px-3 py-2">種類</th>
                  <th className="px-3 py-2">理由</th>
                </tr>
              </thead>
              <tbody>
                {data.matrix.slice(0, 20).map((row) => (
                  <tr key={row.recordId} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 tabular-nums">{row.priorityScore}</td>
                    <td className="px-3 py-2">{row.quadrant}</td>
                    <td className="px-3 py-2">{row.artifactType}</td>
                    <td className="px-3 py-2">{row.reasons.join(" / ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">品質低下検知</h3>
        {data.regressions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">データ不足</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.regressions.map((r) => (
              <li key={r.artifactType}>
                {r.artifactType}: {r.message}
                {r.status === "insufficient_data" ? "" : ` (${r.status})`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Smart Context A/B</h3>
        {data.smartContextAb.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">データ不足</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">A→B</th>
                  <th className="px-3 py-2">品質差</th>
                  <th className="px-3 py-2">原価差</th>
                  <th className="px-3 py-2">Token差</th>
                  <th className="px-3 py-2">圧縮差</th>
                </tr>
              </thead>
              <tbody>
                {data.smartContextAb.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">
                      {row.labelA}→{row.labelB}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(row.qualityScoreDelta)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(row.apiCostDelta)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(row.inputTokenDelta)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(row.compressionRateDelta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Benchmark Run（追加LLMなし）</h3>
        <p className="text-xs text-[var(--text-muted)]">
          予想最大コスト: ${estimatedCost}（生成LLMオフ）。最大5ケース / 2パターン /
          各1回。
        </p>
        <div className="flex flex-wrap gap-2">
          {data.cases.map((c) => {
            const on = selectedCases.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs ${
                  on
                    ? "border-[var(--accent)] bg-[var(--surface-muted)]"
                    : "border-[var(--border)]"
                }`}
                onClick={() =>
                  setSelectedCases((prev) =>
                    on ? prev.filter((id) => id !== c.id) : [...prev, c.id].slice(0, 5),
                  )
                }
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl bg-foreground px-4 py-2 text-sm text-background"
            onClick={() => void runBenchmark()}
          >
            A/B実行（Context比較）
          </button>
          <a
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
            href="/api/owner/quality-benchmark?export=csv"
          >
            CSV出力
          </a>
          <a
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
            href="/api/owner/quality-benchmark?export=json"
          >
            JSON出力
          </a>
        </div>
        {runMessage && (
          <p className="text-sm text-[var(--text-secondary)]">{runMessage}</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Owner評価</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Record ID
            <input
              className="mt-1 block w-72 rounded-lg border border-[var(--border)] px-2 py-1"
              value={ratingRecordId}
              onChange={(e) => setRatingRecordId(e.target.value)}
              list="benchmark-record-ids"
            />
            <datalist id="benchmark-record-ids">
              {data.records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title ?? r.artifactType}
                </option>
              ))}
            </datalist>
          </label>
          <label className="text-sm">
            総合 (0-100)
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 block w-24 rounded-lg border border-[var(--border)] px-2 py-1"
              value={ownerScore}
              onChange={(e) => setOwnerScore(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
            onClick={() => void saveOwnerRating()}
          >
            評価を保存
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">直近レコード</h3>
        {data.records.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">データ不足</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">時刻</th>
                  <th className="px-3 py-2">種類</th>
                  <th className="px-3 py-2">Pattern</th>
                  <th className="px-3 py-2">QE ver</th>
                  <th className="px-3 py-2">品質</th>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-3 py-2">Ctx tok</th>
                  <th className="px-3 py-2">SC</th>
                  <th className="px-3 py-2">追加LLM</th>
                </tr>
              </thead>
              <tbody>
                {data.records.slice(0, 40).map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                      {new Date(r.createdAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2">{r.artifactType}</td>
                    <td className="px-3 py-2">{r.patternLabel ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.versions.qualityEngineVersion}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(r.quality.qualityScore)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.ruleEvaluation ? r.ruleEvaluation.score : "未計測"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(r.contextInfo.estimatedContextTokens)}
                    </td>
                    <td className="px-3 py-2">
                      {r.featureFlags.smartContext ? "ON" : "OFF"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(r.processing.extraLlmCalls)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">推移（実データ）</h3>
        {data.trends.quality.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">データ不足</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--text-secondary)]">
            {data.trends.quality.slice(-30).map((p, i) => (
              <li key={`${p.at}-${i}`}>
                {new Date(p.at).toLocaleString("ja-JP")} — 品質{" "}
                {fmt(p.value)} / 原価{" "}
                {fmt(data.trends.cost[i]?.value ?? null)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
