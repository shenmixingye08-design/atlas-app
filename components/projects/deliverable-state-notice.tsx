"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { DeliverableDisplayState } from "@/lib/projects/deliverable-state";
import { ui } from "@/lib/i18n";

type NonReadyState = Exclude<DeliverableDisplayState, { kind: "ready" }>;

type DeliverableStateNoticeProps = {
  state: DeliverableDisplayState;
};

const ICONS: Record<NonReadyState["kind"], string> = {
  generating: "⏳",
  failed: "⚠️",
  not_found: "🔍",
};

const TITLES: Record<NonReadyState["kind"], string> = {
  generating: "まだ生成中です",
  failed: "生成に失敗しました",
  not_found: "結果が見つかりませんでした",
};

/**
 * Explicit, never-blank fallback for the deep-link result view. Every
 * 「結果を見る」 click resolves to a deliverable OR one of these states with a
 * clear Japanese reason and a way forward.
 */
export function DeliverableStateNotice({ state }: DeliverableStateNoticeProps) {
  if (state.kind === "ready") return null;

  const reason = state.kind === "failed" ? state.reason : null;

  return (
    <Card variant="elevated" padding="lg">
      <EmptyState
        icon={ICONS[state.kind]}
        title={TITLES[state.kind]}
        description={state.message}
        action={
          <div className="flex flex-col items-center gap-3">
            {reason && (
              <div className="max-w-md space-y-1 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3 text-left">
                <p className="text-xs font-semibold tracking-wide text-accent">
                  失敗理由
                </p>
                <p className="text-sm text-[var(--text-secondary)]">{reason}</p>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/history">
                <Button variant="secondary" size="sm">
                  {ui.nav.history}
                </Button>
              </Link>
              <Link href="/workspace">
                <Button variant="primary" size="sm">
                  {ui.nav.work}
                </Button>
              </Link>
            </div>
          </div>
        }
      />
    </Card>
  );
}
