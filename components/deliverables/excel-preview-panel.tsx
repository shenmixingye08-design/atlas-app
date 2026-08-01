"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";
import type { ExcelPreviewPayload } from "@/lib/excel-secretary/types";

type ExcelPreviewPanelProps = {
  deliverableId: string;
  fileName?: string;
  onReedit?: () => void;
};

type PreviewResponse = {
  ok?: boolean;
  title?: string;
  kind?: ExcelPreviewPayload["kind"];
  sheets?: ExcelPreviewPayload["sheets"];
  activeSheetIndex?: number;
  fileName?: string;
  error?: string;
  stage?: string;
};

const STAGE_LABELS: Record<string, string> = {
  intent: "依頼解釈",
  image_analysis: "画像解析",
  ai_analysis: "AI解析",
  table_extract: "表抽出",
  excel_build: "Excel生成",
  formula: "数式生成",
  chart: "グラフ生成",
  persist: "保存",
  download: "ダウンロード",
  edit: "編集",
  analyze: "分析",
};

export function ExcelPreviewPanel({
  deliverableId,
  fileName,
  onReedit,
}: ExcelPreviewPanelProps) {
  const [preview, setPreview] = useState<ExcelPreviewPayload | null>(null);
  const [resolvedFileName, setResolvedFileName] = useState(fileName ?? "");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorStage(null);
    try {
      const response = await fetch(
        `/api/excel/preview?deliverableId=${encodeURIComponent(deliverableId)}`,
      );
      const body = (await response.json()) as PreviewResponse;
      if (!response.ok || !body.sheets) {
        setError(body.error || "プレビューの取得に失敗しました");
        setErrorStage(body.stage ?? "ai_analysis");
        setPreview(null);
        return;
      }
      const payload: ExcelPreviewPayload = {
        title: body.title ?? "Excel",
        kind: body.kind ?? "generic_table",
        sheets: body.sheets,
        activeSheetIndex: body.activeSheetIndex ?? 0,
      };
      setPreview(payload);
      setSheetIndex(payload.activeSheetIndex);
      if (body.fileName) setResolvedFileName(body.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "プレビューに失敗しました");
      setErrorStage("ai_analysis");
    } finally {
      setLoading(false);
    }
  }, [deliverableId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const sheet = preview?.sheets[sheetIndex] ?? preview?.sheets[0];

  const table = useMemo(() => {
    if (!sheet) return null;
    return {
      headers: sheet.headers,
      rows: sheet.rows,
      meta: `${sheet.rowCount}行 × ${sheet.columnCount}列`,
    };
  }, [sheet]);

  async function exportAs(format: "xlsx" | "xls" | "csv" | "pdf") {
    setExporting(format);
    setError(null);
    setErrorStage(null);
    try {
      // Download original then convert via export API when needed.
      const dl = await fetch(`/api/deliverables/${deliverableId}`);
      if (!dl.ok) {
        throw Object.assign(new Error("成果物の取得に失敗しました"), {
          stage: "download",
        });
      }
      const blob = await dl.blob();
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);

      if (format === "xlsx") {
        await triggerBlobDownload(
          blob,
          resolvedFileName || fileName || "excel.xlsx",
        );
        return;
      }

      const response = await fetch("/api/excel/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64,
          format,
          title: preview?.title,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        base64?: string;
        fileName?: string;
        mimeType?: string;
        error?: string;
        stage?: string;
      };
      if (!response.ok || !body.base64) {
        throw Object.assign(new Error(body.error || "エクスポートに失敗しました"), {
          stage: body.stage ?? "download",
        });
      }
      const out = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
      await triggerBlobDownload(
        new Blob([out], {
          type:
            body.mimeType ??
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        body.fileName ??
          `${preview?.title ?? "excel"}.${format === "xls" ? "xlsx" : format}`,
      );
    } catch (err) {
      const stage =
        err && typeof err === "object" && "stage" in err
          ? String((err as { stage?: string }).stage)
          : "download";
      setErrorStage(stage);
      setError(err instanceof Error ? err.message : "エクスポートに失敗しました");
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <p className="animate-soft-pulse text-sm text-[var(--foreground-muted)]">
        Excelプレビューを準備しています…
      </p>
    );
  }

  if (!preview) {
    return (
      <div className="space-y-3">
        {errorStage && (
          <p className="text-sm text-[var(--status-warning)]">
            失敗工程: {STAGE_LABELS[errorStage] ?? errorStage}
          </p>
        )}
        <ErrorState message={error ?? "プレビューを表示できません"} />
        <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
          再読み込み
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent">Excelプレビュー</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            {preview.title}
          </h3>
          {table && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {table.meta}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => void exportAs("xlsx")}
          >
            {exporting === "xlsx" ? "準備中…" : "xlsx"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => void exportAs("csv")}
          >
            csv
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => void exportAs("pdf")}
          >
            PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled
            title="旧形式 .xls の書き出しは互換性リスクのため未対応です（.xlsx をご利用ください）"
          >
            xls（未対応）
          </Button>
          {onReedit && (
            <Button type="button" size="sm" onClick={onReedit}>
              再編集
            </Button>
          )}
        </div>
      </div>

      {(errorStage || error) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-foreground">
          失敗工程:{" "}
          <strong>{STAGE_LABELS[errorStage ?? ""] ?? errorStage ?? "不明"}</strong>
          {error ? ` — ${error}` : null}
        </div>
      )}

      {preview.sheets.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="シート切替">
          {preview.sheets.map((item, index) => (
            <button
              key={`${item.name}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === sheetIndex}
              className={
                index === sheetIndex
                  ? "rounded-md bg-[var(--accent)] px-3 py-1 text-sm text-white"
                  : "rounded-md bg-[var(--background-subtle)] px-3 py-1 text-sm text-foreground"
              }
              onClick={() => setSheetIndex(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {table ? (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[#1F4E79] text-white">
              <tr>
                {table.headers.map((header, hi) => (
                  <th
                    key={`${header}-${hi}`}
                    className="border border-[#3d6a94] px-3 py-2 text-left font-medium"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr
                  key={`r-${rowIndex}`}
                  className={rowIndex % 2 ? "bg-[#F3F6FA]" : "bg-white"}
                >
                  {table.headers.map((_, colIndex) => (
                    <td
                      key={`c-${rowIndex}-${colIndex}`}
                      className="border border-[#d0d7de] px-3 py-1.5 align-top text-foreground"
                    >
                      {row[colIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          表示できるシートがありません。
        </p>
      )}
    </div>
  );
}
