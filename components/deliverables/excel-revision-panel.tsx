"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import type { ExcelEditOperation } from "@/lib/excel-secretary/types";

type ExcelRevisionPanelProps = {
  deliverableId: string;
  initialTitle?: string;
};

const STAGE_LABELS: Record<string, string> = {
  edit: "編集",
  download: "ダウンロード",
  excel_build: "Excel生成",
  ai_analysis: "AI解析",
  analyze: "分析",
};

/**
 * Lightweight re-edit UI: pick common ops, apply via /api/excel/edit,
 * then analyze via /api/excel/analyze. Does not rewrite Deliverable engine.
 */
export function ExcelRevisionPanel({
  deliverableId,
  initialTitle,
}: ExcelRevisionPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);

  function parseOperations(text: string): ExcelEditOperation[] {
    const ops: ExcelEditOperation[] = [];
    if (/列追加|列を追加|カラム追加/.test(text)) {
      const header =
        /「([^」]+)」/.exec(text)?.[1] ??
        /列[「:]?\s*([^\s、。]+)/.exec(text)?.[1] ??
        "新しい列";
      ops.push({ op: "add_column", header });
    }
    if (/行削除|行を削除/.test(text)) {
      const n = Number(/(\d+)\s*行/.exec(text)?.[1] ?? "1");
      ops.push({ op: "delete_row", rowIndex: Math.max(0, n - 1) });
    }
    if (/色|塗り|ハイライト/.test(text)) {
      ops.push({ op: "set_fill", range: "A2:Z2", fillArgb: "FFFFF2CC" });
    }
    if (/集計|合計|SUM/.test(text)) {
      ops.push({ op: "add_sum", columnKey: "amount" });
    }
    if (/フィルター|フィルタ/.test(text)) {
      ops.push({ op: "add_filter" });
    }
    if (ops.length === 0) {
      // Default safe op: ensure filter (no destructive change)
      ops.push({ op: "add_filter" });
    }
    return ops;
  }

  async function loadBase64(): Promise<string> {
    const dl = await fetch(`/api/deliverables/${deliverableId}`);
    if (!dl.ok) {
      throw Object.assign(new Error("成果物の取得に失敗しました"), {
        stage: "download",
      });
    }
    const buffer = await dl.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  async function handleEdit() {
    setBusy(true);
    setError(null);
    setErrorStage(null);
    setSummary(null);
    try {
      const base64 = await loadBase64();
      const operations = parseOperations(instruction);
      const response = await fetch("/api/excel/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64,
          operations,
          title: initialTitle,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        preview?: { title?: string; sheets?: Array<{ name: string }> };
        errors?: Array<{ stage?: string; message?: string }>;
        error?: string;
        stage?: string;
      };
      if (!response.ok || !body.ok) {
        throw Object.assign(
          new Error(
            body.errors?.[0]?.message || body.error || "編集に失敗しました",
          ),
          { stage: body.errors?.[0]?.stage || body.stage || "edit" },
        );
      }
      setSummary(
        `編集を反映しました（${body.preview?.sheets?.length ?? 0}シート）。ダウンロードし直すか、下の分析を実行してください。`,
      );
    } catch (err) {
      setErrorStage(
        err && typeof err === "object" && "stage" in err
          ? String((err as { stage?: string }).stage)
          : "edit",
      );
      setError(err instanceof Error ? err.message : "編集に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyze() {
    setBusy(true);
    setError(null);
    setErrorStage(null);
    setAnalysisText(null);
    try {
      const base64 = await loadBase64();
      const response = await fetch("/api/excel/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, title: initialTitle }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        analysis?: {
          summary?: string;
          comments?: string[];
          anomalies?: Array<{ message: string }>;
          rankings?: Array<{ label: string; value: number }>;
        };
        error?: { message?: string; stage?: string } | string;
        stage?: string;
      };
      if (!response.ok || !body.ok || !body.analysis) {
        const msg =
          typeof body.error === "string"
            ? body.error
            : body.error?.message || "分析に失敗しました";
        throw Object.assign(new Error(msg), {
          stage:
            (typeof body.error === "object" && body.error?.stage) ||
            body.stage ||
            "analyze",
        });
      }
      const lines = [
        body.analysis.summary,
        ...(body.analysis.comments ?? []),
        ...(body.analysis.anomalies ?? []).slice(0, 3).map((a) => `⚠ ${a.message}`),
        ...(body.analysis.rankings ?? [])
          .slice(0, 3)
          .map((r) => `● ${r.label}: ${r.value.toLocaleString("ja-JP")}`),
      ].filter(Boolean);
      setAnalysisText(lines.join("\n"));
    } catch (err) {
      setErrorStage(
        err && typeof err === "object" && "stage" in err
          ? String((err as { stage?: string }).stage)
          : "analyze",
      );
      setError(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div>
        <p className="text-sm font-medium text-accent">Excelを再編集</p>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          例: 「合計列を追加」「2行目を削除」「フィルターを付ける」「色を変えて」
        </p>
      </div>
      <textarea
        className="min-h-24 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="編集内容を日本語で書いてください"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !instruction.trim()}
          onClick={() => void handleEdit()}
        >
          {busy ? "処理中…" : "編集を適用"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void handleAnalyze()}
        >
          AI分析
        </Button>
      </div>
      {errorStage && (
        <p className="text-sm text-[var(--status-warning)]">
          失敗工程: {STAGE_LABELS[errorStage] ?? errorStage}
        </p>
      )}
      {error && <ErrorState message={error} />}
      {summary && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{summary}</p>
      )}
      {analysisText && (
        <pre className="overflow-x-auto rounded-lg bg-[var(--background-subtle)] p-3 text-xs text-foreground whitespace-pre-wrap">
          {analysisText}
        </pre>
      )}
    </div>
  );
}
