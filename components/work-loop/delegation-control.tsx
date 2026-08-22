import type { AutomationExecutionLevel } from "@/lib/automations/types";
import {
  DELEGATION_HEADING,
  DELEGATION_LABELS,
  toDelegationLevel,
} from "@/lib/work-loop";

export function DelegationControl({
  executionLevel,
  onChange,
}: {
  executionLevel: AutomationExecutionLevel;
  onChange?: (level: AutomationExecutionLevel) => void;
}) {
  const current = toDelegationLevel(executionLevel);
  return (
    <div
      data-testid="delegation-control"
      className="space-y-2 pb-[env(safe-area-inset-bottom)]"
    >
      <p className="text-sm font-semibold">{DELEGATION_HEADING}</p>
      <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
        {DELEGATION_LABELS[current]}
      </p>
      {onChange ? (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["suggest_only", "提案のみ"],
              ["approve_then_run", "確認してから"],
              ["draft_save", "下書きまで"],
              ["full_auto", "自動で実行"],
            ] as const
          ).map(([level, label]) => (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm"
              aria-pressed={executionLevel === level}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
