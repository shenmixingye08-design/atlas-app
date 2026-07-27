"use client";

import { useCallback, useMemo, useState } from "react";

type DiagnosticsPayload = {
  ok: boolean;
  isOwner: boolean;
  userId: string | null;
  userEmailHost: string | null;
  origin: string;
  protocol: string;
  userAgent: string | null;
  authState: string;
  storage: {
    backend: string;
    required: boolean;
    serviceRoleConfigured: boolean;
    bucket: string;
    bucketExists: boolean;
    ready: boolean;
    warning: string | null;
    severity: string;
  };
  metrics: {
    requests: number;
    successes: number;
    failures: number;
    successRate: number | null;
    avgGenerateMs: number | null;
    avgPersistMs: number | null;
    avgDownloadMs: number | null;
    retries: number;
    recoverySuccesses: number;
    storageFailures: number;
    aiContentFailures: number;
    wordConvertFailures: number;
    verifyFailures: number;
    downloadFailures: number;
    dedupeHits: number;
    lastErrorStage: string | null;
    lastErrorAt: string | null;
  };
  env: Array<{
    key: string;
    configured: boolean;
    requirement: string;
    purpose: string;
    productionRisk: string | null;
  }>;
  warnings: Array<{ severity: string; message: string }>;
  androidUnverified: string[];
  downloadProbe: {
    deliverableId: string;
    downloadUrl: string;
    httpStatus: number | null;
    contentType: string | null;
    contentDisposition: string | null;
    contentLength: string | null;
    hasPkHeader: boolean | null;
    sizeBytes: number | null;
    sha256: string | null;
    sha256MatchesStored: boolean | null;
    durationMs: number | null;
    stages: string[];
    ok: boolean;
    error: string | null;
  } | null;
  note: string;
};

function fmtRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms)} ms`;
}

export function WordDownloadDiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliverableId, setDeliverableId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (probeId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (probeId) {
        qs.set("deliverableId", probeId);
        qs.set("probe", "1");
      }
      const res = await fetch(
        `/api/owner/diagnostics/word-download${qs.toString() ? `?${qs}` : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DiagnosticsPayload;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const logText = useMemo(() => {
    if (!data) return "";
    return JSON.stringify(
      {
        userId: data.userId,
        origin: data.origin,
        protocol: data.protocol,
        userAgent: data.userAgent,
        authState: data.authState,
        storage: data.storage,
        metrics: data.metrics,
        warnings: data.warnings,
        downloadProbe: data.downloadProbe,
        androidUnverified: data.androidUnverified,
      },
      null,
      2,
    );
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Word ダウンロード診断
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          管理者限定。Cookie / トークン / APIキー / 本文は表示しません。
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}

      {!data ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            診断データを読み込んでください。Cookie / トークンは表示しません。
          </p>
          <button
            type="button"
            className="rounded bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium ring-1 ring-[var(--border-strong)] disabled:opacity-50"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "読み込み中…" : "診断を開始"}
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-medium">警告</h2>
            {data.warnings.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">重大警告なし</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w) => (
                  <li
                    key={w.message}
                    className={
                      w.severity === "critical" ? "text-red-700" : "text-amber-700"
                    }
                  >
                    [{w.severity}] {w.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>userId: {data.userId ?? "—"}</div>
            <div>email host: {data.userEmailHost ?? "—"}</div>
            <div>origin: {data.origin}</div>
            <div>protocol: {data.protocol}</div>
            <div className="sm:col-span-2 break-all">
              User-Agent: {data.userAgent ?? "—"}
            </div>
            <div>auth: {data.authState}</div>
            <div>
              Storage: {data.storage.backend} / ready=
              {String(data.storage.ready)} / bucket={data.storage.bucket}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">過去24時間メトリクス</h2>
            <div className="grid gap-2 sm:grid-cols-3 text-sm">
              <div>依頼数: {data.metrics.requests}</div>
              <div>成功: {data.metrics.successes}</div>
              <div>失敗: {data.metrics.failures}</div>
              <div>成功率: {fmtRate(data.metrics.successRate)}</div>
              <div>平均生成: {fmtMs(data.metrics.avgGenerateMs)}</div>
              <div>平均保存: {fmtMs(data.metrics.avgPersistMs)}</div>
              <div>平均DL: {fmtMs(data.metrics.avgDownloadMs)}</div>
              <div>再試行: {data.metrics.retries}</div>
              <div>復旧成功: {data.metrics.recoverySuccesses}</div>
              <div>Storage失敗: {data.metrics.storageFailures}</div>
              <div>AI本文失敗: {data.metrics.aiContentFailures}</div>
              <div>Word変換失敗: {data.metrics.wordConvertFailures}</div>
              <div>検証失敗: {data.metrics.verifyFailures}</div>
              <div>DL失敗: {data.metrics.downloadFailures}</div>
              <div>重複防止: {data.metrics.dedupeHits}</div>
              <div>最新エラー工程: {data.metrics.lastErrorStage ?? "—"}</div>
              <div>最新エラー時刻: {data.metrics.lastErrorAt ?? "—"}</div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">環境変数（有無のみ）</h2>
            <ul className="space-y-1 text-sm">
              {data.env.map((item) => (
                <li key={item.key}>
                  {item.configured ? "✓" : "✗"} {item.key} ({item.requirement}) —{" "}
                  {item.purpose}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">成果物プローブ</h2>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[16rem] flex-1 rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                placeholder="deliverable id"
                value={deliverableId}
                onChange={(e) => setDeliverableId(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium ring-1 ring-[var(--border-strong)] disabled:opacity-50"
                disabled={busy || !deliverableId.trim()}
                onClick={() => void load(deliverableId.trim())}
              >
                診断実行
              </button>
              <button
                type="button"
                className="rounded px-4 py-2 text-sm ring-1 ring-[var(--border)]"
                disabled={busy}
                onClick={() => void load()}
              >
                再読み込み
              </button>
            </div>
            {data.downloadProbe ? (
              <pre className="overflow-x-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
                {JSON.stringify(data.downloadProbe, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                deliverable id を入力してプローブしてください。
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">Android実機 未確認項目</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {data.androidUnverified.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-sm text-[var(--text-secondary)]">{data.note}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Android Chrome で MINERVOT にログインする</li>
              <li>「営業報告書をWordで作成」を依頼する</li>
              <li>完了後、成果物のダウンロードをタップする</li>
              <li>ダウンロード一覧で .docx であること・サイズが 0 でないことを確認</li>
              <li>Microsoft Word または Google ドキュメントで開く</li>
              <li>この画面に deliverable id を入れてプローブ結果をコピーする</li>
            </ol>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">診断ログ</h2>
              <button
                type="button"
                className="rounded px-3 py-1.5 text-sm ring-1 ring-[var(--border)]"
                onClick={() => void navigator.clipboard.writeText(logText)}
              >
                コピー
              </button>
            </div>
            <pre className="max-h-80 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
              {logText}
            </pre>
          </section>
        </>
      ) : null}
    </div>
  );
}
