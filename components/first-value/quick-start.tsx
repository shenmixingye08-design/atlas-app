"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  FIRST_VALUE_CANDIDATES,
  FIRST_VALUE_FREQUENCIES,
  getFirstValueCandidate,
  trackFirstValueEvent,
  type FirstValueCandidateId,
  type FirstValueFrequency,
} from "@/lib/first-value";
import type { FirstValueJourney } from "@/lib/first-value/journey";
import { cn } from "@/lib/design-system/cn";

/**
 * Quick Start — 3 clicks / 3 fields: title, content, frequency.
 * On save: immediate run (Scheduler wait forbidden).
 */
export function FirstValueQuickStart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seedCandidate = searchParams.get("candidate") as FirstValueCandidateId | null;
  const seedTitle = searchParams.get("seed") ?? "";

  const [candidateId, setCandidateId] = useState<FirstValueCandidateId>(
    seedCandidate && FIRST_VALUE_CANDIDATES.some((c) => c.id === seedCandidate)
      ? seedCandidate
      : "sales_deck",
  );
  const candidate = useMemo(
    () => getFirstValueCandidate(candidateId),
    [candidateId],
  );
  const [title, setTitle] = useState(seedTitle || candidate.defaultTitle);
  const [content, setContent] = useState("");
  const [frequency, setFrequency] = useState<FirstValueFrequency>("once");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    trackFirstValueEvent("first_automation_started", {
      candidateId,
      frequency,
    });
    try {
      const res = await fetch("/api/first-value/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          title: title.trim() || candidate.defaultTitle,
          content: content.trim() || candidate.defaultContentHint,
          frequency,
          idempotencyKey: `fv_${candidateId}_${Date.now()}`,
        }),
      });
      const payload = (await res.json()) as {
        journey?: FirstValueJourney;
        error?: string;
      };
      if (!res.ok || !payload.journey) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      trackFirstValueEvent("first_automation_created", {
        candidateId,
        jobId: payload.journey.jobId,
      });
      trackFirstValueEvent("first_deliverable_ready", {
        jobId: payload.journey.jobId,
        deliverableId: payload.journey.deliverableId,
      });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "atlas.firstValue.journey",
          JSON.stringify(payload.journey),
        );
      }
      router.push(
        `/first-value/complete?jobId=${encodeURIComponent(payload.journey.jobId)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "初回実行に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-[var(--brand)]">
          QUICK START
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          最初の仕事をAIへ任せる
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          タイトル・仕事内容・頻度の3つだけ。保存すると、すぐに1回実行して成果物までご用意します。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          1. 仕事の種類（任意）
        </h2>
        <div className="flex flex-wrap gap-2">
          {FIRST_VALUE_CANDIDATES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCandidateId(item.id);
                if (!title || title === candidate.defaultTitle) {
                  setTitle(item.defaultTitle);
                }
                trackFirstValueEvent("first_value_candidate_selected", {
                  candidateId: item.id,
                });
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                candidateId === item.id
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-foreground)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
        <div className="space-y-2">
          <label
            htmlFor="fv-title"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            2. タイトル
          </label>
          <input
            id="fv-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            placeholder={candidate.defaultTitle}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="fv-content"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            3. 仕事内容
          </label>
          <textarea
            id="fv-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            placeholder={candidate.defaultContentHint}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            4. 頻度
          </p>
          <div className="flex flex-wrap gap-2">
            {FIRST_VALUE_FREQUENCIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFrequency(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  frequency === item.id
                    ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            頻度は次回以降のために記録します。初回はスケジューラを待たず、いま1回実行します。
          </p>
        </div>
      </section>

      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="w-full"
        isLoading={submitting}
        onClick={() => void onSubmit()}
      >
        保存して今すぐ実行する
      </Button>
    </div>
  );
}
