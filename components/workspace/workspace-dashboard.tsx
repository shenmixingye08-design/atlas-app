"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { useActiveWorkProgress } from "@/lib/work-progress/use-active-work-progress";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";
import { WorkProgressTracker } from "@/components/work-progress/work-progress-tracker";
import { WorkExecutionLog } from "@/components/work-progress/work-execution-log";
import { WorkFailurePanel } from "@/components/work-progress/work-failure-panel";

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

export function WorkspaceDashboard() {
  const searchParams = useSearchParams();
  const prefillAssignment = searchParams.get("assignment")?.trim() ?? "";
  const taughtWorkflowHint = searchParams.get("taught") === "1";

  const [assignment, setAssignment] = useState(prefillAssignment);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhases, setLoadingPhases] =
    useState<WorkflowPhaseState[]>(createInitialPhases);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setLoadingStepIndex] = useState(0);
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
  const [pendingCommander, setPendingCommander] =
    useState<CommanderRunResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);
  const progress = useActiveWorkProgress();
  const { isAvailable } = useFeatureAvailability();
  const deliverableOptions = salesMaterialConfig
    ? {
        formats: formatsForWizardConfig(salesMaterialConfig),
        skipFileGeneration: salesMaterialConfig.skipFileGeneration,
      }
    : undefined;
  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(result, deliverableOptions);

  const formAssignment = assignment || prefillAssignment;

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => {
        const next = Math.min(prev + 1, loadingPhases.length - 1);
        setLoadingPhases(buildLoadingPhases(next));
        return next;
      });
    }, LOADING_STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLoading, loadingPhases.length]);

  const runOrchestration = async (
    requestAssignment: string,
    config?: SalesMaterialSessionConfig | null,
    extraMetadata?: Readonly<Record<string, unknown>>,
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setResult(null);
    setOutlineOnlyText(null);
    setWorkMemoryUsed(null);
    setWorkMemoryCandidateCount(0);
    setPendingCommander(null);
    setIsLoading(true);
    setLoadingStepIndex(0);
    setLoadingPhases(buildLoadingPhases(0));
    progress.start(requestAssignment);

    if (config) {
      setSalesMaterialConfig(config);
    }

    try {
      const orchestrationResult = await submitWorkRequest(
        requestAssignment,
        controller.signal,
        {
          metadata: {
            ...requestMetadata,
            ...(extraMetadata ?? {}),
            ...(config ? buildSalesMaterialMetadata(config) : {}),
          },
        },
      );

      setResult(orchestrationResult);
      setWorkMemoryUsed(orchestrationResult.workMemory ?? null);
      setWorkMemoryCandidateCount(
        orchestrationResult.workMemoryCandidates?.length ?? 0,
      );
      const project = projectService.saveFromOrchestration(
        requestAssignment,
        orchestrationResult,
        orchestrationResult.commanderRunId
          ? `commander-${orchestrationResult.commanderRunId}`
          : undefined,
      );

      if (orchestrationResult.commanderRunId) {
        progress.attachRunId(orchestrationResult.commanderRunId);
      }
      progress.markCompleted(
        orchestrationResult.commanderRunId ?? null,
        project.id,
      );

      if (orchestrationResult.status === "failed" && orchestrationResult.error) {
        const message = formatUserFacingErrorText(
          toUserFacingError(orchestrationResult.error, orchestrationResult),
        );
        setError(message);
        progress.markFailed(message);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (err instanceof CommanderConfirmationRequiredError) {
        setPendingCommander(err.commander);
        if (err.commander.runId) progress.attachRunId(err.commander.runId);
        setIsLoading(false);
        abortRef.current = null;
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : formatUserFacingErrorText(toUserFacingError(err));
      setError(message);
      progress.markFailed(message);
      setLoadingPhases((prev) =>
        prev.map((phase) =>
          phase.status === "running"
            ? { ...phase, status: "error", errorMessage: message }
            : phase,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleConfirmPending = async () => {
    if (!pendingCommander?.runId || isLoading) return;
    const runId = pendingCommander.runId;
    const requestAssignment =
      pendingCommander.plan.assignment || assignment.trim();
    setPendingCommander(null);
    setIsLoading(true);
    setError(null);
    progress.start(requestAssignment);
    progress.attachRunId(runId);
    try {
      const orchestrationResult = await confirmWorkRequest(runId, undefined, {
        metadata: requestMetadata,
      });
      setResult(orchestrationResult);
      setWorkMemoryUsed(orchestrationResult.workMemory ?? null);
      setWorkMemoryCandidateCount(
        orchestrationResult.workMemoryCandidates?.length ?? 0,
      );
      const project = projectService.saveFromOrchestration(
        requestAssignment,
        orchestrationResult,
        orchestrationResult.commanderRunId
          ? `commander-${orchestrationResult.commanderRunId}`
          : undefined,
      );
      progress.markCompleted(
        orchestrationResult.commanderRunId ?? null,
        project.id,
      );
    } catch (err) {
      if (err instanceof CommanderConfirmationRequiredError) {
        setPendingCommander(err.commander);
        return;
      }
      const message = err instanceof Error ? err.message : ui.error.generic;
      setError(message);
      progress.markFailed(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (payload: WorkRequestSubmitPayload) => {
    const trimmed = payload.assignment.trim();
    if (!trimmed || isLoading) return;

    setRequestMetadata(payload.metadata);

    if (isSalesMaterialRequest(formAssignment.trim()) || isSalesMaterialRequest(trimmed)) {
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

  // ホーム等から「すぐ実行」で届いた依頼は、確認クリックなしで開始する。
  useEffect(() => {
    const prefill = searchParams.get("assignment");
    if (
      searchParams.get("autostart") !== "1" ||
      !prefill?.trim() ||
      autoStartedRef.current ||
      isLoading ||
      result
    ) {
      return;
    }

    autoStartedRef.current = true;
    const metadata = {
      requestUi: "secretary_v1",
      executionPreference: "once",
      priority: "normal",
      skipWorkMemory: false,
    } as const;

    // Defer state updates out of the synchronous effect body.
    queueMicrotask(() => {
      setRequestMetadata(metadata);
      if (isSalesMaterialRequest(prefill) && isAvailable("sales_material")) {
        setSalesWizardAssignment(prefill);
        return;
      }
      void runOrchestration(prefill, null, metadata);
    });
    // One-shot landing behavior; avoid re-running when handlers recreate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAvailable, isLoading, result]);

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
    setSalesWizardAssignment(null);
    setSalesMaterialConfig(null);
    setOutlineOnlyText(null);
    progress.clear();
  };

  const handleRetry = () => {
    const request =
      progress.session?.assignment?.trim() || assignment.trim();
    if (!request) return;
    setError(null);
    void runOrchestration(request, salesMaterialConfig, requestMetadata);
  };

  const showProgress =
    isLoading ||
    Boolean(progress.session && progress.session.status !== "completed");

  const showForm =
    !isLoading &&
    !result &&
    !salesWizardAssignment &&
    !outlineOnlyText &&
    !pendingCommander &&
    !showProgress;

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
          value={formAssignment}
          onChange={setAssignment}
          onSubmit={(payload) => void handleSubmit(payload)}
          isLoading={isLoading}
        />
      )}

      {progress.isRestored && progress.session && !result ? (
        <Card padding="md" className="border-accent/20 bg-accent/5">
          <p className="text-sm text-foreground">{ui.workProgress.restoredBanner}</p>
        </Card>
      ) : null}

      {showProgress && progress.session ? (
        <div className="space-y-6 animate-fade-in">
          <WorkProgressTracker
            stages={progress.stages}
            etaLabel={progress.etaLabel}
            assignment={progress.session.assignment}
          />
          <WorkExecutionLog logs={progress.logs} />
          <div className="flex flex-wrap gap-3">
            <Link
              href="/work-progress"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {ui.workProgress.logHeading}
            </Link>
          </div>
        </div>
      ) : null}

      {progress.failure && !isLoading ? (
        <WorkFailurePanel
          failure={progress.failure}
          onRetry={handleRetry}
          isRetrying={isLoading}
        />
      ) : null}

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

      {error && !result && !outlineOnlyText && !progress.failure && (
        <ErrorState message={error} />
      )}

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
        </>
      )}
    </div>
  );
}
