"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";

const LABELS = [
  { id: "very_good", label: "とても良い" },
  { id: "good", label: "良い" },
  { id: "ok", label: "普通" },
  { id: "needs_improvement", label: "改善が必要" },
] as const;

const REASONS = [
  { id: "内容が不足", label: "内容が不足" },
  { id: "内容が多すぎる", label: "内容が多すぎる" },
  { id: "見た目が悪い", label: "見た目が悪い" },
  { id: "誤りがある", label: "誤りがある" },
  { id: "指示と違う", label: "指示と違う" },
  { id: "修正が多い", label: "修正が多い" },
  { id: "その他", label: "その他" },
] as const;

type DeliverableFeedbackCardProps = {
  artifactId: string;
};

/**
 * Optional end-user feedback. Never blocks generation or shows internal scores.
 */
export function DeliverableFeedbackCard({
  artifactId,
}: DeliverableFeedbackCardProps) {
  const [label, setLabel] = useState<(typeof LABELS)[number]["id"] | "">("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  if (!artifactId) return null;

  async function submit() {
    if (!label) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/deliverables/${artifactId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          reasons,
          otherText: otherText.trim() || undefined,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
      <p className="text-sm font-medium text-foreground">
        この成果物は役に立ちましたか？
      </p>
      <p className="text-xs text-[var(--foreground-muted)]">任意のフィードバックです。</p>
      <div className="flex flex-wrap gap-2">
        {LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-full border px-3 py-1 text-sm ${
              label === item.id
                ? "border-foreground bg-[var(--surface-muted)]"
                : "border-[var(--border-subtle)]"
            }`}
            onClick={() => setLabel(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((item) => {
          const on = reasons.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${
                on
                  ? "border-foreground bg-[var(--surface-muted)]"
                  : "border-[var(--border-subtle)]"
              }`}
              onClick={() =>
                setReasons((prev) =>
                  on ? prev.filter((r) => r !== item.id) : [...prev, item.id],
                )
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {reasons.includes("その他") && (
        <textarea
          className="w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
          rows={2}
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="補足（任意）"
        />
      )}
      <button
        type="button"
        disabled={!label || status === "saving" || status === "done"}
        className="rounded-xl bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
        onClick={() => void submit()}
      >
        {status === "done" ? "送信済み" : "送信"}
      </button>
      {status === "error" && (
        <p className="text-xs text-[var(--status-error)]">
          送信できませんでした。後でもう一度お試しください。
        </p>
      )}
    </Card>
  );
}
