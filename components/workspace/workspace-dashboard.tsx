"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { projectService } from "@/lib/projects/project-service";
import {
  LOADING_STEP_INTERVAL_MS,
  buildLoadingPhases,
  createInitialPhases,
} from "@/lib/workspace/constants";
import {
  CommanderConfirmationRequiredError,
  confirmWorkRequest,
  submitWorkRequest,
} from "@/lib/workspace/orchestrate-client";
import type { CommanderRunResult } from "@/lib/commander/types";
import { isSalesMaterialRequest } from "@/lib/workspace/sales-material/detect";
import { buildSalesMaterialMetadata } from "@/lib/workspace/sales-material/metadata";
import type { SalesMaterialSessionConfig } from "@/lib/workspace/sales-material/types";
import { useFeatureAvailability } from "@/lib/feature-flags";
import { useDeliverableFiles } from "@/lib/workspace/use-deliverable-files";
import type { WorkflowPhaseState } from "@/lib/workspace/types";
import {
  EXECUTION_MAX_RETRIES,
  EXECUTION_TIMEOUT_MS,
  appendExecutionLog,
  formatFailureReason,
  getExecutionState,
  markExecutionPhase,
  startExecutionState,
  startTimeoutMonitor,
  updateExecutionState,
  withExecutionRetry,
  type ExecutionStateRecord,
} from "@/lib/execution-reliability";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

import { FinalOutput } from "./final-output";
import { KnowledgeUsedPanel } from "./knowledge-used-panel";
import { PrReviewPanel } from "./pr-review-panel";
import { GrowthReviewPanel } from "./growth-review-panel";
import { CompanyLearningPanel } from "./company-learning-panel";
import { CompanyOperationsPanel } from "./company-operations-panel";
import { ActionEnginePanel } from "./action-engine-panel";
import { WorkflowInspectorPanel } from "./workflow-inspector-panel";
import {
  WorkRequestForm,
  type WorkRequestSubmitPayload,
} from "./work-request-form";
import {
  WorkMemoryCandidateBanner,
  WorkMemoryUsedBanner,
} from "./work-memory-used-banner";
import { WorkTemplatePrompt } from "./work-template-prompt";
import { WorkflowResults } from "./workflow-results";
import {
  SalesMaterialWizard,
  formatOutlineAsDisplayText,
  formatsForWizardConfig,
  type SalesMaterialWizardResult,
} from "./sales-material-wizard";
import { ExecutionReliabilityNotice } from "./execution-reliability-notice";
import { WorkspaceCompletionSummary } from "./workspace-completion-summary";

export function WorkspaceDashboard() {
  const [assignment, setAssignment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhases, setLoadingPhases] =
    useState<WorkflowPhaseState[]>(createInitialPhases);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [salesWizardAssignment, setSalesWizardAssignment] = useState<string | null>(
    null,
  );
  const [salesMaterialConfig, setSalesMaterialConfig] =
    useState<SalesMaterialSessionConfig | null>(null);
  const [outlineOnlyText, setOutlineOnlyText] = useState<string | null>(null);
  const [requestMetadata, setRequestMetadata] = useState<
    Readonly<Record<string, unknown>>
  >({});
  const [workMemoryUsed, setWorkMemoryUsed] = useState<
    OrchestrationResult["workMemory"] | null
  >(null);
  const [workMemoryCandidateCount, setWorkMemoryCandidateCount] = useState(0);
  const [taughtWorkflowHint, setTaughtWorkflowHint] = useState(false);
  const [pendingCommander, setPendingCommander] =
    useState<CommanderRunResult | null>(null);
  const [executionState, setExecutionState] =
    useState<ExecutionStateRecord | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);
  const { isAvailable } = useFeatureAvailability();
  const deliverableOptions = salesMaterialConfig
    ? {
        formats: formatsForWizardConfig(salesMaterialConfig),
        skipFileGeneration: salesMaterialConfig.skipFileGeneration,
      }
    : undefined;
  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(result, deliverableOptions);

  const searchParams = useSearchParams();

  useEffect(() => {
    const prefill = searchParams.get("assignment");
    if (prefill?.trim()) {
      setAssignment(prefill);
    }
    setTaughtWorkflowHint(searchParams.get("taught") === "1");
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingStepIndex((prev) =>
        Math.min(prev + 1, loadingPhases.length - 1),
      );
    }, LOADING_STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLoading, loadingPhases.length]);

  useEffect(() => {
    if (isLoading) {
      setLoadingPhases(buildLoadingPhases(loadingStepIndex));
    }
  }, [loadingStepIndex, isLoading]);

  const runOrchestration = useCallback(async (
    requestAssignment: string,
    config?: SalesMaterialSessionConfig | null,
    extraMetadata?: Readonly<Record<string, unknown>>,
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setFailureReason(null);
    setResult(null);
    setOutlineOnlyText(null);
    setWorkMemoryUsed(null);
    setWorkMemoryCandidateCount(0);
    setPendingCommander(null);
    setSavedProjectId(null);
    setIsLoading(true);
    setLoadingStepIndex(0);
    setLoadingPhases(buildLoadingPhases(0));

    if (config) {
      setSalesMaterialConfig(config);
    }

    const execution = startExecutionState({
      assignment: requestAssignment,
      maxAttempts: EXECUTION_MAX_RETRIES + 1,
      timeoutMs: EXECUTION_TIMEOUT_MS,
    });
    setExecutionState(execution);

    const timeoutMonitor = startTimeoutMonitor(() => {
      appendExecutionLog(execution.id, {
        level: "error",
        message: "クライアント側タイムアウトを検知しました",
      });
      updateExecutionState(execution.id, {
        phase: "timed_out",
        timedOut: true,
        failureReason: formatFailureReason({ timedOut: true }),
      });
      setFailureReason(formatFailureReason({ timedOut: true }));
      setExecutionState(getExecutionState(execution.id));
      controller.abort();
    });

    try {
      const orchestrationResult = await withExecutionRetry(
        async (attempt) => {
          if (attempt > 1) {
            updateExecutionState(execution.id, {
              phase: "retrying",
              attempt,
            });
            appendExecutionLog(execution.id, {
              level: "warn",
              message: `自動リトライ ${attempt} 回目`,
            });
            setExecutionState(getExecutionState(execution.id));
          }
          return submitWorkRequest(requestAssignment, controller.signal, {
            metadata: {
              ...requestMetadata,
              ...(extraMetadata ?? {}),
              ...(config ? buildSalesMaterialMetadata(config) : {}),
              executionReliabilityId: execution.id,
              executionAttempt: attempt,
            },
          });
        },
        {
          maxAttempts: EXECUTION_MAX_RETRIES + 1,
          delayMs: (attempt) => Math.min(1000 * attempt, 3000),
          shouldRetry: (err) => {
            if (err instanceof CommanderConfirmationRequiredError) return false;
            if (err instanceof Error && err.name === "AbortError") return false;
            if (timeoutMonitor.didTimeout()) return false;
            return true;
          },
        },
      );

      setResult(orchestrationResult);
      setWorkMemoryUsed(orchestrationResult.workMemory ?? null);
      setWorkMemoryCandidateCount(
        orchestrationResult.workMemoryCandidates?.length ?? 0,
      );
      const saved = projectService.saveFromOrchestration(
        requestAssignment,
        orchestrationResult,
        orchestrationResult.commanderRunId
          ? `commander-${orchestrationResult.commanderRunId}`
          : undefined,
      );
      setSavedProjectId(saved.id);

      if (orchestrationResult.status === "failed" && orchestrationResult.error) {
        const reason = formatUserFacingErrorText(
          toUserFacingError(orchestrationResult.error, orchestrationResult),
        );
        setError(reason);
        setFailureReason(reason);
        markExecutionPhase(execution.id, "failed", reason);
        updateExecutionState(execution.id, {
          failureReason: reason,
          projectId: saved.id,
        });
      } else {
        markExecutionPhase(execution.id, "completed", "実行が完了しました");
        updateExecutionState(execution.id, {
          projectId: saved.id,
          notificationGuaranteed: true,
        });
      }
      setExecutionState(getExecutionState(execution.id));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (timeoutMonitor.didTimeout()) {
          const reason = formatFailureReason({ timedOut: true });
          setError(reason);
          setFailureReason(reason);
        }
        return;
      }
      if (err instanceof CommanderConfirmationRequiredError) {
        markExecutionPhase(execution.id, "queued", "確認待ちに移行しました");
        setPendingCommander(err.commander);
        setIsLoading(false);
        abortRef.current = null;
        setExecutionState(getExecutionState(execution.id));
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : formatUserFacingErrorText(toUserFacingError(err));
      const reason = formatFailureReason({ error: message });
      setError(reason);
      setFailureReason(reason);
      markExecutionPhase(execution.id, "failed", reason);
      updateExecutionState(execution.id, { failureReason: reason });
      setExecutionState(getExecutionState(execution.id));
      setLoadingPhases((prev) =>
        prev.map((phase) =>
          phase.status === "running"
            ? { ...phase, status: "error", errorMessage: reason }
            : phase,
        ),
      );
    } finally {
      timeoutMonitor.clear();
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [requestMetadata]);

  // ホーム等から autostart=1 で届いた依頼は、確認クリックなしで開始する。
  useEffect(() => {
    const prefill = searchParams.get("assignment");
    if (
      searchParams.get("autostart") === "1" &&
      prefill?.trim() &&
      !autoStartedRef.current &&
      !isLoading &&
      !result
    ) {
      autoStartedRef.current = true;
      void runOrchestration(prefill.trim(), null, {});
    }
  }, [searchParams, runOrchestration, isLoading, result]);

  const handleConfirmPending = async () => {
    if (!pendingCommander?.runId || isLoading) return;
    const runId = pendingCommander.runId;
    const requestAssignment =
      pendingCommander.plan.assignment || assignment.trim();
    setPendingCommander(null);
    setIsLoading(true);
    setError(null);
    try {
      const orchestrationResult = await confirmWorkRequest(runId, undefined, {
        metadata: requestMetadata,
      });
      setResult(orchestrationResult);
      setWorkMemoryUsed(orchestrationResult.workMemory ?? null);
      setWorkMemoryCandidateCount(
        orchestrationResult.workMemoryCandidates?.length ?? 0,
      );
      projectService.saveFromOrchestration(
        requestAssignment,
        orchestrationResult,
        orchestrationResult.commanderRunId
          ? `commander-${orchestrationResult.commanderRunId}`
          : undefined,
      );
    } catch (err) {
      if (err instanceof CommanderConfirmationRequiredError) {
        setPendingCommander(err.commander);
        return;
      }
      setError(err instanceof Error ? err.message : ui.error.generic);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (payload: WorkRequestSubmitPayload) => {
    const trimmed = payload.assignment.trim();
    if (!trimmed || isLoading) return;

    setRequestMetadata(payload.metadata);

    if (isSalesMaterialRequest(assignment.trim()) || isSalesMaterialRequest(trimmed)) {
      if (!isAvailable("sales_material")) {
        setError(ui.featureFlags.userDisabledSalesMaterial);
        return;
      }
      setSalesWizardAssignment(trimmed);
      setError(null);
      setOutlineOnlyText(null);
      return;
    }

    setSalesWizardAssignment(null);
    setSalesMaterialConfig(null);
    await runOrchestration(trimmed, null, payload.metadata);
  };

  const handleWizardComplete = (wizardResult: SalesMaterialWizardResult) => {
    setSalesWizardAssignment(null);

    if (wizardResult.kind === "text_only") {
      setSalesMaterialConfig(wizardResult.config);
      setOutlineOnlyText(formatOutlineAsDisplayText(wizardResult.outline));
      setResult(null);
      setError(null);
      return;
    }

    void runOrchestration(wizardResult.assignment, wizardResult.config);
  };

  const handleWizardCancel = () => {
    setSalesWizardAssignment(null);
  };

  const handleReset = () => {
    setAssignment("");
    setRequestMetadata({});
    setResult(null);
    setError(null);
    setFailureReason(null);
    setExecutionState(null);
    setSavedProjectId(null);
    setSalesWizardAssignment(null);
    setSalesMaterialConfig(null);
    setOutlineOnlyText(null);
  };

  const showForm =
    !isLoading &&
    !result &&
    !salesWizardAssignment &&
    !outlineOnlyText &&
    !pendingCommander;

  return (
    <div className="space-y-16">
      {showForm && taughtWorkflowHint && (
        <section className="animate-fade-up rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium tracking-wide text-accent">AI秘書</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground sm:text-base">
            前回教えていただいた流れで進めます。
          </p>
        </section>
      )}

      {showForm && (
        <WorkRequestForm
          value={assignment}
          onChange={setAssignment}
          onSubmit={(payload) => void handleSubmit(payload)}
          isLoading={isLoading}
        />
      )}

      {pendingCommander && !isLoading && (
        <Card padding="lg" className="space-y-4 border-amber-400/30 bg-amber-500/10">
          <h2 className="text-lg font-semibold text-foreground">
            {ui.commander.statusAwaiting}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {pendingCommander.report.summary}
          </p>
          {pendingCommander.confirmationReasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-50/90">
              {pendingCommander.confirmationReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void handleConfirmPending()}>
              {ui.commander.confirmExecute}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingCommander(null)}
            >
              {ui.commander.cancelRun}
            </Button>
          </div>
        </Card>
      )}

      {salesWizardAssignment && !isLoading && !result && (
        <SalesMaterialWizard
          assignment={salesWizardAssignment}
          onComplete={handleWizardComplete}
          onCancel={handleWizardCancel}
        />
      )}

      {outlineOnlyText && !isLoading && !result && (
        <section className="space-y-6 animate-fade-in">
          <div>
            <p className="text-sm font-medium text-accent">MINERVOT</p>
            <h2 className="mt-1 text-title text-foreground">
              構成案のみで完了しました
            </h2>
            <p className="mt-2 text-body text-[var(--foreground-muted)]">
              ファイル生成は行っていません。必要になったら形式を選んで再実行できます。
            </p>
          </div>
          <Card padding="lg">
            <div className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-8 text-base leading-relaxed">
              {outlineOnlyText}
            </div>
            <div className="mt-6">
              <Button variant="secondary" onClick={handleReset}>
                新しい依頼を開始
              </Button>
            </div>
          </Card>
        </section>
      )}

      <ExecutionReliabilityNotice
        state={executionState}
        failureReason={failureReason}
      />

      {error && !result && !outlineOnlyText && <ErrorState message={error} />}

      {(isLoading || result) && isLoading && (
        <WorkflowResults
          result={result}
          loadingPhases={loadingPhases}
          isLoading={isLoading}
          error={error}
        />
      )}

      {result && !isLoading && (
        <>
          <WorkspaceCompletionSummary
            assignment={assignment}
            result={result}
            projectId={savedProjectId}
          />

          {workMemoryUsed && workMemoryUsed.used.length > 0 && (
            <WorkMemoryUsedBanner used={workMemoryUsed.used} />
          )}

          {workMemoryCandidateCount > 0 && (
            <WorkMemoryCandidateBanner count={workMemoryCandidateCount} />
          )}

          <WorkTemplatePrompt assignment={assignment} />

          {salesMaterialConfig && !salesMaterialConfig.skipFileGeneration && (
            <p className="text-sm text-[var(--foreground-muted)] animate-fade-in">
              選択された形式で資料を作成しました。
              {salesMaterialConfig.formats.includes("pptx") &&
                !salesMaterialConfig.formats.includes("pdf") &&
                " PDFも必要であれば形式を変更して再実行できます。"}
            </p>
          )}

          <FinalOutput
            result={result}
            isLoading={isLoading}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
            expectedFormats={salesMaterialConfig?.formats}
          />

          <KnowledgeUsedPanel knowledge={result.knowledge} />

          <WorkflowResults
            result={result}
            loadingPhases={loadingPhases}
            isLoading={false}
            error={error}
          />

          <PrReviewPanel
            result={result}
            showGrowthReview={false}
            showCompanyLearning={false}
          />
          <GrowthReviewPanel result={result} />
          <CompanyLearningPanel result={result} />
          <CompanyOperationsPanel result={result} />
          <ActionEnginePanel result={result} />
          <WorkflowInspectorPanel result={result} />

          <div className="pt-2">
            <Button variant="secondary" onClick={handleReset}>
              {ui.secretaryResult.newRequestAgain}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
