"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { ui } from "@/lib/i18n";
import {
  buildWorkRequestSubmitPayload,
  type PreferredDeliverableFormat,
  type WorkRequestSubmitPayload,
} from "@/lib/workspace/work-request-payload";

export type { WorkRequestSubmitPayload };
export type { PreferredDeliverableFormat as RequestPreferredFormat };

type WorkRequestFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (payload: WorkRequestSubmitPayload) => void;
  isLoading: boolean;
};

/**
 * Phase1 fallback ask form — same surface as home (no tools / formats / attach).
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

    onSubmit(
      buildWorkRequestSubmitPayload({
        assignment: trimmed,
        attachmentIds: [],
        documents: [],
        preferredFormat: "auto",
      }),
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 overflow-x-hidden sm:space-y-10">
      <header className="space-y-3 text-center">
        <p className="text-4xl font-semibold tracking-[0.08em] text-foreground">
          {ui.secretaryHome.brandName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {ui.secretaryHome.askTitle}
        </h1>
      </header>

      <Card padding="lg" className="space-y-4 bg-[var(--card)] shadow-[var(--shadow-md)]">
        <Textarea
          ref={textareaRef}
          id="work-request"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={ui.secretaryHome.askPlaceholder}
          rows={4}
          disabled={isLoading}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[120px] resize-y border-none bg-transparent px-0 py-0 text-lg leading-relaxed shadow-none focus:ring-0"
        />
      </Card>

      <div className="pb-[env(safe-area-inset-bottom)]">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading}
          isLoading={isLoading}
          className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
        >
          {ui.secretaryHome.askSubmit}
        </Button>
      </div>
    </div>
  );
}
