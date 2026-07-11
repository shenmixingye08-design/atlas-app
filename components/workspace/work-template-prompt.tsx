"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createWorkMemoryClient } from "@/lib/work-memory";

type WorkTemplatePromptProps = {
  assignment: string;
  onDone?: () => void;
};

function deriveTitle(assignment: string): string {
  const firstLine =
    assignment
      .split(/\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("【")) ?? "";
  const cleaned = firstLine.replace(/^[#*\-・\s]+/, "").trim();
  if (!cleaned) return "覚えた仕事";
  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}…` : cleaned;
}

export function WorkTemplatePrompt({ assignment, onDone }: WorkTemplatePromptProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "skipped" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  if (!assignment.trim() || status === "skipped" || status === "saved") {
    return null;
  }

  const saveTemplate = async (autoUpdate: boolean) => {
    setStatus("saving");
    setError(null);
    try {
      const title = deriveTitle(assignment);
      await createWorkMemoryClient({
        type: "template",
        title,
        summary: assignment.trim().slice(0, 500),
        sourceType: "user_explicit",
        isUserConfirmed: true,
        confidence: 1,
        tags: ["template", "learned-job"],
        structuredData: {
          assignmentPattern: assignment.trim(),
          autoUpdate,
        },
      });
      setStatus("saved");
      onDone?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  };

  return (
    <section
      aria-labelledby="work-template-prompt-title"
      className="animate-fade-up rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <p className="text-xs font-medium tracking-wide text-accent">AI秘書</p>
      <h2
        id="work-template-prompt-title"
        className="mt-2 text-lg font-semibold tracking-tight text-foreground"
      >
        この仕事をテンプレート化しますか？
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
        次回から同じ形式で、すぐに依頼できるようになります。
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="primary"
          size="sm"
          className="rounded-full"
          disabled={status === "saving"}
          onClick={() => void saveTemplate(false)}
        >
          テンプレート化する
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={status === "saving"}
          onClick={() => {
            setStatus("skipped");
            onDone?.();
          }}
        >
          今回だけ
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={status === "saving"}
          onClick={() => void saveTemplate(true)}
        >
          毎回自動で更新する
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-[var(--error)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
