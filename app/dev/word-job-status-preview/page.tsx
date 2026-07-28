"use client";

import { notFound } from "next/navigation";
import { useState } from "react";

import { WordJobStatusPanel } from "@/components/deliverables/word-job-status-panel";
import {
  WORD_JOB_UI_PHASES,
  type WordJobUiPhase,
} from "@/lib/deliverables/word-job-ui-state";

/**
 * DEV-ONLY — Word依頼後ステータスのスマホ確認用。
 * 本番では 404。デザイン刷新ではなく状態と次アクションの可読性確認用。
 */
export default function WordJobStatusPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <PreviewInner />;
}

function PreviewInner() {
  const [phase, setPhase] = useState<WordJobUiPhase>("processing");
  const [lastAction, setLastAction] = useState<string>("—");

  return (
    <main className="min-h-dvh bg-[var(--background)] px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-accent">MINERVOT / DEV</p>
          <h1 className="text-xl font-semibold text-foreground">
            Word依頼後ステータス確認
          </h1>
          <p className="text-sm text-[var(--foreground-muted)]">
            状態と次の行動が迷わず分かるか、各幅で確認してください。
          </p>
        </header>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="表示する状態"
        >
          {WORD_JOB_UI_PHASES.map((item) => (
            <button
              key={item}
              type="button"
              data-phase={item}
              className={`min-h-11 rounded-full px-4 text-sm touch-manipulation ${
                phase === item
                  ? "bg-accent text-white"
                  : "bg-[var(--surface-muted)] text-foreground"
              }`}
              onClick={() => setPhase(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <p
          className="text-xs text-[var(--foreground-muted)]"
          data-testid="last-action"
        >
          最後の操作: {lastAction}
        </p>

        <div data-testid="word-job-status-panel">
          <WordJobStatusPanel
            phase={phase}
            detail={
              phase === "failed" || phase === "timed_out"
                ? "文書の保存に失敗しました。もう一度お試しください。"
                : null
            }
            onPrimary={() => setLastAction(`primary:${phase}`)}
            onSecondary={
              phase === "completed" || phase === "failed"
                ? () => setLastAction(`secondary:${phase}`)
                : undefined
            }
          />
        </div>
      </div>
    </main>
  );
}
