"use client";

import { markValuePitchSeen, trackValueEvent } from "@/lib/value";
import { Button } from "@/components/ui/button";

export function FirstUsePitch({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      data-testid="value-first-use-pitch"
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="value-pitch-title"
        className="w-full max-w-md rounded-t-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-xl)]"
      >
        <p className="text-xs font-medium tracking-wide text-accent">MINERVOT</p>
        <h2
          id="value-pitch-title"
          className="mt-2 text-xl font-semibold text-foreground"
        >
          このAIは、文章を書くAIではありません。
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
          あなたの仕事を終わらせるAI秘書です。毎月の料金は、機能の数ではなく
          「減った仕事の時間」で判断してください。
        </p>
        <Button
          variant="primary"
          className="mt-6 w-full"
          onClick={() => {
            markValuePitchSeen();
            trackValueEvent("value_pitch_dismissed");
            onDismiss();
          }}
        >
          成果を見る
        </Button>
      </div>
    </div>
  );
}
