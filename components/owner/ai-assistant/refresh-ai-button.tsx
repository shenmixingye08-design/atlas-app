"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AssistantPeriod } from "@/lib/owner/ai-assistant";

export function RefreshAiButton({ period }: { period: AssistantPeriod }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const response = await fetch("/api/owner/ai-assistant", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ period }),
            });
            if (!response.ok) {
              setError("AI再分析に失敗しました");
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "AI分析中…" : "AI再分析を実行"}
      </button>
      <p className="text-xs text-[var(--text-muted)]">
        承認後実行 · 同一データはキャッシュ再利用
      </p>
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}
