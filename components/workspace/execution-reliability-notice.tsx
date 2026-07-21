"use client";

import type { ExecutionStateRecord } from "@/lib/execution-reliability";
import { ui } from "@/lib/i18n";

type ExecutionReliabilityNoticeProps = {
  state: ExecutionStateRecord | null;
  failureReason: string | null;
};

export function ExecutionReliabilityNotice({
  state,
  failureReason,
}: ExecutionReliabilityNoticeProps) {
  if (!state && !failureReason) return null;

  const showFailure =
    Boolean(failureReason) ||
    state?.phase === "failed" ||
    state?.phase === "timed_out";

  if (!showFailure && state?.phase !== "retrying") return null;

  return (
    <section
      aria-live="polite"
      className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)]"
    >
      {state?.phase === "retrying" && (
        <p className="text-sm text-foreground">
          一時的な問題が発生したため、自動で再試行しています（{state.attempt}/
          {state.maxAttempts}）…
        </p>
      )}
      {showFailure && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--error)]">
            {ui.secretaryResult.failureReasonHeading}
          </p>
          <p className="text-sm leading-relaxed text-foreground">
            {failureReason ||
              state?.failureReason ||
              "実行に失敗しました。内容を確認して再度お試しください。"}
          </p>
          {state?.logs?.length ? (
            <details className="pt-2">
              <summary className="cursor-pointer text-xs text-[var(--foreground-muted)]">
                実行ログ
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-[var(--foreground-muted)]">
                {state.logs.slice(-8).map((entry) => (
                  <li key={`${entry.at}-${entry.message}`}>
                    {entry.message}
                    {entry.detail ? ` — ${entry.detail}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
