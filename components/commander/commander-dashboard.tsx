"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  cancelCommanderRequest,
  confirmCommanderRequest,
  submitCommanderRequest,
} from "@/lib/commander/client";
import type {
  CommanderPlan,
  CommanderRunResult,
  CommanderRunStatus,
} from "@/lib/commander/types";
import { projectService } from "@/lib/projects/project-service";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { SecretaryProgress } from "@/components/home/secretary-progress";

function statusLabel(status: CommanderRunStatus): string {
  switch (status) {
    case "planning":
      return ui.commander.statusPlanning;
    case "awaiting_confirmation":
      return ui.commander.statusAwaiting;
    case "running":
      return ui.commander.statusRunning;
    case "partial":
      return ui.commander.statusPartial;
    case "completed":
      return ui.commander.statusCompleted;
    case "failed":
      return ui.commander.statusFailed;
    case "cancelled":
      return ui.commander.statusCancelled;
    default:
      return status;
  }
}

function StatusPill({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        ok
          ? "bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]/30"
          : "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
      )}
    >
      {label}
    </span>
  );
}

function PlanPanel({ plan }: { plan: CommanderPlan }) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.commander.classificationTitle}
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {plan.classification.summary}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.commander.aisTitle}
        </h3>
        <ul className="space-y-2">
          {plan.requiredAis.map((ai) => (
            <li
              key={`${ai.employeeId}-${ai.phase}`}
              className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
            >
              <span className="font-medium text-foreground">
                {ai.name}
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {ai.role}
                </span>
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {ai.reason}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.commander.servicesTitle}
        </h3>
        {plan.requiredExternalServices.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.commander.noServices}
          </p>
        ) : (
          <ul className="space-y-2">
            {plan.requiredExternalServices.map((service) => (
              <li
                key={`${service.serviceId}-${service.label}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {service.label}
                </span>
                <StatusPill
                  ok={service.connectionStatus === "connected"}
                  label={
                    service.connectionStatus === "connected"
                      ? ui.commander.connected
                      : ui.commander.disconnected
                  }
                />
                {service.required && (
                  <span className="text-xs text-[var(--warning)]">
                    {ui.commander.required}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.commander.templateTitle}
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {plan.requiredTemplate.label}
          {plan.requiredTemplate.stepLabels.length > 0 &&
            ` — ${plan.requiredTemplate.stepLabels.join(" → ")}`}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.commander.memoryTitle}
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {plan.requiredMemory.summary}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.commander.orderTitle}
        </h3>
        <ol className="space-y-2">
          {plan.executionOrder.map((step, index) => (
            <li
              key={step.stepId}
              className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]"
            >
              <span className="font-medium text-foreground">
                {index + 1}. {step.label}
              </span>
              {step.parallel && (
                <StatusPill ok label={ui.commander.parallel} />
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-[var(--text-muted)]">
          {ui.commander.retryHint(plan.maxRetries)}
        </p>
      </section>
    </div>
  );
}

export function CommanderDashboard() {
  const [assignment, setAssignment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CommanderRunResult | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const searchParams = useSearchParams();

  function maybeSaveProject(result: CommanderRunResult, sourceAssignment: string) {
    if (
      result.result &&
      (result.status === "completed" || result.status === "partial")
    ) {
      // Same deterministic id the server used, so the completion notification's
      // deep link (/history?item=project-commander-<runId>) resolves to this save.
      const project = projectService.saveFromOrchestration(
        sourceAssignment.trim() || result.plan.assignment,
        result.result,
        result.runId ? `commander-${result.runId}` : undefined,
      );
      setSavedProjectId(project.id);
    }
  }

  const runAssignment = useCallback(
    async (text: string, mode: "plan" | "execute") => {
      const trimmed = text.trim();
      if (!trimmed || isLoadingRef.current) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);
      setSavedProjectId(null);

      try {
        const result = await submitCommanderRequest(trimmed, {
          signal: controller.signal,
          mode,
        });
        setRun(result);
        maybeSaveProject(result, trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : ui.error.generic);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const prefill = searchParams.get("assignment");
    if (prefill?.trim()) setAssignment(prefill);
    // ホームから「送る」で届いた依頼は、確認不要ですぐに実行する（クリック削減）。
    if (
      searchParams.get("autostart") === "1" &&
      prefill?.trim() &&
      !autoStartedRef.current
    ) {
      autoStartedRef.current = true;
      void runAssignment(prefill, "execute");
    }
  }, [runAssignment, searchParams]);

  async function handleSubmit(mode: "plan" | "execute") {
    await runAssignment(assignment, mode);
  }

  async function handleConfirm() {
    if (!run?.runId || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await confirmCommanderRequest(run.runId);
      setRun(result);
      maybeSaveProject(result, assignment || result.plan.assignment);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    if (!run?.runId || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      // Abort in-flight HTTP if still waiting
      abortRef.current?.abort();
      const result = await cancelCommanderRequest(run.runId);
      setRun(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
          {ui.commander.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {ui.commander.title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {ui.commander.subtitle}
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
          {ui.commander.automationOnlyHint}{" "}
          <Link
            href="/workspace"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {ui.commander.goToNewRequest}
          </Link>
        </p>
      </header>

      <Card
        padding="lg"
        className="border-[var(--border)] bg-[var(--surface-muted)] shadow-none"
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">
            {ui.commander.inputLabel}
          </span>
          <Textarea
            value={assignment}
            onChange={(event) => setAssignment(event.target.value)}
            rows={5}
            placeholder={ui.commander.inputPlaceholder}
            disabled={isLoading}
            className="min-h-[120px]"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={isLoading || !assignment.trim()}
            onClick={() => void handleSubmit("execute")}
          >
            {isLoading ? ui.commander.running : ui.commander.submit}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || !assignment.trim()}
            onClick={() => void handleSubmit("plan")}
          >
            {ui.commander.preview}
          </Button>
        </div>
      </Card>

      {isLoading && !run && <SecretaryProgress />}

      {error && <ErrorState message={error} />}

      {run && (
        <div className="space-y-6">
          <Card
            padding="lg"
            className="border-[var(--border)] bg-[var(--card)] shadow-none"
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                {run.report.title}
              </h2>
              <StatusPill
                ok={
                  run.status === "completed" || run.status === "partial"
                }
                label={statusLabel(run.status)}
              />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {run.report.summary}
            </p>

            {run.status === "awaiting_confirmation" && (
              <div className="mt-4 space-y-3 rounded-[var(--radius-lg)] border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-4">
                <p className="text-sm text-[var(--text-primary)]">
                  {ui.commander.confirmHint}
                </p>
                {run.confirmationReasons.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                    {run.confirmationReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={isLoading || !run.runId}
                    onClick={() => void handleConfirm()}
                  >
                    {ui.commander.confirmExecute}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isLoading || !run.runId}
                    onClick={() => void handleCancel()}
                  >
                    {ui.commander.cancelRun}
                  </Button>
                </div>
              </div>
            )}

            {(run.status === "running" || run.status === "planning") &&
              run.runId && (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={isLoading}
                    onClick={() => void handleCancel()}
                  >
                    {ui.commander.cancelRun}
                  </Button>
                </div>
              )}

            {run.report.automationHint && (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {run.report.automationHint}{" "}
                <Link
                  href="/automations"
                  className="text-[var(--accent)] hover:underline"
                >
                  {ui.commander.openAutomations}
                </Link>
              </p>
            )}
            {savedProjectId && (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {ui.commander.savedProject}{" "}
                <Link
                  href={`/projects/${savedProjectId}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {ui.commander.openProject}
                </Link>
              </p>
            )}
            {run.attempts.length > 0 && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                {ui.commander.attemptsLabel(
                  run.report.attempts,
                  run.report.retriesUsed,
                )}
              </p>
            )}
          </Card>

          <Card
            padding="lg"
            className="border-[var(--border)] bg-[var(--surface-muted)] shadow-none"
          >
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {ui.commander.planTitle}
            </h2>
            <PlanPanel plan={run.plan} />
          </Card>

          {run.result?.finalResponse && (
            <Card
              padding="lg"
              className="border-[var(--border)] bg-[var(--card)] shadow-none"
            >
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                {ui.commander.outputTitle}
              </h2>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                {run.result.finalResponse}
              </pre>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
