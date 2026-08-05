"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  buildWorkRequestSubmitPayload,
  stashPendingWorkRequestSubmit,
} from "@/lib/workspace/work-request-payload";

/**
 * Phase1 home ask — text + 任せる only.
 * Attachments / formats are not shown (secretary decides means internally).
 */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const payload = buildWorkRequestSubmitPayload({
      assignment: trimmed,
      preferredFormat: "auto",
    });
    stashPendingWorkRequestSubmit(payload);

    try {
      sessionStorage.removeItem("atlas.pendingDocumentExtracts");
    } catch {
      /* ignore */
    }

    router.push("/workspace?autostart=1");
  };

  return (
    <section aria-labelledby="home-ask-heading" className="space-y-6">
      <h1
        id="home-ask-heading"
        className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {ui.secretaryHome.askTitle}
      </h1>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        placeholder=""
        aria-label={ui.secretaryHome.askTitle}
        className="min-h-[120px] resize-none border border-[var(--border-subtle)] bg-transparent px-4 py-4 text-lg leading-relaxed shadow-none focus:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitToWork();
          }
        }}
      />

      <div className="flex justify-center pb-[env(safe-area-inset-bottom)]">
        <Button
          variant="primary"
          size="lg"
          className="h-12 min-w-[8rem] rounded-full px-10 text-base"
          onClick={submitToWork}
          disabled={!input.trim()}
        >
          {ui.secretaryHome.askSubmit}
        </Button>
      </div>
    </section>
  );
}
