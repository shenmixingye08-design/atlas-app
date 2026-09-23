"use client";

import Link from "next/link";
import { useState } from "react";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { MotionList, MotionListItem } from "@/components/motion/list-item";
import { SectionHeader } from "@/components/automation-first/page-header";
import {
  describeActionError,
  describeRunNowResult,
  type WorkActionFeedback,
} from "@/lib/automation-first/run-now-feedback";
import { runAutomationNow, setAutomationEnabled } from "@/lib/automations/client";
import { formatNextRunDateTime } from "@/lib/automation-first/home-data";
import { cn } from "@/lib/design-system/cn";
import { YOUR_WORK_HEADING } from "@/lib/work-asset/messaging";
import type { WorkAsset } from "@/lib/work-asset/work-view";

/** ISO timestamps → user-facing label; non-ISO labels pass through. */
function formatWorkTime(value: string): string {
  return Number.isNaN(Date.parse(value)) ? value : formatNextRunDateTime(value);
}

const LIFECYCLE_LABEL: Record<WorkAsset["lifecycle"], string> = {
  active: "稼働中",
  paused: "一時停止",
  needs_attention: "要確認",
  completed: "完了",
  failed: "失敗",
};

export function YourWorkList({
  works,
  onChanged,
}: {
  works: WorkAsset[];
  onChanged?: () => void;
}) {
  const [pending, setPending] = useState<{ id: string; action: "run" | "toggle" } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<
    (WorkActionFeedback & { id: string }) | null
  >(null);
  if (works.length === 0) return null;

  async function pauseOrResume(work: WorkAsset) {
    const resume = work.lifecycle === "paused";
    setPending({ id: work.id, action: "toggle" });
    setFeedback(null);
    try {
      await setAutomationEnabled(work.id, resume);
      setFeedback({
        id: work.id,
        tone: "success",
        message: resume ? "再開しました" : "一時停止しました",
      });
      onChanged?.();
    } catch (error) {
      setFeedback({ id: work.id, ...describeActionError(error, "更新できませんでした") });
    } finally {
      setPending(null);
    }
  }

  async function runNow(work: WorkAsset) {
    setPending({ id: work.id, action: "run" });
    setFeedback(null);
    try {
      const result = await runAutomationNow(work.id);
      setFeedback({ id: work.id, ...describeRunNowResult(result) });
      onChanged?.();
    } catch (error) {
      setFeedback({ id: work.id, ...describeActionError(error, "実行できませんでした") });
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="af-your-work-heading"
      data-testid="your-work"
      className="space-y-2.5"
    >
      <SectionHeader
        heading="h3"
        title={YOUR_WORK_HEADING}
        description="これからもMINERVOTに任せる仕事。履歴とは別です"
      />
      <MotionList className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
        {works.map((work, index) => (
          <MotionListItem key={work.id} index={index} className="space-y-2 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {work.name}
              </p>
              <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
                {LIFECYCLE_LABEL[work.lifecycle]}
                {work.nextRunAt ? ` · 次回 ${formatWorkTime(work.nextRunAt)}` : ""}
                {work.lastSuccessAt && !work.nextRunAt
                  ? ` · 前回 ${formatWorkTime(work.lastSuccessAt)}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={work.href}
                className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-primary)]"
              >
                詳細
              </Link>
              {work.lifecycle === "active" ? (
                <button
                  type="button"
                  disabled={pending?.id === work.id}
                  aria-busy={pending?.id === work.id && pending.action === "run"}
                  onClick={() => void runNow(work)}
                  className="motion-press inline-flex min-h-[var(--touch-target)] items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                >
                  {pending?.id === work.id && pending.action === "run" ? (
                    <>
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                      実行中…
                    </>
                  ) : (
                    "今すぐ実行"
                  )}
                </button>
              ) : null}
              {work.lifecycle === "active" || work.lifecycle === "paused" ? (
                <button
                  type="button"
                  disabled={pending?.id === work.id}
                  onClick={() => void pauseOrResume(work)}
                  className="motion-press disabled:opacity-60 inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--brand)]"
                >
                  {work.lifecycle === "paused" ? "再開" : "一時停止"}
                </button>
              ) : null}
            </div>
            {feedback?.id === work.id ? (
              <p
                role="status"
                className={cn(
                  "animate-card-enter text-[length:var(--text-meta)] font-medium",
                  feedback.tone === "success" && "text-[var(--success)]",
                  feedback.tone === "warning" && "text-[var(--warning)]",
                  feedback.tone === "error" && "text-[var(--danger)]",
                )}
              >
                {feedback.message}
              </p>
            ) : null}
          </MotionListItem>
        ))}
      </MotionList>
    </section>
  );
}

export function WorkCountStrip({
  entrusted,
  completedThisWeek,
  needsAttention,
}: {
  entrusted: number;
  completedThisWeek: number | null;
  needsAttention: number;
}) {
  const items: { label: string; count: number }[] = [];
  if (entrusted > 0) items.push({ label: "任せている仕事", count: entrusted });
  if (completedThisWeek != null && completedThisWeek > 0) {
    items.push({ label: "今週自動完了", count: completedThisWeek });
  }
  if (needsAttention > 0) items.push({ label: "対応が必要", count: needsAttention });
  if (items.length === 0) return null;
  return (
    <dl
      data-testid="work-count-strip"
      className="flex divide-x divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] py-2.5"
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col-reverse px-3 text-center">
          <dt className="truncate text-[length:var(--text-meta)] text-[var(--text-muted)]">
            {item.label}
          </dt>
          <dd className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            <AnimatedNumber value={item.count} suffix="件" />
          </dd>
        </div>
      ))}
    </dl>
  );
}
