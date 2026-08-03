"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { trackFirstValueEvent } from "@/lib/first-value";
import type { FirstValueJourney } from "@/lib/first-value/journey";
import { markJourneyStep } from "@/lib/first-value/journey";
import {
  markFirstValueDownloaded,
  recordFirstValueMeasured,
} from "@/lib/first-value/measured";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import { cn } from "@/lib/design-system/cn";

/**
 * 仕事完了一覧 — 成果物一覧ではなく、完了ステップの旅路。
 */
export function FirstValueJobComplete() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [journey, setJourney] = useState<FirstValueJourney | null>(null);

  useEffect(() => {
    return scheduleMountWork(() => {
      try {
        const raw =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem("atlas.firstValue.journey")
            : null;
        if (!raw) return;
        const parsed = JSON.parse(raw) as FirstValueJourney;
        if (jobId && parsed.jobId !== jobId) return;
        setJourney(parsed);
        if (parsed.measuredMinutesSaved != null && parsed.completedAt) {
          recordFirstValueMeasured({
            jobId: parsed.jobId,
            candidateLabel: parsed.candidateLabel,
            title: parsed.title,
            minutesSaved: parsed.measuredMinutesSaved,
            completedAt: parsed.completedAt,
            deliverableId: parsed.deliverableId,
            automationId: parsed.automationId,
          });
        }
        trackFirstValueEvent("first_value_completed", {
          jobId: parsed.jobId,
          deliverableId: parsed.deliverableId,
          automationId: parsed.automationId,
          measuredMinutes: parsed.measuredMinutesSaved,
        });
      } catch {
        setJourney(null);
      }
    });
  }, [jobId]);

  function onDownload() {
    if (!journey?.downloadUrl) return;
    markFirstValueDownloaded(journey.jobId);
    const nextSteps = markJourneyStep(
      journey.steps,
      "downloadable",
      "completed",
      journey.downloadUrl,
    );
    const next = { ...journey, steps: nextSteps };
    setJourney(next);
    try {
      window.sessionStorage.setItem(
        "atlas.firstValue.journey",
        JSON.stringify(next),
      );
    } catch {
      // ignore
    }
    trackFirstValueEvent("first_download", {
      jobId: journey.jobId,
      deliverableId: journey.deliverableId,
    });
  }

  if (!journey) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
        <h1 className="text-xl font-semibold">仕事完了の記録が見つかりません</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          最初の仕事からやり直すことができます。
        </p>
        <Link
          href="/automations/quick-start"
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          最初の仕事をAIへ任せる
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 pb-16">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-[var(--brand)]">
          仕事完了一覧
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {journey.candidateLabel}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">{journey.title}</p>
      </header>

      <ol className="space-y-3">
        {journey.steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3",
              step.status === "completed"
                ? "border-emerald-200 bg-emerald-50/60"
                : step.status === "failed"
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-[var(--border)] bg-[var(--surface)]",
            )}
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-xs font-semibold">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-[var(--text-primary)]">
                  {step.label}
                </p>
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {step.status === "completed"
                    ? "完了"
                    : step.status === "failed"
                      ? "失敗"
                      : step.status === "running"
                        ? "実行中"
                        : "待機"}
                </p>
              </div>
              {step.detail ? (
                <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        {journey.downloadUrl ? (
          <a
            href={journey.downloadUrl}
            onClick={onDownload}
            className="flex min-h-[48px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)]"
          >
            ダウンロードする
          </a>
        ) : null}
        <p className="text-center text-xs text-[var(--text-muted)]">
          削減時間: 約{journey.measuredMinutesSaved ?? journey.estimatedMinutesSaved}
          分（
          {journey.measuredMinutesSaved != null ? "実測" : "推定"}）
        </p>
        <Link
          href="/projects"
          className="flex min-h-[44px] items-center justify-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
        >
          AI秘書ダッシュボードへ戻る
        </Link>
      </div>
    </div>
  );
}
