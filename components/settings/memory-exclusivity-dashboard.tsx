"use client";

import { useCallback, useEffect, useState } from "react";

type MemoryRow = {
  id: string;
  title: string;
  summary: string;
  scopeLabel: string;
  status: string;
  confidence: number;
  tierLabel: string;
  used: number;
  successRate: number | null;
};

type DashboardPayload = {
  snapshot: {
    avgMemoryScore: number | null;
    avgMatchRate: number | null;
    avgDiffRate: number | null;
    avgCorrectionRate: number | null;
    estimatedInstructionReduction: number | null;
    byArtifact: Record<
      string,
      { count: number; matchRate: number; diffRate: number; score: number }
    >;
    learningSpeed: Array<{ artifactKind: string; runsToStable: number | null }>;
  };
  counts: {
    total: number;
    active: number;
    candidate: number;
    formal: number;
  };
  byCategory: Record<string, number>;
  memories: MemoryRow[];
};

function pct(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function MemoryExclusivityDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await fetch(`/api/personal-memory/dashboard?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as DashboardPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込み失敗");
    }
  }, [q, status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const runPreview = async () => {
    try {
      const res = await fetch("/api/personal-memory/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "営業資料をWordで作成。PDFも。短く箇条書きで。",
          artifactTypes: ["docx", "pdf", "word_generate"],
        }),
      });
      if (!res.ok) throw new Error(`preview HTTP ${res.status}`);
      const body = (await res.json()) as { headline: string };
      setPreview(body.headline);
    } catch (err) {
      setPreview(err instanceof Error ? err.message : "preview失敗");
    }
  };

  const undo = async (id: string) => {
    await fetch(`/api/personal-memory/${encodeURIComponent(id)}/undo`, {
      method: "POST",
    });
    await load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/personal-memory/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await load();
  };

  return (
    <div className="space-y-6" data-testid="memory-exclusivity-dashboard">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          専属Memoryダッシュボード
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          覚えているだけでなく、成果物へ効かせて「毎回説明しなくて済む」状態を目指します。
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="全文検索・タグ"
          className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] px-3"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-3"
        >
          <option value="">すべての状態</option>
          <option value="active">正式/使用中</option>
          <option value="candidate">候補</option>
          <option value="paused">停止</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm"
        >
          検索
        </button>
        <button
          type="button"
          onClick={() => void runPreview()}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          生成前Preview
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-muted)] p-3 text-sm">
          {preview}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Memory数" value={String(data.counts.total)} />
            <Stat label="正式" value={String(data.counts.formal)} />
            <Stat label="候補" value={String(data.counts.candidate)} />
            <Stat
              label="推定指示削減"
              value={pct(data.snapshot.estimatedInstructionReduction)}
            />
            <Stat
              label="Memory Score"
              value={
                data.snapshot.avgMemoryScore == null
                  ? "—"
                  : String(Math.round(data.snapshot.avgMemoryScore))
              }
            />
            <Stat label="一致率" value={pct(data.snapshot.avgMatchRate)} />
            <Stat label="Diff率" value={pct(data.snapshot.avgDiffRate)} />
            <Stat label="修正率" value={pct(data.snapshot.avgCorrectionRate)} />
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold">カテゴリ別</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(data.byCategory).map(([label, count]) => (
                <span
                  key={label}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
                >
                  {label}: {count}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">学習速度（安定までの回数）</h3>
            <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
              {data.snapshot.learningSpeed.length === 0 ? (
                <li>まだ測定がありません</li>
              ) : (
                data.snapshot.learningSpeed.map((row) => (
                  <li key={row.artifactKind}>
                    {row.artifactKind}:{" "}
                    {row.runsToStable == null
                      ? "未安定"
                      : `${row.runsToStable}回で安定`}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Memory一覧</h3>
            <ul className="space-y-2">
              {data.memories.map((memory) => (
                <li
                  key={memory.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{memory.title}</p>
                      <p className="text-[var(--text-secondary)]">
                        {memory.scopeLabel} · {memory.tierLabel} ·{" "}
                        {Math.round(memory.confidence * 100)}% · 利用{" "}
                        {memory.used}回
                      </p>
                      <p className="mt-1 text-[var(--text-secondary)]">
                        {memory.summary}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[var(--brand)] underline"
                        onClick={() => void undo(memory.id)}
                      >
                        取り消し
                      </button>
                      <button
                        type="button"
                        className="text-[var(--error)] underline"
                        onClick={() => void remove(memory.id)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">読み込み中…</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
