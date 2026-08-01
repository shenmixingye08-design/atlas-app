"use client";

import { useEffect, useState, useTransition } from "react";

type MeasuredRate = {
  rate: number | null;
  success: number;
  failure: number;
  total: number;
  measured: boolean;
  source: string;
};

type LatencyStats = {
  avgMs: number | null;
  p95Ms: number | null;
  sampleCount: number;
  measured: boolean;
  source: string;
};

type MetricRow = {
  id: string;
  label: string;
  value: MeasuredRate;
  latency?: LatencyStats | null;
  note?: string | null;
};

type Section = {
  id: string;
  title: string;
  metrics: MetricRow[];
};

type GateCheck = {
  id: string;
  label: string;
  pass: boolean;
  reason: string;
};

type CriticalFinding = {
  id: string;
  category: string;
  title: string;
  detail: string;
  blocksRelease: boolean;
};

type EvidenceCase = {
  id: string;
  name: string;
  ok: boolean;
  durationMs: number;
  requestId: string;
  error?: string | null;
  screenshotPath?: string | null;
};

type Snapshot = {
  ok: boolean;
  generatedAt: string;
  windowDays: 7 | 30 | 90;
  sections: Section[];
  releaseReady: boolean;
  productionE2eVerified: boolean;
  gates: {
    releaseReady: boolean;
    thresholdsMet: boolean;
    hasCriticalFindings: boolean;
    productionE2eVerified: boolean;
    evidenceSuitePassed: boolean;
    checks: GateCheck[];
    reasons: string[];
  };
  criticalFindings: CriticalFinding[];
  evidence: {
    suiteId: string;
    totalCases: number;
    passed: number;
    failed: number;
    environment: string;
    cases: EvidenceCase[];
    reportPath?: string | null;
  } | null;
  beforeAfter: {
    note: string;
    previousSelfScores: Record<string, number>;
    measuredRates: Record<string, number | null>;
  };
  deliverables?: {
    avgGenerateMs: LatencyStats;
  };
};

function pct(rate: MeasuredRate | null | undefined): string {
  if (!rate || !rate.measured || rate.rate == null) return "未計測";
  return `${(rate.rate * 100).toFixed(2)}%`;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${Math.round(ms)} ms`;
}

export function QualityDashboardPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(7);
  const [pending, startTransition] = useTransition();
  const [suiteMsg, setSuiteMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/owner/quality?windowDays=${windowDays}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Snapshot;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [windowDays]);

  function runSuite() {
    setSuiteMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/owner/quality", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runSuite: true }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          evidence?: Snapshot["evidence"];
          snapshot?: Snapshot;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (json.snapshot) setData({ ok: true, ...json.snapshot });
        setSuiteMsg(
          json.evidence
            ? `証拠スイート完了: ${json.evidence.passed}/${json.evidence.totalCases} PASS (${json.evidence.suiteId})`
            : "完了"
        );
      } catch (err) {
        setSuiteMsg(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const ready = data?.releaseReady === true;

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-stone-500">QUALITY</p>
        <h1 className="text-2xl font-semibold text-stone-900">
          Evidence Quality Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-stone-600">
          自己採点は表示しません。成功率・失敗率・p95・E2E・request_id
          のみ。未計測はゲート不合格です。
        </p>
      </header>

      <div
        className={
          ready
            ? "rounded-lg border border-emerald-700 bg-emerald-50 px-4 py-3"
            : "rounded-lg border border-red-300 bg-red-50 px-4 py-3"
        }
      >
        <p className="text-lg font-semibold text-stone-900">
          Release Ready: {ready ? "YES" : "NO"}
        </p>
        {!ready ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {(data?.gates.reasons ?? ["読み込み中…"]).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-stone-700">
            全ゲート達成・Critical なし・本番E2E検証済み
          </p>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-700">読み込み失敗: {error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setWindowDays(d)}
            className={
              windowDays === d
                ? "rounded-full bg-stone-900 px-3 py-1.5 text-sm text-white"
                : "rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-700"
            }
          >
            {d}日
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={runSuite}
          className="ml-auto rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-800 disabled:opacity-50"
        >
          {pending ? "証拠スイート実行中…" : "証拠スイート実行（承認後）"}
        </button>
      </div>
      {suiteMsg ? <p className="text-sm text-stone-600">{suiteMsg}</p> : null}

      {data?.beforeAfter ? (
        <div className="space-y-2 text-sm text-stone-600">
          <p>{data.beforeAfter.note}</p>
          <p>
            改善前（自己採点・参考）: AI{" "}
            {data.beforeAfter.previousSelfScores.aiQuality} / UX{" "}
            {data.beforeAfter.previousSelfScores.ux} / 成果物{" "}
            {data.beforeAfter.previousSelfScores.deliverableQuality}
          </p>
          <p>
            改善後（実測）: Word {pct({
              rate: data.beforeAfter.measuredRates.word ?? null,
              success: 0,
              failure: 0,
              total: 0,
              measured: data.beforeAfter.measuredRates.word != null,
              source: "beforeAfter",
            })}{" "}
            / Vision{" "}
            {pct({
              rate: data.beforeAfter.measuredRates.vision ?? null,
              success: 0,
              failure: 0,
              total: 0,
              measured: data.beforeAfter.measuredRates.vision != null,
              source: "beforeAfter",
            })}{" "}
            / 通知{" "}
            {pct({
              rate: data.beforeAfter.measuredRates.notification ?? null,
              success: 0,
              failure: 0,
              total: 0,
              measured: data.beforeAfter.measuredRates.notification != null,
              source: "beforeAfter",
            })}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-900">品質ゲート</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2 pr-4 font-medium">チェック</th>
                <th className="py-2 pr-4 font-medium">結果</th>
                <th className="py-2 font-medium">根拠</th>
              </tr>
            </thead>
            <tbody>
              {(data?.gates.checks ?? []).map((c) => (
                <tr key={c.id} className="border-b border-stone-100">
                  <td className="py-2 pr-4">{c.label}</td>
                  <td className="py-2 pr-4">{c.pass ? "PASS" : "FAIL"}</td>
                  <td className="py-2 text-stone-600">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(data?.criticalFindings?.length ?? 0) > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-red-800">
            Critical Gate（1件でもリリース不可）
          </h2>
          <ul className="space-y-2">
            {data!.criticalFindings.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm"
              >
                <p className="font-medium text-stone-900">
                  [{c.category}] {c.title}
                </p>
                <p className="text-stone-600">{c.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(data?.sections ?? []).map((section) => (
        <div key={section.id} className="space-y-2">
          <h2 className="text-lg font-semibold text-stone-900">
            {section.title}
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2 pr-4 font-medium">指標</th>
                  <th className="py-2 pr-4 font-medium">実測</th>
                  <th className="py-2 pr-4 font-medium">n</th>
                  <th className="py-2 pr-4 font-medium">latency</th>
                  <th className="py-2 font-medium">source</th>
                </tr>
              </thead>
              <tbody>
                {section.metrics.map((m) => (
                  <tr key={m.id} className="border-b border-stone-100">
                    <td className="py-2 pr-4">{m.label}</td>
                    <td className="py-2 pr-4">
                      {m.note && !m.value.measured
                        ? m.note
                        : m.note && m.id === "memory"
                          ? m.note
                          : m.note && m.id === "avg_generate_ms"
                            ? m.note
                            : pct(m.value)}
                    </td>
                    <td className="py-2 pr-4">
                      {m.value.measured ? m.value.total : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {m.latency?.measured
                        ? `avg ${fmtMs(m.latency.avgMs)} / p95 ${fmtMs(m.latency.p95Ms)}`
                        : "—"}
                    </td>
                    <td className="py-2 text-stone-500">{m.value.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-900">E2E証拠</h2>
        {data?.evidence ? (
          <>
            <p className="text-sm text-stone-600">
              suite={data.evidence.suiteId} env={data.evidence.environment}{" "}
              passed={data.evidence.passed}/{data.evidence.totalCases}
              {data.evidence.reportPath
                ? ` report=${data.evidence.reportPath}`
                : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4 font-medium">Case</th>
                    <th className="py-2 pr-4 font-medium">結果</th>
                    <th className="py-2 pr-4 font-medium">ms</th>
                    <th className="py-2 pr-4 font-medium">request_id</th>
                    <th className="py-2 font-medium">error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.evidence.cases.map((c) => (
                    <tr key={c.id} className="border-b border-stone-100">
                      <td className="py-2 pr-4">{c.name}</td>
                      <td className="py-2 pr-4">{c.ok ? "成功" : "失敗"}</td>
                      <td className="py-2 pr-4">{c.durationMs}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {c.requestId}
                      </td>
                      <td className="py-2 text-stone-600">{c.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-600">
            証拠スイート未実行。「証拠スイート実行」でローカル実測を保存できます。本番は
            PRODUCTION_E2E_BASE_URL が必要です。
          </p>
        )}
      </div>

      <p className="text-xs text-stone-400">
        generatedAt={data?.generatedAt ?? "—"} · productionE2eVerified=
        {String(data?.productionE2eVerified ?? false)}
      </p>
    </section>
  );
}
