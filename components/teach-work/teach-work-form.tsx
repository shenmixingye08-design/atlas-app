"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { createWorkMemoryClient } from "@/lib/work-memory";
import {
  TEACH_AI_OPTIONS,
  TEACH_SERVICE_OPTIONS,
  buildTaughtStructuredData,
  createEmptyTaughtStep,
  type TaughtWorkflowStep,
} from "@/lib/work-memory/taught-workflow";

export function TeachWorkForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<TaughtWorkflowStep[]>([
    createEmptyTaughtStep(0),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    return steps.some((step) => step.title.trim().length > 0);
  }, [steps, title]);

  const updateStep = (id: string, patch: Partial<TaughtWorkflowStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    );
  };

  const removeStep = (id: string) => {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((step) => step.id !== id)));
  };

  const handleSave = async () => {
    const validSteps = steps.filter((step) => step.title.trim());
    if (!title.trim() || validSteps.length === 0) {
      setError("仕事名と、少なくとも1つのステップが必要です。");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const structuredData = buildTaughtStructuredData({
        title: title.trim(),
        description: description.trim(),
        steps: validSteps,
      });
      await createWorkMemoryClient({
        type: "template",
        title: title.trim(),
        summary: description.trim() || title.trim(),
        sourceType: "user_explicit",
        isUserConfirmed: true,
        confidence: 1,
        tags: ["template", "taught-workflow", "learned-job"],
        structuredData,
      });
      router.push("/learned-jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent">AI秘書</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          AI秘書へ仕事を教える
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
          一度だけ流れを教えると、次回から同じ手順で進められます。
        </p>
      </header>

      <section className="space-y-4 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <div>
          <label className="mb-2 block text-sm text-[var(--foreground-muted)]" htmlFor="teach-title">
            仕事名
          </label>
          <Input
            id="teach-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例：営業資料作成"
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm text-[var(--foreground-muted)]"
            htmlFor="teach-description"
          >
            説明
          </label>
          <Textarea
            id="teach-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="この仕事の目的や前提を短く書いてください"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            ステップ
          </h2>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() =>
              setSteps((prev) => [...prev, createEmptyTaughtStep(prev.length)])
            }
          >
            ステップ追加
          </Button>
        </div>

        <ul className="space-y-4">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-accent">
                  {index + 1}. ステップ
                </p>
                {steps.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => removeStep(step.id)}
                  >
                    削除
                  </Button>
                )}
              </div>

              <div className="mt-4 space-y-4">
                <Input
                  value={step.title}
                  onChange={(event) =>
                    updateStep(step.id, { title: event.target.value })
                  }
                  placeholder="例：PDFを読む"
                  aria-label={`ステップ${index + 1}の名前`}
                />
                <Textarea
                  value={step.description}
                  onChange={(event) =>
                    updateStep(step.id, { description: event.target.value })
                  }
                  rows={2}
                  placeholder="このステップで行うこと"
                  aria-label={`ステップ${index + 1}の説明`}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs text-[var(--foreground-muted)]">
                      利用AI
                    </label>
                    <select
                      value={step.ai}
                      onChange={(event) =>
                        updateStep(step.id, { ai: event.target.value })
                      }
                      className="h-11 w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-sm text-foreground"
                    >
                      {TEACH_AI_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs text-[var(--foreground-muted)]">
                      利用サービス
                    </label>
                    <select
                      value={step.service}
                      onChange={(event) =>
                        updateStep(step.id, { service: event.target.value })
                      }
                      className="h-11 w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-sm text-foreground"
                    >
                      {TEACH_SERVICE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={step.needsReview}
                      onChange={(event) =>
                        updateStep(step.id, { needsReview: event.target.checked })
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    確認が必要
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={step.canAutoRun}
                      onChange={(event) =>
                        updateStep(step.id, { canAutoRun: event.target.checked })
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    自動実行可能
                  </label>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="text-sm text-[var(--status-error)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="primary"
          size="lg"
          className="rounded-full"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "教えて保存する"}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="rounded-full"
          disabled={saving}
          onClick={() => router.push("/projects")}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
}
