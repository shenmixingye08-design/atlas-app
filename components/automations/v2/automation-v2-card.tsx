"use client";

import { Button } from "@/components/ui/button";
import type { AutomationV2 } from "@/lib/automation-platform/types";
import { cn } from "@/lib/design-system/cn";

const STATUS_LABEL: Record<AutomationV2["status"], string> = {
  draft: "下書き",
  active: "稼働中",
  paused: "一時停止",
  disabled: "無効",
  archived: "保管済み",
};

const POLICY_LABEL: Record<AutomationV2["executionPolicy"]["mode"], string> = {
  review_before_run: "毎回確認",
  run_then_notify: "自動実行",
  review_selected_steps: "手順ごとに確認",
  approve_first_then_auto: "初回のみ確認",
  review_high_risk_only: "高リスクのみ確認",
  review_post_only: "投稿だけ確認",
  review_send_only: "送信だけ確認",
};

type Props = {
  automation: AutomationV2;
  busy?: boolean;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onArchive: () => void;
};

export function AutomationV2Card({
  automation,
  busy,
  onOpen,
  onPause,
  onResume,
  onDuplicate,
  onRun,
  onArchive,
}: Props) {
  const capabilities = automation.workflow.steps
    .filter((step) => step.enabled)
    .map((step) => step.name)
    .slice(0, 3)
    .join("・");

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left focus-ring rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{automation.name}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {capabilities || "手順未設定"}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs",
              automation.status === "active"
                ? "bg-accent/15 text-accent"
                : "bg-[var(--surface-muted)]",
            )}
          >
            {STATUS_LABEL[automation.status]}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--text-secondary)]">次回</dt>
            <dd>
              {automation.nextRunAt
                ? new Date(automation.nextRunAt).toLocaleString("ja-JP")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">最終実行</dt>
            <dd>
              {automation.lastRunAt
                ? new Date(automation.lastRunAt).toLocaleString("ja-JP")
                : "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[var(--text-secondary)]">確認方針</dt>
            <dd>{POLICY_LABEL[automation.executionPolicy.mode]}</dd>
          </div>
        </dl>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">
        {automation.status === "active" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onPause}
          >
            一時停止
          </Button>
        ) : automation.status === "paused" || automation.status === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onResume}
          >
            {automation.status === "draft" ? "有効化" : "再開"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || automation.status !== "active"}
          onClick={onRun}
        >
          今すぐ実行
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onDuplicate}
        >
          複製
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onArchive}
        >
          保管
        </Button>
      </div>
    </article>
  );
}
