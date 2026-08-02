"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  applySurveyToRetention,
  dismissRetentionSurvey,
  notifyMemoryLearning,
} from "@/lib/retention";

type FirstDeliverableSurveyProps = {
  onClose: () => void;
};

export function FirstDeliverableSurvey({ onClose }: FirstDeliverableSurveyProps) {
  const [helpful, setHelpful] = useState<"yes" | "somewhat" | "no" | null>(null);
  const [revision, setRevision] = useState<"none" | "light" | "heavy" | null>(null);
  const [reuse, setReuse] = useState<"yes" | "maybe" | "no" | null>(null);

  const submit = useCallback(() => {
    if (!helpful || !revision || !reuse) return;
    applySurveyToRetention({ helpful, revision, reuse });
    notifyMemoryLearning();
    onClose();
  }, [helpful, onClose, reuse, revision]);

  const dismiss = useCallback(() => {
    dismissRetentionSurvey();
    onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      data-testid="retention-survey"
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="retention-survey-title"
        className="w-full max-w-md rounded-t-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-xl)] sm:p-6"
      >
        <p className="text-xs font-medium tracking-wide text-accent">5秒アンケート</p>
        <h2
          id="retention-survey-title"
          className="mt-2 text-lg font-semibold text-foreground"
        >
          初回の成果物は役に立ちましたか？
        </h2>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          回答はMemory・提案・UIの密度に反映します。
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">役に立った？</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["yes", "はい"],
                ["somewhat", "まあまあ"],
                ["no", "いいえ"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setHelpful(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  helpful === value
                    ? "border-accent bg-[var(--accent-muted)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">修正量は？</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["none", "ほぼ不要"],
                ["light", "少し"],
                ["heavy", "多め"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRevision(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  revision === value
                    ? "border-accent bg-[var(--accent-muted)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">また使う？</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["yes", "使う"],
                ["maybe", "わからない"],
                ["no", "使わない"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setReuse(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  reuse === value
                    ? "border-accent bg-[var(--accent-muted)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={dismiss}>
            あとで
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!helpful || !revision || !reuse}
            onClick={submit}
          >
            反映する
          </Button>
        </div>
      </div>
    </div>
  );
}
