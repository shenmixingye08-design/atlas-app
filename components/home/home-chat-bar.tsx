"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

/** Home hero: one question, one send — no dashboard chrome. */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    router.push(
      `/workspace?assignment=${encodeURIComponent(trimmed)}&autostart=1`,
    );
  };

  return (
    <section aria-labelledby="home-ask-heading" className="space-y-5">
      <h2
        id="home-ask-heading"
        className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {ui.secretaryHome.askTitle}
      </h2>

      <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)] sm:p-6">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder={ui.secretaryHome.askPlaceholder}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[140px] resize-y border-none bg-transparent px-1 py-1 text-lg leading-relaxed shadow-none focus:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitToWork();
            }
          }}
        />
        <div className="mt-5">
          <Button
            variant="primary"
            size="lg"
            className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
            onClick={submitToWork}
            disabled={!input.trim()}
          >
            {ui.secretaryHome.askSubmit}
          </Button>
          <p className="mt-3 text-center text-sm text-[var(--foreground-muted)]">
            {ui.secretaryHome.askHint}
          </p>
        </div>
      </div>
    </section>
  );
}
