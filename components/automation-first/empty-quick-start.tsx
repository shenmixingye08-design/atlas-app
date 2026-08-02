"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  FREQUENCY_OPTIONS,
  QUICK_START_PRESETS,
  getQuickStartPreset,
  type QuickStartFrequency,
  type QuickStartPreset,
} from "@/lib/first-value/quick-start-presets";
import { trackFirstValueEvent } from "@/lib/first-value/analytics";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import { buildCreateInputFromWizard } from "@/lib/automation-platform/wizard/builders";
import {
  createAutomationV2,
  runAutomationV2,
} from "@/lib/automation-platform/client";
import { cn } from "@/lib/design-system/cn";

type Phase = "pick" | "form" | "created";

/**
 * Empty-home Quick Start — 3 clicks to Automation + まず一度試す.
 * No scheduler wait for first success.
 */
export function EmptyQuickStart({
  oneTimeHref = "/workspace",
  initialPresetId = null,
}: {
  oneTimeHref?: string;
  initialPresetId?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pick");
  const [preset, setPreset] = useState<QuickStartPreset | null>(null);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<QuickStartFrequency>("once");
  const [workContent, setWorkContent] = useState("");
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    const fromProp = getQuickStartPreset(initialPresetId);
    const fromQuery =
      typeof window !== "undefined"
        ? getQuickStartPreset(
            new URLSearchParams(window.location.search).get("quickStart"),
          )
        : null;
    const fromQueryOrProp = fromProp ?? fromQuery;
    if (!fromQueryOrProp || preset) return;
    setPreset(fromQueryOrProp);
    setTitle(fromQueryOrProp.title);
    setFrequency(fromQueryOrProp.defaultFrequency);
    setWorkContent(fromQueryOrProp.workContent);
    setPhase("form");
  }, [initialPresetId, preset]);

  const onPickPreset = (next: QuickStartPreset) => {
    setPreset(next);
    setTitle(next.title);
    setFrequency(next.defaultFrequency);
    setWorkContent(next.workContent);
    setPhase("form");
    setError(null);
    trackFirstValueEvent("quick_start_preset_clicked", { id: next.id });
    trackAutomationFirstEvent("automation_template_selected", {
      id: next.id,
      source: "empty_home",
    });
  };

  const onCreate = async () => {
    if (!preset || !title.trim() || !workContent.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const draft = proposeWizardFromNaturalLanguage(workContent.trim());
      draft.name = title.trim();
      draft.freeformNotes = workContent.trim();
      draft.frequency = frequency === "once" ? "once" : frequency;
      draft.triggerType = frequency === "once" ? "manual" : "schedule";
      draft.activateOnCreate = true;
      const payload = buildCreateInputFromWizard(draft);
      if (payload.errors.length > 0) {
        setError(payload.errors[0]!.message);
        return;
      }
      const created = await createAutomationV2(payload.input);
      setAutomationId(created.id);
      setPhase("created");
      trackFirstValueEvent("quick_start_submitted", {
        id: preset.id,
        frequency,
        automationId: created.id,
      });
      trackFirstValueEvent("automation_created", {
        id: created.id,
        source: "quick_start",
      });
      trackAutomationFirstEvent("automation_create_completed", {
        id: created.id,
        source: "quick_start",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "自動化を作成できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };

  const onTryNow = async () => {
    if (trying) return;
    setTrying(true);
    trackFirstValueEvent("first_try_now_clicked", {
      automationId,
      source: "quick_start",
    });
    try {
      if (automationId) {
        await runAutomationV2(automationId).catch(() => undefined);
      }
    } finally {
      // Real deliverable path — no scheduler wait.
      const params = new URLSearchParams({
        assignment: workContent.trim(),
        autostart: "1",
        ...(automationId ? { automationId } : {}),
        ...(preset ? { quickStart: preset.id } : {}),
      });
      router.push(`/workspace?${params.toString()}`);
    }
  };

  if (phase === "created") {
    return (
      <section className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 sm:p-6">
        <h2 className="text-[length:var(--text-page-title)] font-semibold text-[var(--text-primary)]">
          自動化を保存しました
        </h2>
        <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
          予定を待たず、今すぐ一度実行して成果物をご用意できます。
        </p>
        <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-[var(--text-muted)]">
            {FREQUENCY_OPTIONS.find((item) => item.id === frequency)?.label}
          </p>
        </div>
        <button
          type="button"
          disabled={trying}
          onClick={() => void onTryNow()}
          className="flex w-full min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          {trying ? "準備中…" : "まず一度試す"}
        </button>
        {automationId ? (
          <Link
            href={`/automations?id=${automationId}`}
            className="flex w-full min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] px-5 text-sm font-medium"
          >
            自動化の詳細を見る
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="empty-quick-start-heading"
      className="space-y-5 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 sm:p-6"
    >
      <div>
        <h2
          id="empty-quick-start-heading"
          className="text-[length:var(--text-page-title)] font-semibold tracking-tight text-[var(--text-primary)]"
        >
          最初の仕事をAIへ任せましょう
        </h2>
        <p className="mt-2 text-[length:var(--text-body)] text-[var(--text-secondary)]">
          空のままにはしません。選んで、タイトル・頻度・仕事内容だけ入力すれば自動化できます。
        </p>
      </div>

      <div>
        <p className="text-[length:var(--text-label)] font-medium text-[var(--text-muted)]">
          主CTA
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_START_PRESETS.map((item) => {
            const active = preset?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPickPreset(item)}
                  className={cn(
                    "flex w-full min-h-[var(--touch-target)] items-center justify-center rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition-colors",
                    active
                      ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {phase === "form" && preset ? (
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Quick Start（タイトル・頻度・仕事内容だけ）
          </p>
          <label className="block space-y-1">
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              タイトル
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full min-h-[var(--touch-target)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              頻度
            </legend>
            <div className="flex flex-wrap gap-2">
              {FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFrequency(option.id)}
                  className={cn(
                    "min-h-[var(--touch-target)] rounded-full border px-4 text-sm font-medium",
                    frequency === option.id
                      ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]"
                      : "border-[var(--border)] text-[var(--text-primary)]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1">
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              仕事内容
            </span>
            <textarea
              value={workContent}
              onChange={(event) => setWorkContent(event.target.value)}
              rows={4}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCreate()}
              className="inline-flex min-h-[var(--touch-target)] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
            >
              {busy ? "作成中…" : "自動化を作成する"}
            </button>
            <Link
              href={oneTimeHref}
              onClick={() =>
                trackAutomationFirstEvent("one_time_request_clicked", {
                  source: "empty_quick_start",
                })
              }
              className="inline-flex min-h-[var(--touch-target)] flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] px-5 text-sm font-medium text-[var(--text-primary)]"
            >
              今すぐ一度だけ任せる
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
