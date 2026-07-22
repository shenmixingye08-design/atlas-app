"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/design-system/cn";
import {
  createAutomation,
  runAutomationNow,
} from "@/lib/automations/client";
import { describeFailureMode, failureModeToRetryConfig } from "@/lib/automations/failure-modes";
import {
  buildSchedulePreview,
  describeScheduleKind,
  formatTimeInZone,
} from "@/lib/automations/schedule-display";
import { buildScheduleFromForm } from "@/lib/automations/form-utils";
import { testRunBannerMessage } from "@/lib/automations/test-run";
import {
  buildDraftEnvelope,
  clearDraftLocally,
  hasMeaningfulDraft,
  loadDraftLocally,
  saveDraftLocally,
  type AutomationDraftEnvelope,
} from "@/lib/automations/wizard-draft";
import {
  defaultWizardState,
  wizardStepIndex,
  wizardStepLabel,
  wizardToCreateInput,
  WIZARD_STEPS,
  type AutomationWizardState,
  type AutomationWizardStep,
  type FailureMode,
} from "@/lib/automations/wizard-state";
import {
  filterWiredTemplates,
  type WiredAutomationTemplate,
} from "@/lib/automations/wired-templates";
import { EXECUTION_LEVEL_OPTIONS } from "@/lib/automations/execution-level";
import { ui } from "@/lib/i18n";

import { ExecutionLevelSelector } from "./execution-level-selector";

function WizardProgress({ step }: { step: AutomationWizardStep }) {
  const idx = wizardStepIndex(step);
  return (
    <ol className="flex gap-1 overflow-x-hidden sm:gap-2" aria-label="進捗">
      {WIZARD_STEPS.map((s, i) => (
        <li
          key={s}
          className={cn(
            "min-h-[44px] flex-1 rounded-[var(--radius-md)] px-1 py-2 text-center text-[10px] font-medium leading-tight sm:text-xs",
            i <= idx
              ? "bg-accent/15 text-accent"
              : "bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
          )}
        >
          <span className="hidden sm:inline">{wizardStepLabel(s)}</span>
          <span className="sm:hidden">{i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

type AutomationWizardProps = {
  initial?: Partial<AutomationWizardState>;
};

export function AutomationWizard({ initial }: AutomationWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wizard, setWizard] = useState(() =>
    defaultWizardState({
      assignment: searchParams.get("assignment") ?? "",
      title: searchParams.get("title") ?? "",
      ...initial,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [draftEnvelope, setDraftEnvelope] = useState<AutomationDraftEnvelope | null>(
    null,
  );
  const [templateQuery, setTemplateQuery] = useState("");
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const templates = useMemo(
    () => filterWiredTemplates(templateQuery),
    [templateQuery],
  );

  const schedulePreview = useMemo(() => {
    const formSchedule = buildScheduleFromForm({
      title: wizard.title,
      assignment: wizard.assignment,
      description: wizard.description,
      frequency: wizard.frequency,
      dayOfWeek: wizard.dayOfWeek,
      dayOfMonth: wizard.dayOfMonth,
      hour: wizard.hour,
      minute: wizard.minute,
      startDate: wizard.startDate,
      endType: wizard.endType,
      endDate: wizard.endDate,
      maxOccurrences: wizard.maxOccurrences,
      executionLevel: wizard.executionLevel,
      executionMode: wizard.executionMode,
      snsBatchDays: null,
      executionFlow: { templateId: wizard.templateId, steps: [] },
    });
    return buildSchedulePreview(formSchedule);
  }, [wizard]);

  useEffect(() => {
    void fetch("/api/automations/draft")
      .then((r) => (r.ok ? r.json() : null))
      .then((remote) => {
        const local = loadDraftLocally();
        const candidate = (remote as AutomationDraftEnvelope | null) ?? local;
        if (hasMeaningfulDraft(candidate) && !searchParams.get("assignment")) {
          setDraftEnvelope(candidate);
          setShowResume(true);
        }
      })
      .catch(() => {
        const local = loadDraftLocally();
        if (hasMeaningfulDraft(local)) {
          setDraftEnvelope(local);
          setShowResume(true);
        }
      });
  }, [searchParams]);

  const persistDraft = useCallback((state: AutomationWizardState) => {
    const envelope = buildDraftEnvelope(state);
    saveDraftLocally(envelope);
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void fetch("/api/automations/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
    }, 800);
  }, []);

  const update = useCallback(
    (patch: Partial<AutomationWizardState>) => {
      setWizard((prev) => {
        const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
        persistDraft(next);
        return next;
      });
    },
    [persistDraft],
  );

  const goStep = (step: AutomationWizardStep) => update({ step });

  const applyTemplate = (t: WiredAutomationTemplate) => {
    update({
      title: t.name,
      assignment: t.defaultAssignment,
      templateId: t.templateId,
      outputFormats: t.defaultFormats,
      requiredConnections: t.requiredConnections,
    });
  };

  const missingConnections = wizard.requiredConnections.filter(Boolean);

  const handleCreate = async (enableAfter = true) => {
    if (!wizard.title.trim() || !wizard.assignment.trim()) {
      setError(ui.phase3.wizardValidation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = wizardToCreateInput(wizard);
      input.enabled = enableAfter;
      const created = await createAutomation(input);
      setCreatedId(created.id);
      clearDraftLocally();
      void fetch("/api/automations/draft", { method: "DELETE" });
      if (enableAfter) {
        router.push(`/automations?id=${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setSaving(false);
    }
  };

  const handleTestRun = async () => {
    setSaving(true);
    setError(null);
    try {
      let id = createdId;
      if (!id) {
        if (!wizard.title.trim() || !wizard.assignment.trim()) {
          setError(ui.phase3.wizardValidation);
          return;
        }
        const input = wizardToCreateInput(wizard);
        input.enabled = false;
        const created = await createAutomation(input);
        id = created.id;
        setCreatedId(id);
      }
      await runAutomationNow(id, {
        mode: "test",
        livePublish: wizard.testLivePublish,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.runFailed);
    } finally {
      setSaving(false);
    }
  };

  const testBanner = testRunBannerMessage({
    mode: "test",
    livePublish: wizard.testLivePublish,
  });

  const retryConfig = failureModeToRetryConfig(wizard.failureMode);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.phase3.wizardTitle}</h1>
        <p className="text-body text-[var(--foreground-muted)]">
          {ui.phase3.wizardSubtitle}
        </p>
      </header>

      <WizardProgress step={wizard.step} />

      {showResume && draftEnvelope && (
        <Card padding="md" className="border-accent/30 bg-accent/5">
          <p className="text-sm text-foreground">{ui.phase3.draftResumePrompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              className="min-h-[44px]"
              onClick={() => {
                setWizard(draftEnvelope.wizard);
                setShowResume(false);
              }}
            >
              {ui.phase3.draftResumeYes}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => {
                clearDraftLocally();
                void fetch("/api/automations/draft", { method: "DELETE" });
                setShowResume(false);
              }}
            >
              {ui.phase3.draftResumeNo}
            </Button>
          </div>
        </Card>
      )}

      {error && <ErrorState message={error} />}

      {wizard.step === "work" && (
        <Card padding="lg" className="space-y-4">
          <Input
            label={ui.habits.fieldTitle}
            value={wizard.title}
            onChange={(e) => update({ title: e.target.value })}
          />
          <Textarea
            label={ui.habits.fieldAssignment}
            value={wizard.assignment}
            onChange={(e) => update({ assignment: e.target.value })}
            rows={4}
          />
          <div>
            <p className="mb-2 text-sm font-medium">{ui.phase3.templatePick}</p>
            <Input
              value={templateQuery}
              onChange={(e) => setTemplateQuery(e.target.value)}
              placeholder={ui.phase3.templateSearch}
            />
            <ul className="mt-3 space-y-2">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="touch-target w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-3 text-left hover:border-accent/40 focus-ring"
                    onClick={() => applyTemplate(t)}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="mt-1 block text-xs text-[var(--foreground-muted)]">
                      {t.description}
                      {t.requiredConnections.length > 0 &&
                        ` · 連携: ${t.requiredConnections.join(", ")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-between gap-3">
            <Link href="/automations" className="min-h-[44px] self-center text-sm text-[var(--foreground-muted)]">
              {ui.actions.cancel}
            </Link>
            <Button className="min-h-[44px]" onClick={() => goStep("schedule")}>
              {ui.phase3.wizardNext}
            </Button>
          </div>
        </Card>
      )}

      {wizard.step === "schedule" && (
        <Card padding="lg" className="space-y-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.phase3.scheduleTimezone} Asia/Tokyo
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              ["daily", "weekly", "monthly"] as const
            ).map((freq) => (
              <button
                key={freq}
                type="button"
                className={cn(
                  "touch-target min-h-[44px] rounded-[var(--radius-md)] border px-3 py-2 text-sm focus-ring",
                  wizard.frequency === freq
                    ? "border-accent bg-accent/10"
                    : "border-[var(--border-subtle)]",
                )}
                onClick={() => update({ frequency: freq, scheduleKind: freq })}
              >
                {describeScheduleKind(freq === "daily" ? "daily" : freq === "weekly" ? "weekly" : "monthly")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`${ui.habits.fieldTime}（時）`}
              type="number"
              min={0}
              max={23}
              value={wizard.hour}
              onChange={(e) => update({ hour: Number(e.target.value) })}
            />
            <Input
              label={`${ui.habits.fieldTime}（分）`}
              type="number"
              min={0}
              max={59}
              value={wizard.minute}
              onChange={(e) => update({ minute: Number(e.target.value) })}
            />
          </div>
          {schedulePreview && (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
              <p>{ui.phase3.nextRun}: {schedulePreview.nextRun ? formatTimeInZone(schedulePreview.nextRun, schedulePreview.timezone) : "—"}</p>
              <p className="mt-1 text-[var(--foreground-muted)]">
                {ui.phase3.followingRun}:{" "}
                {schedulePreview.followingRun
                  ? formatTimeInZone(schedulePreview.followingRun, schedulePreview.timezone)
                  : "—"}
              </p>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="secondary" className="min-h-[44px]" onClick={() => goStep("work")}>
              {ui.phase3.wizardBack}
            </Button>
            <Button className="min-h-[44px]" onClick={() => goStep("output")}>
              {ui.phase3.wizardNext}
            </Button>
          </div>
        </Card>
      )}

      {wizard.step === "output" && (
        <Card padding="lg" className="space-y-4">
          <p className="text-sm text-[var(--foreground-muted)]">{ui.phase3.outputHint}</p>
          <div className="flex flex-wrap gap-2">
            {(["pdf", "docx", "xlsx"] as const).map((fmt) => {
              const on = wizard.outputFormats.includes(fmt);
              return (
                <button
                  key={fmt}
                  type="button"
                  className={cn(
                    "touch-target min-h-[44px] rounded-full border px-4 text-sm uppercase focus-ring",
                    on ? "border-accent bg-accent/10" : "border-[var(--border-subtle)]",
                  )}
                  onClick={() =>
                    update({
                      outputFormats: on
                        ? wizard.outputFormats.filter((f) => f !== fmt)
                        : [...wizard.outputFormats, fmt],
                    })
                  }
                >
                  {fmt}
                </button>
              );
            })}
          </div>
          <ExecutionLevelSelector
            value={wizard.executionLevel}
            onChange={(executionLevel) => update({ executionLevel })}
          />
          <p className="text-xs text-[var(--foreground-muted)]">
            {EXECUTION_LEVEL_OPTIONS.find((o) => o.level === wizard.executionLevel)?.description}
          </p>
          <div className="flex justify-between">
            <Button variant="secondary" className="min-h-[44px]" onClick={() => goStep("schedule")}>
              {ui.phase3.wizardBack}
            </Button>
            <Button className="min-h-[44px]" onClick={() => goStep("notifications")}>
              {ui.phase3.wizardNext}
            </Button>
          </div>
        </Card>
      )}

      {wizard.step === "notifications" && (
        <Card padding="lg" className="space-y-4">
          <p className="text-sm">{ui.phase3.notificationHint}</p>
          {(
            [
              ["onSuccess", ui.phase3.notifySuccess],
              ["onFailure", ui.phase3.notifyFailure],
              ["onApproval", ui.phase3.notifyApproval],
              ["onArtifact", ui.phase3.notifyArtifact],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex min-h-[44px] items-center gap-3">
              <input
                type="checkbox"
                checked={wizard.notificationPrefs[key]}
                onChange={(e) =>
                  update({
                    notificationPrefs: {
                      ...wizard.notificationPrefs,
                      [key]: e.target.checked,
                    },
                  })
                }
                className="h-5 w-5"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{ui.phase3.failureLegend}</legend>
            {(["retry_3", "retry_1", "notify_only"] as FailureMode[]).map((mode) => (
              <label key={mode} className="flex min-h-[44px] items-start gap-3">
                <input
                  type="radio"
                  name="failureMode"
                  checked={wizard.failureMode === mode}
                  onChange={() => update({ failureMode: mode })}
                  className="mt-1"
                />
                <span className="text-sm">{describeFailureMode(mode)}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-[var(--foreground-muted)]">
            {ui.phase3.retryPersistNote(retryConfig.maxAttempts)}
          </p>
          <div className="flex justify-between">
            <Button variant="secondary" className="min-h-[44px]" onClick={() => goStep("output")}>
              {ui.phase3.wizardBack}
            </Button>
            <Button className="min-h-[44px]" onClick={() => goStep("confirm")}>
              {ui.phase3.wizardNext}
            </Button>
          </div>
        </Card>
      )}

      {wizard.step === "confirm" && (
        <Card padding="lg" className="space-y-4">
          <h2 className="text-title">{ui.phase3.confirmTitle}</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-[var(--foreground-muted)]">{ui.habits.fieldTitle}</dt><dd>{wizard.title || "—"}</dd></div>
            <div><dt className="text-[var(--foreground-muted)]">{ui.habits.fieldAssignment}</dt><dd>{wizard.assignment || "—"}</dd></div>
            <div><dt className="text-[var(--foreground-muted)]">{ui.phase3.scheduleLabel}</dt><dd>{schedulePreview?.label ?? "—"}</dd></div>
            <div><dt className="text-[var(--foreground-muted)]">{ui.phase3.outputLabel}</dt><dd>{wizard.outputFormats.join(", ") || "—"}</dd></div>
          </dl>

          {missingConnections.length > 0 && (
            <Card padding="md" className="border-amber-500/40 bg-amber-500/5">
              <p className="text-sm">{ui.phase3.connectionGap(missingConnections.join(", "))}</p>
              <Link
                href={`/settings?returnTo=${encodeURIComponent("/automations/new")}`}
                className="mt-2 inline-flex min-h-[44px] items-center text-sm text-accent underline"
              >
                {ui.phase3.connectNow}
              </Link>
            </Card>
          )}

          {testBanner && (
            <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
              {testBanner}
            </p>
          )}

          <label className="flex min-h-[44px] items-center gap-3">
            <input
              type="checkbox"
              checked={wizard.testLivePublish}
              onChange={(e) => update({ testLivePublish: e.target.checked })}
            />
            <span className="text-sm">{ui.phase3.testLivePublish}</span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              className="min-h-[44px] flex-1"
              disabled={saving}
              onClick={() => void handleTestRun()}
            >
              {ui.phase3.testRun}
            </Button>
            <Button
              variant="primary"
              className="min-h-[44px] flex-1"
              disabled={saving}
              onClick={() => void handleCreate(true)}
            >
              {ui.phase3.activate}
            </Button>
          </div>
          <Button variant="secondary" className="min-h-[44px] w-full" onClick={() => goStep("notifications")}>
            {ui.phase3.wizardBack}
          </Button>
        </Card>
      )}
    </div>
  );
}
