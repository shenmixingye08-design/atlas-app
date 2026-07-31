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
 * Phase1 home hero — ask + 任せる only.
 * No attachments, formats, hints, or tool names.
 */
export function HomeChatBar() {
  const router = useRouter();
  const [input, setInput] = useState("");

  const submitToWork = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const payload = buildWorkRequestSubmitPayload({
      assignment: trimmed,
      attachmentIds: [],
      documents: [],
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
    <section aria-labelledby="home-ask-heading" className="space-y-5 overflow-x-hidden">
      <h1
        id="home-ask-heading"
        className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {ui.secretaryHome.askTitle}
      </h1>

      <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)] sm:p-6">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder={ui.secretaryHome.askPlaceholder}
          aria-label={ui.secretaryHome.askTitle}
          className="min-h-[120px] resize-y border-none bg-transparent px-1 py-1 text-lg leading-relaxed shadow-none focus:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitToWork();
            }
          }}
        />

        <div className="mt-5 pb-[env(safe-area-inset-bottom)]">
          <Button
            variant="primary"
            size="lg"
            className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
            onClick={submitToWork}
            disabled={!input.trim()}
          >
            {ui.secretaryHome.askSubmit}
          </Button>
        </div>
      </div>
    </section>
  );
}
