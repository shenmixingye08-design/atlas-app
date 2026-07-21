"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";

export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    router.push(`/commander?assignment=${encodeURIComponent(trimmed)}`);
  };

  return (
    <section
      aria-labelledby="home-chat-heading"
      className="space-y-4 border-t border-[var(--border-subtle)] pt-10 sm:pt-12"
    >
      <div>
        <h2 id="home-chat-heading" className="text-lg font-semibold text-foreground sm:text-xl">
          {ui.todayDashboard.chatTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)] sm:text-base">
          {ui.todayDashboard.chatHint}
        </p>
      </div>
      <Card padding="lg" className="border-[var(--border-subtle)] shadow-[var(--shadow-sm)]">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder={ui.todayDashboard.chatPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitToWork();
            }
          }}
        />
        <ul className="mt-4 space-y-1 text-sm text-[var(--foreground-muted)]">
          {ui.todayDashboard.chatExamples.map((example) => (
            <li key={example}>・{example}</li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="primary" size="sm" className="w-full sm:w-auto" onClick={submitToWork}>
            {ui.todayDashboard.chatWorkAction}
          </Button>
        </div>
      </Card>
    </section>
  );
}
