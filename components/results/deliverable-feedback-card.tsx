"use client";

import { useEffect, useState } from "react";

import {
  NEGATIVE_REASON_OPTIONS,
  POSITIVE_REASON_OPTIONS,
} from "@/lib/artifact-feedback/constants";
import type { ArtifactRatingType } from "@/lib/artifact-feedback/types";

type DeliverableFeedbackCardProps = {
  artifactId: string;
  artifactType?: string | null;
};

/**
 * Compact thumbs feedback. Never blocks generation or shows internal scores.
 */
export function DeliverableFeedbackCard({
  artifactId,
  artifactType,
}: DeliverableFeedbackCardProps) {
  const [ratingType, setRatingType] = useState<ArtifactRatingType | null>(null);
  const [positiveReasons, setPositiveReasons] = useState<string[]>([]);
  const [negativeReasons, setNegativeReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [panel, setPanel] = useState<"none" | "positive" | "negative">("none");
  const [status, setStatus] = useState<"idle" | "saving" | "thanks" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!artifactId) return;
    let cancelled = false;
    void fetch(`/api/deliverables/${artifactId}/feedback`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          feedback: {
            ratingType: ArtifactRatingType;
            positiveReasons: string[];
            negativeReasons: string[];
            comment: string | null;
          } | null;
        };
      })
      .then((data) => {
        if (cancelled || !data?.feedback) return;
        setRatingType(data.feedback.ratingType);
        setPositiveReasons([...data.feedback.positiveReasons]);
        setNegativeReasons([...data.feedback.negativeReasons]);
        setComment(data.feedback.comment ?? "");
      })
      .catch(() => {
        /* ignore load errors */
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  if (!artifactId) return null;

  async function save(next: {
    ratingType: ArtifactRatingType;
    positiveReasons?: string[];
    negativeReasons?: string[];
    comment?: string;
  }) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/deliverables/${artifactId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratingType: next.ratingType,
          positiveReasons: next.positiveReasons ?? [],
          negativeReasons: next.negativeReasons ?? [],
          comment: next.comment ?? comment,
          artifactType: artifactType ?? undefined,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setRatingType(next.ratingType);
      setStatus("thanks");
    } catch {
      setStatus("error");
    }
  }

  async function clearRating() {
    setStatus("saving");
    try {
      const res = await fetch(`/api/deliverables/${artifactId}/feedback`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setRatingType(null);
      setPositiveReasons([]);
      setNegativeReasons([]);
      setComment("");
      setPanel("none");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  async function onThumb(next: ArtifactRatingType) {
    if (ratingType === next) {
      await clearRating();
      return;
    }
    if (next === "positive") {
      setNegativeReasons([]);
      setPanel("positive");
      await save({ ratingType: "positive", positiveReasons, negativeReasons: [] });
    } else {
      setPositiveReasons([]);
      setPanel("negative");
      await save({ ratingType: "negative", negativeReasons, positiveReasons: [] });
    }
  }

  function toggleReason(
    kind: "positive" | "negative",
    reason: string,
  ) {
    if (kind === "positive") {
      setPositiveReasons((prev) =>
        prev.includes(reason)
          ? prev.filter((r) => r !== reason)
          : [...prev, reason],
      );
    } else {
      setNegativeReasons((prev) =>
        prev.includes(reason)
          ? prev.filter((r) => r !== reason)
          : [...prev, reason],
      );
    }
  }

  return (
    <div className="space-y-3" data-testid="artifact-feedback">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="この成果物は良かった"
          title="この成果物は良かった"
          disabled={status === "saving"}
          onClick={() => void onThumb("positive")}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-lg transition ${
            ratingType === "positive"
              ? "border-foreground bg-[var(--surface-muted)]"
              : "border-[var(--border-subtle)] hover:bg-[var(--surface-muted)]"
          }`}
        >
          👍
        </button>
        <button
          type="button"
          aria-label="この成果物は改善が必要"
          title="この成果物は改善が必要"
          disabled={status === "saving"}
          onClick={() => void onThumb("negative")}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-lg transition ${
            ratingType === "negative"
              ? "border-foreground bg-[var(--surface-muted)]"
              : "border-[var(--border-subtle)] hover:bg-[var(--surface-muted)]"
          }`}
        >
          👎
        </button>
        {status === "thanks" && (
          <p className="text-xs text-[var(--foreground-muted)]">
            評価ありがとうございます
          </p>
        )}
        {status === "error" && (
          <p className="text-xs text-[var(--status-error)]">
            保存できませんでした
          </p>
        )}
      </div>

      {panel === "negative" && ratingType === "negative" && (
        <div
          className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
          role="dialog"
          aria-label="改善理由"
        >
          <p className="text-sm font-medium text-foreground">
            改善が必要な点（任意・複数可）
          </p>
          <div className="flex flex-wrap gap-2">
            {NEGATIVE_REASON_OPTIONS.map((reason) => {
              const on = negativeReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  className={`min-h-11 rounded-xl border px-3 text-xs ${
                    on
                      ? "border-foreground bg-[var(--surface-muted)]"
                      : "border-[var(--border-subtle)]"
                  }`}
                  onClick={() => toggleReason("negative", reason)}
                >
                  {reason}
                </button>
              );
            })}
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--foreground-muted)]">
              どこを改善してほしいですか？（任意）
            </span>
            <textarea
              className="w-full rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="任意"
            />
          </label>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-foreground px-4 text-sm text-background"
            disabled={status === "saving"}
            onClick={() =>
              void save({
                ratingType: "negative",
                negativeReasons,
                positiveReasons: [],
                comment,
              }).then(() => setPanel("none"))
            }
          >
            送信
          </button>
        </div>
      )}

      {panel === "positive" && ratingType === "positive" && (
        <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <p className="text-sm font-medium text-foreground">
            良かった点（任意）
          </p>
          <div className="flex flex-wrap gap-2">
            {POSITIVE_REASON_OPTIONS.map((reason) => {
              const on = positiveReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  className={`min-h-11 rounded-xl border px-3 text-xs ${
                    on
                      ? "border-foreground bg-[var(--surface-muted)]"
                      : "border-[var(--border-subtle)]"
                  }`}
                  onClick={() => toggleReason("positive", reason)}
                >
                  {reason}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-4 text-sm"
            disabled={status === "saving"}
            onClick={() =>
              void save({
                ratingType: "positive",
                positiveReasons,
                negativeReasons: [],
              }).then(() => setPanel("none"))
            }
          >
            保存して閉じる
          </button>
        </div>
      )}
    </div>
  );
}
