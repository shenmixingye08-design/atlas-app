"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { getDeliverableExportText } from "@/lib/orchestration/final-deliverable";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { projectService } from "@/lib/projects/project-service";
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
import {
  patchClientProgressSession,
  startClientProgressSession,
  useUserFacingProgressPoll,
} from "@/lib/workspace/user-progress/client";
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
import { UserFacingProgress } from "./user-facing-progress";
import {
  SalesMaterialWizard,
  formatOutlineAsDisplayText,
  formatsForWizardConfig,
  type SalesMaterialWizardResult,
} from "./sales-material-wizard";

export function WorkspaceDashboard() {
  const [assignment, setAssignment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressSessionId, setProgressSessionId] = useState<string | null>(
    null,
  );
  const [progressUiComplete, setProgressUiComplete] = useState(false);
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
  const skipFileGeneration = Boolean(salesMaterialConfig?.skipFileGeneration);
  const exportPreview = result?.deliverable
    ? getDeliverableExportText(result.deliverable).trim()
    : "";
  const willGenerateFiles =
    Boolean(result) &&
    !skipFileGeneration &&
    exportPreview.length > 0 &&
    result?.status !== "failed";
  const filesSettled =
    !willGenerateFiles ||
    deliverables.length > 0 ||
    Boolean(deliverablesError);
  const shouldPollProgress =
    Boolean(progressSessionId) &&
    !progressUiComplete &&
    (isLoading || isGeneratingDeliverables || Boolean(result));

  const progressSnapshot = useUserFacingProgressPoll(
    progressSessionId,
    shouldPollProgress,
  );

  const showUserProgress =
    Boolean(progressSessionId) &&
    !progressUiComplete &&
    (isLoading ||
      isGeneratingDeliverables ||
      (Boolean(result) && !filesSettled));

  useEffect(() => {
    const prefill = searchParams.get("assignment");
    if (prefill?.trim()) {
      setAssignment(prefill);
    }
    setTaughtWorkflowHint(searchParams.get("taught") === "1");
  }, [searchParams]);

  // Sync file-generation phase from real deliverable API state (no dummy timer).
  useEffect(() => {
    if (!progressSessionId || isLoading || progressUiComplete) return;

    if (result?.status === "failed") {
      void patchClientProgressSession({
        sessionId: progressSessionId,
        action: "failed",
      }).finally(() => setProgressUiComplete(true));
      return;
    }

    if (!result) return;

    if (isGeneratingDeliverables) {
      void patchClientProgressSession({
        sessionId: progressSessionId,
        action: "file_generating",
      });
      return;
    }

    // Wait until file generation has either finished or been skipped —
    // never complete during the gap before useDeliverableFiles starts.
    if (willGenerateFiles && !filesSettled) return;

    void patchClientProgressSession({
      sessionId: progressSessionId,
      action: "file_done",
    }).finally(() => setProgressUiComplete(true));
  }, [
    progressSessionId,
    isGeneratingDeliverables,
    result,
    isLoading,
    willGenerateFiles,
    filesSettled,
    progressUiComplete,
  ]);

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
    setProgressUiComplete(false);

    const sessionId = crypto.randomUUID();
    setProgressSessionId(sessionId);
    const mergedMetadata = {
      ...requestMetadata,
      ...(extraMetadata ?? {}),
      ...(config ? buildSalesMaterialMetadata(config) : {}),
      progressSessionId: sessionId,
    };
    void startClientProgressSession({
      sessionId,
      assignment: requestAssignment,
      metadata: mergedMetadata,
    });

    if (config) {
      setSalesMaterialConfig(config);
    }

    try {
      const orchestrationResult = await submitWorkRequest(
        requestAssignment,
        controller.signal,
        {
          metadata: mergedMetadata,
        },
      );

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

      if (orchestrationResult.status === "failed" && orchestrationResult.error) {
        setError(
          formatUserFacingErrorText(
            toUserFacingError(orchestrationResult.error, orchestrationResult),
          ),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (err instanceof CommanderConfirmationRequiredError) {
        setPendingCommander(err.commander);
        setIsLoading(false);
        abortRef.current = null;
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : formatUserFacingErrorText(toUserFacingError(err));
      setError(message);
      if (sessionId) {
        void patchClientProgressSession({
          sessionId,
          action: "failed",
        });
      }
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
    setProgressUiComplete(false);
    const sessionId = crypto.randomUUID();
    setProgressSessionId(sessionId);
    const confirmMetadata = {
      ...requestMetadata,
      progressSessionId: sessionId,
    };
    void startClientProgressSession({
      sessionId,
      assignment: requestAssignment,
      metadata: confirmMetadata,
    });
    try {
      const orchestrationResult = await confirmWorkRequest(runId, undefined, {
        metadata: confirmMetadata,
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
    setRequestMetadata(metadata);

    if (isSalesMaterialRequest(prefill) && isAvailable("sales_material")) {
      setSalesWizardAssignment(prefill);
      return;
    }

    void runOrchestration(prefill, null, metadata);
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
    setProgressSessionId(null);
    setProgressUiComplete(false);
    setSalesWizardAssignment(null);
    setSalesMaterialConfig(null);
    setOutlineOnlyText(null);
  };

  const showForm =
    !isLoading &&
    !result &&
    !showUserProgress &&
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

      {error && !result && !outlineOnlyText && !showUserProgress && (
        <ErrorState message={error} />
      )}

      {showUserProgress && (
        <UserFacingProgress snapshot={progressSnapshot} />
      )}

      {result && !isLoading && !showUserProgress && (
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
