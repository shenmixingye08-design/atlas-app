"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/design-system/cn";
import {
  estimateRequestIntent,
  type RequestTimingIntent,
} from "@/lib/automations/intent-estimate";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { ui } from "@/lib/i18n";

type NewRequestEntryProps = {
  onSubmitOnce: (assignment: string) => void;
};

const TIMING_OPTIONS: {
  value: RequestTimingIntent;
  label: string;
  hint: string;
}[] = [
  {
    value: "once_now",
    label: ui.phase3.requestOnceNow,
    hint: ui.phase3.requestOnceNowHint,
  },
  {
    value: "once_scheduled",
    label: ui.phase3.requestOnceScheduled,
    hint: ui.phase3.requestOnceScheduledHint,
  },
  {
    value: "recurring",
    label: ui.phase3.requestRecurring,
    hint: ui.phase3.requestRecurringHint,
  },
];

export function NewRequestEntry({ onSubmitOnce }: NewRequestEntryProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const estimate = useMemo(() => estimateRequestIntent(text), [text]);
  const [timing, setTiming] = useState<RequestTimingIntent>("once_now");

  const effectiveTiming = text.trim() ? estimate.timing : timing;

  const handleContinue = () => {
    const assignment = text.trim();
    if (!assignment) return;

    if (effectiveTiming === "recurring") {
      const params = new URLSearchParams({
        assignment,
        title: estimate.suggestedTitle ?? "",
      });
      router.push(`/automations/new?${params.toString()}`);
      return;
    }

    if (effectiveTiming === "once_scheduled") {
      const params = new URLSearchParams({ assignment, schedule: "once" });
      router.push(`/automations/new?${params.toString()}`);
      return;
    }

    onSubmitOnce(assignment);
  };

  return (
    <Card padding="lg" className="space-y-6">
      <div>
        <h1 className="text-display text-foreground">{ui.phase3.requestHeading}</h1>
        <p className="mt-2 text-body text-[var(--foreground-muted)]">
          {ui.phase3.requestSubtitle}
        </p>
      </div>

      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim()) {
            setTiming(estimateRequestIntent(e.target.value).timing);
          }
        }}
        placeholder={ui.phase3.requestPlaceholder}
        rows={4}
        className="min-h-[120px] text-base"
        aria-label={ui.phase3.requestHeading}
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_REQUEST_PRESETS.slice(0, 5).map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="touch-target min-h-[44px] rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-foreground transition-colors hover:border-accent/40 focus-ring"
            onClick={() => setText(preset.prompt)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          {ui.phase3.requestTimingLegend}
        </legend>
        {text.trim() && (
          <p className="text-xs text-[var(--foreground-muted)]">
            {estimate.reason}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          {TIMING_OPTIONS.map((opt) => {
            const selected = effectiveTiming === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "touch-target min-h-[44px] rounded-[var(--radius-lg)] border px-3 py-3 text-left transition-colors focus-ring",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-[var(--border-subtle)] hover:border-accent/30",
                )}
                onClick={() => setTiming(opt.value)}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="mt-1 block text-xs text-[var(--foreground-muted)]">
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          variant="primary"
          size="lg"
          className="min-h-[44px] w-full sm:w-auto"
          disabled={!text.trim()}
          onClick={handleContinue}
        >
          {ui.phase3.requestContinue}
        </Button>
        <Link
          href="/automations/new"
          className="text-center text-sm text-[var(--foreground-muted)] underline-offset-2 hover:text-accent hover:underline"
        >
          {ui.phase3.newAutomationLink}
        </Link>
      </div>
    </Card>
  );
}
