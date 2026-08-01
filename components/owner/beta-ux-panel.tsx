"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Snapshot = {
  protocolBrief: string;
  metrics: {
    testerCount: number;
    sessions: number;
    firstRequestSubmit: { rate: number | null; total: number; definitive: boolean };
    firstArtifactComplete: {
      rate: number | null;
      total: number;
      definitive: boolean;
    };
    firstDownload: { rate: number | null; total: number; definitive: boolean };
    firstFlowComplete: {
      rate: number | null;
      total: number;
      definitive: boolean;
    };
    reuse7d: { rate: number | null; total: number; definitive: boolean };
    durationMs: {
      avg: number | null;
      median: number | null;
      p90: number | null;
      p95: number | null;
      n: number;
    };
    byFlow: Record<string, { rate: number | null; total: number }>;
    byDevice: Record<string, { rate: number | null; total: number }>;
    dropoutScreens: Array<{ screen: string; count: number }>;
    dropoutReasons: Array<{ reason: string; count: number }>;
    payIntent: Record<string, number>;
  };
  gates: { pass: boolean; failures: string[] };
  findings: Array<{
    id: string;
    severity: string;
    title: string;
    evidence: string;
    status: string;
  }>;
  feedback: Array<{
    id: string;
    mostConfused: string | null;
    mostUseful: string | null;
    payIntent980: string | null;
    whyNotChatgpt: string | null;
  }>;
  recentSessions: Array<{
    sessionId: string;
    flowId: string;
    completed: boolean;
    stuckScreen: string | null;
    requestId: string | null;
  }>;
  betaUsers: { betaParticipantCount: number };
};

function pct(rate: number | null, definitive: boolean, total: number): string {
  if (rate == null) return `— (n=${total})`;
  const base = `${(rate * 100).toFixed(1)}% (n=${total})`;
  return definitive ? base : `${base} ※n<10 非確定`;
}

export function BetaUxPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState({ requestId: "", jobId: "", artifactId: "" });

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (q.requestId.trim()) params.set("requestId", q.requestId.trim());
    if (q.jobId.trim()) params.set("jobId", q.jobId.trim());
    if (q.artifactId.trim()) params.set("artifactId", q.artifactId.trim());
    const res = await fetch(`/api/owner/beta-ux?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError(`load failed ${res.status}`);
      return;
    }
    setData((await res.json()) as Snapshot);
  }, [q.artifactId, q.jobId, q.requestId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  if (error) {
    return <p className="text-sm text-[var(--error)]">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--foreground-muted)]">読み込み中…</p>;
  }

  const m = data.metrics;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">β UX 計測</h1>
        <p className="max-w-2xl text-sm text-[var(--foreground-muted)]">
          説明なしテスト用ブリーフ: 「{data.protocolBrief}」
          — 個人情報・依頼本文は表示しません。n&lt;10 は確定評価しません。
        </p>
        <p className="text-sm">
          βメール登録数: {data.betaUsers.betaParticipantCount} / セッション計測テスター:{" "}
          {m.testerCount} / セッション: {m.sessions}
        </p>
        <p
          className={
            data.gates.pass
              ? "text-sm text-emerald-700"
              : "text-sm text-[var(--error)]"
          }
        >
          Gate: {data.gates.pass ? "PASS" : "FAIL"} —{" "}
          {data.gates.failures.join(" / ") || "all clear"}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="初回依頼送信"
          value={pct(
            m.firstRequestSubmit.rate,
            m.firstRequestSubmit.definitive,
            m.firstRequestSubmit.total
          )}
        />
        <Metric
          label="初回成果物完成"
          value={pct(
            m.firstArtifactComplete.rate,
            m.firstArtifactComplete.definitive,
            m.firstArtifactComplete.total
          )}
        />
        <Metric
          label="初回ダウンロード"
          value={pct(
            m.firstDownload.rate,
            m.firstDownload.definitive,
            m.firstDownload.total
          )}
        />
        <Metric
          label="初回完遂"
          value={pct(
            m.firstFlowComplete.rate,
            m.firstFlowComplete.definitive,
            m.firstFlowComplete.total
          )}
        />
        <Metric
          label="7日再利用"
          value={pct(m.reuse7d.rate, m.reuse7d.definitive, m.reuse7d.total)}
        />
        <Metric
          label="完成時間 median / p90 / p95"
          value={`${m.durationMs.median ?? "—"} / ${m.durationMs.p90 ?? "—"} / ${m.durationMs.p95 ?? "—"} ms (n=${m.durationMs.n})`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">ID検索</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-h-[44px] rounded-lg border border-[var(--border-subtle)] px-3"
            placeholder="requestId"
            value={q.requestId}
            onChange={(e) => setQ((s) => ({ ...s, requestId: e.target.value }))}
          />
          <input
            className="min-h-[44px] rounded-lg border border-[var(--border-subtle)] px-3"
            placeholder="jobId"
            value={q.jobId}
            onChange={(e) => setQ((s) => ({ ...s, jobId: e.target.value }))}
          />
          <input
            className="min-h-[44px] rounded-lg border border-[var(--border-subtle)] px-3"
            placeholder="artifactId"
            value={q.artifactId}
            onChange={(e) =>
              setQ((s) => ({ ...s, artifactId: e.target.value }))
            }
          />
          <Button type="button" onClick={() => void load()}>
            検索
          </Button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-medium">離脱画面</h2>
          <ul className="space-y-1 text-sm">
            {m.dropoutScreens.length === 0 ? (
              <li className="text-[var(--foreground-muted)]">データなし</li>
            ) : (
              m.dropoutScreens.map((r) => (
                <li key={r.screen}>
                  {r.screen}: {r.count}
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-medium">離脱原因</h2>
          <ul className="space-y-1 text-sm">
            {m.dropoutReasons.length === 0 ? (
              <li className="text-[var(--foreground-muted)]">データなし</li>
            ) : (
              m.dropoutReasons.map((r) => (
                <li key={r.reason}>
                  {r.reason}: {r.count}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Findings</h2>
        <ul className="space-y-2 text-sm">
          {data.findings.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
            >
              <strong>
                [{f.severity}] [{f.status}]
              </strong>{" "}
              {f.title}
              <div className="text-[var(--foreground-muted)]">{f.evidence}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">フィードバック要約</h2>
        <ul className="space-y-2 text-sm">
          {data.feedback.length === 0 ? (
            <li className="text-[var(--foreground-muted)]">まだありません</li>
          ) : (
            data.feedback.slice(0, 20).map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                迷った: {f.mostConfused ?? "—"} / 便利: {f.mostUseful ?? "—"} /
                980円: {f.payIntent980 ?? "—"}
                <div className="text-[var(--foreground-muted)]">
                  ChatGPTではなく: {f.whyNotChatgpt ?? "—"}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
      <p className="text-xs text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
