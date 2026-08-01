"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type UnderstandingView = {
  requestId: string;
  summary: string;
  intent: string;
  executionMode: string;
  documentKind: string | null;
  outputs: Array<{ format: string; purpose: string; required: boolean; confidence: number }>;
  inputs: Array<{ type: string; role: string; fileName: string | null }>;
  missingFields: string[];
  assumptions: string[];
  questions: string[];
  confidence: number;
  needsClarification: boolean;
  routerTarget: string;
  unsupportedReason: string | null;
  alternatives: string[];
  legalNote: string;
};

type Props = {
  assignment: string;
  preferredFormat?: string | null;
  attachmentIds?: string[];
  /** Compact: only show when clarification / low confidence / multi-output. */
  compact?: boolean;
  onStart?: (formats: string[]) => void;
  onChangeFormats?: (formats: string[]) => void;
};

export function RequestUnderstandingPanel({
  assignment,
  preferredFormat,
  attachmentIds = [],
  compact = true,
  onStart,
  onChangeFormats,
}: Props) {
  const [view, setView] = useState<UnderstandingView | null>(null);
  const [formats, setFormats] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipExternal, setSkipExternal] = useState(false);

  const load = useCallback(async () => {
    if (!assignment.trim()) {
      setView(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/request/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment,
          preferredFormat: preferredFormat ?? null,
          attachments: attachmentIds.map((id) => ({ id })),
          overrides: skipExternal ? { skip_external: true } : undefined,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        understanding?: UnderstandingView;
        decision?: { formats?: string[] };
      };
      if (!response.ok || !body.understanding) {
        setError(body.error ?? "依頼の解釈に失敗しました");
        setView(null);
        return;
      }
      setView(body.understanding);
      const nextFormats = body.decision?.formats ?? body.understanding.outputs.map((o) => o.format);
      setFormats(nextFormats);
      onChangeFormats?.(nextFormats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "依頼の解釈に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [assignment, preferredFormat, attachmentIds, skipExternal, onChangeFormats]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load();
    }, 280);
    return () => window.clearTimeout(handle);
  }, [load]);

  if (!assignment.trim()) return null;

  const shouldShow =
    !compact ||
    view?.needsClarification ||
    (view && view.confidence < 0.7) ||
    (view && view.outputs.length > 1) ||
    view?.unsupportedReason ||
    loading ||
    error;

  if (!shouldShow) return null;

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--background-muted)]/50 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground">依頼の理解</p>
        {loading ? (
          <span className="text-xs text-muted-foreground">解釈中…</span>
        ) : view ? (
          <span className="text-xs text-muted-foreground">
            確信度 {(view.confidence * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {view ? (
        <div className="space-y-2 text-muted-foreground">
          <p>
            <span className="text-foreground">依頼内容：</span>
            {view.summary}
          </p>
          <p>
            <span className="text-foreground">使用する入力：</span>
            {view.inputs.filter((i) => i.type !== "text").length
              ? view.inputs
                  .filter((i) => i.type !== "text")
                  .map((i) => i.fileName || i.type)
                  .join("、")
              : "テキストのみ"}
          </p>
          <p>
            <span className="text-foreground">作成予定：</span>
            {view.outputs
              .filter((o) => o.format !== "none")
              .map((o) => `${o.format}（${o.purpose}）`)
              .join("、") || "回答のみ"}
          </p>
          <p>
            <span className="text-foreground">不足情報：</span>
            {view.missingFields.length ? view.missingFields.join("、") : "なし"}
          </p>
          {view.assumptions.length ? (
            <p>
              <span className="text-foreground">仮定：</span>
              {view.assumptions.slice(0, 4).join(" / ")}
            </p>
          ) : null}
          {view.questions.length ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-foreground">
              {view.questions.map((q) => (
                <p key={q}>{q}</p>
              ))}
            </div>
          ) : null}
          {view.unsupportedReason ? (
            <div className="space-y-1 text-foreground">
              <p>{view.unsupportedReason}</p>
              {view.alternatives.length ? (
                <p>代替案：{view.alternatives.join(" / ")}</p>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs">{view.legalNote}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {["docx", "xlsx", "pdf", "pptx", "csv"].map((format) => {
          const active = formats.includes(format);
          return (
            <button
              key={format}
              type="button"
              className={`rounded-md border px-2 py-1 text-xs ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-[var(--border-subtle)] text-muted-foreground"
              }`}
              onClick={() => {
                const next = active
                  ? formats.filter((f) => f !== format)
                  : [...formats, format];
                setFormats(next);
                onChangeFormats?.(next);
              }}
            >
              {format}
            </button>
          );
        })}
        <label className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={skipExternal}
            onChange={(event) => setSkipExternal(event.target.checked)}
          />
          送信・投稿はしない
        </label>
        {onStart && view && !view.needsClarification && !view.unsupportedReason ? (
          <Button type="button" size="sm" className="ml-auto" onClick={() => onStart(formats)}>
            この内容で進める
          </Button>
        ) : null}
      </div>
    </div>
  );
}
