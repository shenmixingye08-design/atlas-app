"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { projectService } from "@/lib/projects/project-service";
import {
  LOADING_STEP_INTERVAL_MS,
  buildLoadingPhases,
  createInitialPhases,
} from "@/lib/workspace/constants";
import { submitWorkRequest } from "@/lib/workspace/orchestrate-client";
import { isSalesMaterialRequest } from "@/lib/workspace/sales-material/detect";
import { buildSalesMaterialMetadata } from "@/lib/workspace/sales-material/metadata";
import type { SalesMaterialSessionConfig } from "@/lib/workspace/sales-material/types";
import { useFeatureAvailability } from "@/lib/feature-flags";
import { useDeliverableFiles } from "@/lib/workspace/use-deliverable-files";
import type { WorkflowPhaseState } from "@/lib/workspace/types";
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
import { WorkRequestForm } from "./work-request-form";
import {
  WorkMemoryCandidateBanner,
  WorkMemoryUsedBanner,
} from "./work-memory-used-banner";
import { WorkflowResults } from "./workflow-results";
import {
  SalesMaterialWizard,
  formatOutlineAsDisplayText,
  formatsForWizardConfig,
  type SalesMaterialWizardResult,
} from "./sales-material-wizard";

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
  const [skipWorkMemory, setSkipWorkMemory] = useState(false);
  const [workMemoryUsed, setWorkMemoryUsed] = useState<
    OrchestrationResult["workMemory"] | null
  >(null);
  const [workMemoryCandidateCount, setWorkMemoryCandidateCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
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

  const runOrchestration = async (
    requestAssignment: string,
    config?: SalesMaterialSessionConfig | null,
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setResult(null);
    setOutlineOnlyText(null);
    setWorkMemoryUsed(null);
    setWorkMemoryCandidateCount(0);
    setIsLoading(true);
    setLoadingStepIndex(0);
    setLoadingPhases(buildLoadingPhases(0));

    if (config) {
      setSalesMaterialConfig(config);
    }

    try {
      const orchestrationResult = await submitWorkRequest(
        requestAssignment,
        controller.signal,
        {
          metadata: {
            ...(config ? buildSalesMaterialMetadata(config) : {}),
            ...(skipWorkMemory ? { skipWorkMemory: true } : {}),
          },
        },
      );

      setResult(orchestrationResult);
      setWorkMemoryUsed(orchestrationResult.workMemory ?? null);
      setWorkMemoryCandidateCount(
        orchestrationResult.workMemoryCandidates?.length ?? 0,
      );
      projectService.saveFromOrchestration(requestAssignment, orchestrationResult);

      if (orchestrationResult.status === "failed" && orchestrationResult.error) {
        setError(
          formatUserFacingErrorText(
            toUserFacingError(orchestrationResult.error, orchestrationResult),
          ),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message =
        err instanceof Error
          ? err.message
          : formatUserFacingErrorText(toUserFacingError(err));
      setError(message);
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

  const handleSubmit = async () => {
    const trimmed = assignment.trim();
    if (!trimmed || isLoading) return;

    if (isSalesMaterialRequest(trimmed)) {
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
    await runOrchestration(trimmed);
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
    setResult(null);
    setError(null);
    setSalesWizardAssignment(null);
    setSalesMaterialConfig(null);
    setOutlineOnlyText(null);
  };

  const showForm =
    !isLoading && !result && !salesWizardAssignment && !outlineOnlyText;

  return (
    <div className="space-y-16">
      {showForm && (
        <header className="space-y-3">
          <h1 className="text-display text-foreground">{ui.work.title}</h1>
          <p className="text-body">{ui.work.intro}</p>
        </header>
      )}

      {showForm && (
        <WorkRequestForm
          value={assignment}
          onChange={setAssignment}
          onSubmit={() => void handleSubmit()}
          isLoading={isLoading}
          skipWorkMemory={skipWorkMemory}
          onSkipWorkMemoryChange={setSkipWorkMemory}
        />
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
            <p className="text-sm font-medium text-accent">ATLAS</p>
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
          {workMemoryUsed && workMemoryUsed.used.length > 0 && (
            <WorkMemoryUsedBanner used={workMemoryUsed.used} />
          )}

          {workMemoryCandidateCount > 0 && (
            <WorkMemoryCandidateBanner count={workMemoryCandidateCount} />
          )}

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
