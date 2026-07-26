"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";

export type RequestExecutionMode = "once" | "recurring" | "delegate";
export type RequestPriority = "low" | "normal" | "high";

export type WorkRequestSubmitPayload = {
  assignment: string;
  metadata: Readonly<Record<string, unknown>>;
};

type WorkRequestFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (payload: WorkRequestSubmitPayload) => void;
  isLoading: boolean;
};

/**
 * Zero-friction request form.
 * Only ask what the user wants — priority / schedule / AI choice are inferred.
 */
export function WorkRequestForm({
  value,
  onChange,
  onSubmit,
  isLoading,
}: WorkRequestFormProps) {
  const searchParams = useSearchParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (searchParams.get("attach") === "text") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [searchParams]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;

    onSubmit({
      assignment: trimmed,
      metadata: {
        requestUi: "secretary_zero_friction_v1",
        // Defaults — AI / product logic may refine later; never ask first.
        executionPreference: "once" satisfies RequestExecutionMode,
        priority: "normal" satisfies RequestPriority,
        skipWorkMemory: false,
      },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = value.trim().length > 0 && !isLoading;

  return (
    <div className="mx-auto max-w-2xl space-y-8 sm:space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-sm font-medium text-accent">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.secretaryHome.askTitle}</h1>
        <p className="text-body mx-auto max-w-xl text-[var(--text-secondary)]">
          {ui.secretaryHome.zeroFrictionHint}
        </p>
      </header>

      <section className="space-y-3" aria-label={ui.work.templatesLabel}>
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_REQUEST_PRESETS.slice(0, 4).map((preset) => {
            const selected = value.trim() === preset.prompt.trim();
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  onChange(preset.prompt);
                  requestAnimationFrame(() => {
                    const textarea = textareaRef.current;
                    if (!textarea) return;
                    textarea.focus();
                    const len = preset.prompt.length;
                    textarea.setSelectionRange(len, len);
                  });
                }}
                className={cn(
                  "touch-target rounded-full border px-4 py-2 text-sm font-medium transition-all focus-ring",
                  selected
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-[var(--border-subtle)] bg-[var(--card)] text-foreground hover:border-accent/40",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      <Card padding="lg" className="bg-[var(--card)] shadow-[var(--shadow-md)]">
        <Textarea
          ref={textareaRef}
          id="work-request"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={ui.secretaryHome.askPlaceholder}
          rows={7}
          disabled={isLoading}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[180px] resize-y border-none bg-transparent px-0 py-0 text-lg leading-relaxed shadow-none focus:ring-0"
        />
      </Card>

      <div>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={isLoading}
          className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
        >
          {ui.secretaryHome.askSubmit}
        </Button>
        <p className="mt-3 text-center text-sm text-[var(--text-secondary)]">
          {ui.secretaryHome.askHint}
        </p>
      </div>
    </div>
  );
}
