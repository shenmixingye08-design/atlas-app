"use client";

import type { ValueHomeSnapshot } from "@/lib/value";
import { formatHoursMinutes } from "@/lib/value";

export function SecretaryReportCard({
  snapshot,
}: {
  snapshot: ValueHomeSnapshot;
}) {
  const { report } = snapshot;
  return (
    <section
      aria-labelledby="secretary-report-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 sm:p-5"
      data-testid="secretary-report-card"
    >
      <h2
        id="secretary-report-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        {report.title}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        チャット履歴ではなく、仕事の進み具合です。
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--text-muted)]">今日の仕事・完了</dt>
          <dd className="font-semibold tabular-nums">{report.todayCompleted}件</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">返信待ち / 要対応</dt>
          <dd className="font-semibold tabular-nums">{report.awaitingReply}件</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--text-muted)]">次回予定</dt>
          <dd className="font-medium">
            {report.nextScheduledLabel ?? "まだ予定がありません"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--text-muted)]">締切</dt>
          <dd className="font-medium">{report.deadlineLabel ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--text-muted)]">改善提案</dt>
          <dd className="font-medium leading-relaxed">{report.improvementHint}</dd>
        </div>
        <div className="col-span-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2">
          <dt className="text-[var(--text-muted)]">今週終わらせた仕事</dt>
          <dd className="mt-0.5 font-semibold">
            {report.weekJobsCompleted}件 · 削減{" "}
            {formatHoursMinutes(report.weekMinutesSaved)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
