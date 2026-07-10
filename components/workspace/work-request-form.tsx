"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ui } from "@/lib/i18n";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";

type WorkRequestFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  skipWorkMemory?: boolean;
  onSkipWorkMemoryChange?: (value: boolean) => void;
};

export function WorkRequestForm({
  value,
  onChange,
  onSubmit,
  isLoading,
  skipWorkMemory = false,
  onSkipWorkMemoryChange,
}: WorkRequestFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePresetClick = (preset: (typeof QUICK_REQUEST_PRESETS)[number]) => {
    if (preset.href) {
      router.push(preset.href);
      return;
    }
    const prompt = preset.prompt;
    onChange(prompt);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(prompt.length, prompt.length);
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {ui.work.quickRequestHeading}
          </p>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.work.quickRequestHint}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={ui.work.quickRequestHeading}
        >
          {QUICK_REQUEST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={isLoading}
              onClick={() => handlePresetClick(preset)}
              className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                value.trim() === preset.prompt
                  ? "border-accent bg-accent/10 font-medium text-foreground"
                  : "border-[var(--border-subtle)] bg-[var(--background-subtle)] text-foreground hover:border-accent/40 hover:bg-accent/5"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        id="work-request"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={ui.work.placeholder}
        rows={4}
        disabled={isLoading}
        aria-label={ui.work.placeholder}
        className="min-h-[120px] border-none bg-[var(--background-subtle)] text-base shadow-none focus:ring-2 focus:ring-accent/20"
      />

      {onSkipWorkMemoryChange && (
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={skipWorkMemory}
            disabled={isLoading}
            onChange={(e) => onSkipWorkMemoryChange(e.target.checked)}
          />
          {ui.workMemory.skipForRequest}
        </label>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={onSubmit}
        disabled={!value.trim()}
        isLoading={isLoading}
      >
        {ui.actions.start}
      </Button>
    </div>
  );
}
