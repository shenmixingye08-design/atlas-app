"use client";

import { useEffect, useState, useTransition } from "react";

import { downloadDeliverableFile } from "@/lib/deliverables/download-client";

type ArtifactItem = {
  id: string;
  title: string;
  fileName: string;
  format: string;
  revisionNumber: number;
  isLatest: boolean;
  status: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  sourceArtifactId: string | null;
  downloadUrl: string;
  mimeType: string;
};

type DetailResponse = {
  artifact: ArtifactItem & {
    description: string;
    rootArtifactId: string;
    conversionType: string | null;
  };
  revisions: ArtifactItem[];
  conversions: Array<Record<string, unknown>>;
};

type PreviewResponse = {
  ok: boolean;
  kind: string;
  downloadUrl: string;
  sizeWarning?: string;
  pages?: Array<{ index: number; text: string }>;
  table?: { headers: string[]; rows: string[][]; truncated: boolean };
  imageDataUrl?: string;
  message?: string;
};

const FORMAT_FILTERS = [
  "all",
  "docx",
  "xlsx",
  "pdf",
  "pptx",
  "csv",
  "png",
  "jpg",
] as const;

const CONVERT_TARGETS: Record<string, string[]> = {
  docx: ["pdf", "pptx"],
  xlsx: ["pdf", "pptx", "csv"],
  pptx: ["pdf"],
  pdf: ["docx", "xlsx", "pptx"],
  csv: ["xlsx"],
  png: ["pdf", "docx", "xlsx"],
  jpg: ["pdf", "docx", "xlsx"],
};

function formatLabel(format: string): string {
  switch (format) {
    case "docx":
      return "Word";
    case "xlsx":
      return "Excel";
    case "pdf":
      return "PDF";
    case "pptx":
      return "PowerPoint";
    case "csv":
      return "CSV";
    case "png":
    case "jpg":
      return "画像";
    default:
      return format;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactPlatformPanel() {
  const [items, setItems] = useState<ArtifactItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<(typeof FORMAT_FILTERS)[number]>("all");
  const [latestOnly, setLatestOnly] = useState(true);
  const [sort, setSort] = useState("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadList = () => {
    startTransition(async () => {
      setError(null);
      const params = new URLSearchParams({
        sort,
        latestOnly: latestOnly ? "1" : "0",
      });
      if (filter !== "all") params.set("formats", filter);
      const res = await fetch(`/api/artifacts?${params.toString()}`);
      if (!res.ok) {
        setError("一覧の取得に失敗しました。");
        return;
      }
      const data = (await res.json()) as { items: ArtifactItem[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    });
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setPreview(null);
    setBusy(true);
    try {
      const [dRes, pRes] = await Promise.all([
        fetch(`/api/artifacts/${id}`),
        fetch(`/api/artifacts/${id}/preview`),
      ]);
      if (dRes.ok) setDetail((await dRes.json()) as DetailResponse);
      if (pRes.ok) setPreview((await pRes.json()) as PreviewResponse);
      else setPreview({
        ok: false,
        kind: "unavailable",
        downloadUrl: `/api/deliverables/${id}`,
        message: "プレビューに失敗しました。ダウンロードは可能です。",
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, latestOnly, sort]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      queueMicrotask(() => {
        void openDetail(id);
      });
    }
  }, []);

  const onDownload = async (item: ArtifactItem) => {
    await downloadDeliverableFile({
      url: item.downloadUrl,
      fileName: item.fileName,
      mimeType: item.mimeType,
      format: item.format as never,
    });
  };

  const onConvert = async (targetFormat: string) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/artifacts/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceArtifactId: selectedId,
          targetFormat,
          options: {
            idempotencyKey: `ui-${selectedId}-${targetFormat}`,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.errors?.[0]?.message ?? data.error ?? "変換に失敗しました。");
        return;
      }
      loadList();
      if (data.artifact?.id) await openDetail(data.artifact.id);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/artifacts/${selectedId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.status === 409) {
        const ok = window.confirm(
          `${data.message}\n派生成果物: ${data.derivatives?.length ?? 0}件\n削除を続行しますか？`
        );
        if (ok) {
          await fetch(`/api/artifacts/${selectedId}?force=1`, { method: "DELETE" });
        }
      }
      setSelectedId(null);
      setDetail(null);
      loadList();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <p className="text-sm tracking-wide text-[#74172A]">MINERVOT</p>
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
          成果物
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Word・Excel・PDF・PowerPoint・CSV・画像を、履歴・変換・プレビュー・ダウンロードまでまとめて管理します。
        </p>
      </header>

      <section className="flex flex-col gap-3 border-b border-zinc-200 pb-4">
        <div className="flex flex-wrap gap-2">
          {FORMAT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? "border border-[#74172A] bg-[#74172A] px-3 py-1.5 text-sm text-white"
                  : "border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
              }
            >
              {f === "all" ? "すべて" : formatLabel(f)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-zinc-700">
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
            />
            最新版のみ
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-zinc-300 bg-white px-2 py-1.5"
          >
            <option value="newest">新しい順</option>
            <option value="oldest">古い順</option>
            <option value="fileName">ファイル名</option>
            <option value="format">形式</option>
            <option value="size">サイズ</option>
            <option value="updated">更新日時</option>
          </select>
          <span className="text-zinc-500">{total} 件</span>
        </div>
      </section>

      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="min-h-[320px]">
          {pending && items.length === 0 ? (
            <p className="text-sm text-zinc-500">読み込み中…</p>
          ) : null}
          <ul className="divide-y divide-zinc-200 border border-zinc-200">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(item.id)}
                  className={
                    selectedId === item.id
                      ? "flex w-full flex-col gap-1 bg-[#f8f1f3] px-3 py-3 text-left"
                      : "flex w-full flex-col gap-1 bg-white px-3 py-3 text-left hover:bg-zinc-50"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatLabel(item.format)}
                      {item.isLatest ? " · 最新" : ""}
                      {` · v${item.revisionNumber}`}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {item.fileName} · {formatBytes(item.fileSize)} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ja-JP")}
                  </div>
                </button>
              </li>
            ))}
            {items.length === 0 && !pending ? (
              <li className="px-3 py-8 text-center text-sm text-zinc-500">
                成果物はまだありません。依頼を完了するとここに集まります。
              </li>
            ) : null}
          </ul>
        </section>

        <section className="border border-zinc-200 bg-white p-4">
          {!detail ? (
            <p className="text-sm text-zinc-500">
              左の一覧から成果物を選ぶと、プレビュー・履歴・変換がここに表示されます。
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {detail.artifact.title}
                </h2>
                <p className="text-xs text-zinc-500">
                  {formatLabel(detail.artifact.format)} · v
                  {detail.artifact.revisionNumber}
                  {detail.artifact.isLatest ? " · 最新版" : ""}
                  {detail.artifact.sourceArtifactId
                    ? ` · 変換元 ${detail.artifact.sourceArtifactId.slice(0, 8)}…`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDownload(detail.artifact)}
                  className="border border-[#74172A] bg-[#74172A] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  ダウンロード
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className="border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
                >
                  削除
                </button>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-800">
                  形式変換
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(CONVERT_TARGETS[detail.artifact.format] ?? []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy}
                      onClick={() => void onConvert(t)}
                      className="border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
                    >
                      → {formatLabel(t)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-800">
                  プレビュー
                </h3>
                {preview?.sizeWarning ? (
                  <p className="mb-2 text-xs text-amber-700">
                    {preview.sizeWarning}
                  </p>
                ) : null}
                {!preview?.ok ? (
                  <p className="text-sm text-zinc-600">
                    {preview?.message ?? "プレビュー不可"}
                  </p>
                ) : preview.kind === "image" && preview.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.imageDataUrl}
                    alt={detail.artifact.title}
                    className="max-h-72 w-full object-contain"
                  />
                ) : preview.kind === "table" && preview.table ? (
                  <div className="max-h-72 overflow-auto text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {preview.table.headers.map((h) => (
                            <th
                              key={h}
                              className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.table.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                className="border border-zinc-100 px-2 py-1"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.table.truncated ? (
                      <p className="mt-1 text-zinc-500">先頭のみ表示</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-auto text-sm text-zinc-700">
                    {(preview.pages ?? []).map((p) => (
                      <div key={p.index} className="border-b border-zinc-100 pb-2">
                        <p className="text-xs text-zinc-400">#{p.index}</p>
                        <p className="whitespace-pre-wrap">{p.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-800">
                  revision履歴
                </h3>
                <ul className="space-y-1 text-xs text-zinc-600">
                  {detail.revisions.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void openDetail(r.id)}
                      >
                        v{r.revisionNumber} {r.fileName}
                        {r.isLatest ? "（最新）" : ""}
                      </button>
                    </li>
                  ))}
                  {detail.revisions.length === 0 ? (
                    <li>版履歴はまだありません。</li>
                  ) : null}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-800">
                  変換履歴
                </h3>
                <ul className="space-y-1 text-xs text-zinc-600">
                  {detail.conversions.map((c, i) => (
                    <li key={i}>
                      → {String(c.targetFormat)} ({String(c.quality)}){" "}
                      {c.targetArtifactId ? (
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            void openDetail(String(c.targetArtifactId))
                          }
                        >
                          開く
                        </button>
                      ) : null}
                    </li>
                  ))}
                  {detail.conversions.length === 0 ? (
                    <li>変換履歴はまだありません。</li>
                  ) : null}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
