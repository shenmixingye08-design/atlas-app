"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  QUICK_START_PRESETS,
  buildQuickStartCreateHref,
  buildQuickStartTryNowHref,
} from "@/lib/first-value/quick-start-presets";
import { trackFirstValueEvent } from "@/lib/first-value/analytics";

export type CreateSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateSheet({ open, onClose }: CreateSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] md:hidden" role="dialog" aria-modal aria-labelledby={titleId}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--border-strong)]" aria-hidden />
        <h2 id={titleId} className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
          最初の仕事をAIへ任せましょう
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {QUICK_START_PRESETS.map((preset) => (
            <li key={preset.id}>
              <Link
                href={`/?quickStart=${encodeURIComponent(preset.id)}`}
                onClick={() => {
                  trackFirstValueEvent("quick_start_preset_clicked", {
                    id: preset.id,
                    source: "create_sheet",
                  });
                  trackAutomationFirstEvent("automation_template_selected", {
                    id: preset.id,
                    source: "create_sheet",
                  });
                  onClose();
                }}
                className="flex min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] px-2 text-center text-sm font-semibold text-[var(--text-primary)]"
              >
                {preset.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-2">
          <li>
            <Link
              href={buildQuickStartCreateHref(QUICK_START_PRESETS[0]!)}
              onClick={() => {
                trackAutomationFirstEvent("primary_automation_cta_clicked", {
                  source: "create_sheet",
                });
                onClose();
              }}
              className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-foreground)]"
            >
              新しい自動化を作る
            </Link>
          </li>
          <li>
            <Link
              href={buildQuickStartTryNowHref(QUICK_START_PRESETS[0]!)}
              onClick={() => {
                trackAutomationFirstEvent("one_time_request_clicked", {
                  source: "create_sheet",
                });
                onClose();
              }}
              className="flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              今すぐ一度だけ任せる
            </Link>
          </li>
        </ul>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-3 flex w-full min-h-[var(--touch-target)] items-center justify-center text-sm text-[var(--text-muted)]"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
