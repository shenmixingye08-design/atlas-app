"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { detectDeliverableFormats } from "@/lib/deliverables/detect-formats";
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
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";
import { consumePendingAttachmentIds } from "@/lib/attachments/pending-session";
import type { DocumentExtractClient } from "@/lib/attachments/documents/client-upload";
import { WordProgressStatus } from "@/components/deliverables/word-progress-status";
import { VisionFailurePanel } from "@/components/vision/vision-failure-panel";
import { VisionDiagnosticsPanel } from "@/components/vision/vision-diagnostics-panel";
import type { CommanderVisionGate } from "@/lib/commander/types";
import {
  buildWorkRequestSubmitPayload,
  consumePendingWorkRequestSubmit,
  type WorkRequestSubmitPayload,
} from "@/lib/workspace/work-request-payload";

import { FinalOutput } from "./final-output";
import { WorkRequestForm } from "./work-request-form";
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
  const [visionGate, setVisionGate] = useState<CommanderVisionGate | null>(null);
  const [showVisionDiagnostics, setShowVisionDiagnostics] = useState(false);
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
  const [, setWorkMemoryUsed] = useState<
    OrchestrationResult["workMemory"] | null
  >(null);
  const [, setWorkMemoryCandidateCount] = useState(0);
  const [taughtWorkflowHint, setTaughtWorkflowHint] = useState(false);
  const [backgroundAccepted, setBackgroundAccepted] = useState(false);
  const [pendingCommander, setPendingCommander] =
    useState<CommanderRunResult | null>(null);

  const autoStartedRef = useRef(false);
  const requestMetadataRef = useRef<Readonly<Record<string, unknown>>>({});
  const { isAvailable } = useFeatureAvailability();
  const preferredFormat = requestMetadata.preferredDeliverableFormat;
  const preferredFormats =
    preferredFormat === "xlsx" ||
    preferredFormat === "docx" ||
    preferredFormat === "pdf" ||
    preferredFormat === "txt"
      ? ([preferredFormat] as Array<"xlsx" | "docx" | "pdf" | "txt">)
      : undefined;

  const deliverableOptions = salesMaterialConfig
    ? {
        formats: formatsForWizardConfig(salesMaterialConfig),
        skipFileGeneration: salesMaterialConfig.skipFileGeneration,
      }
    : preferredFormats
      ? { formats: preferredFormats }
      : undefined;
  const likelyFormats = detectDeliverableFormats(assignment).formats;
  const showWordProgress =
    deliverableOptions?.formats?.includes("docx") ?? likelyFormats.includes("docx");
  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(result, deliverableOptions);

  const searchParams = useSearchParams();

  useEffect(() => {
    const prefill = searchParams.get("assignment");
    const timer = window.setTimeout(() => {
      if (prefill?.trim()) {
        setAssignment(prefill);
      }
      setTaughtWorkflowHint(searchParams.get("taught") === "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading) {
      const resetTimer = window.setTimeout(() => {
        setBackgroundAccepted(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    const acceptedTimer = window.setTimeout(() => {
      setBackgroundAccepted(true);
    }, 3_000);
    const interval = setInterval(() => {
      setLoadingStepIndex((prev) =>
        Math.min(prev + 1, loadingPhases.length - 1),
      );
    }, LOADING_STEP_INTERVAL_MS);
    return () => {
      window.clearTimeout(acceptedTimer);
      clearInterval(interval);
    };
  }, [isLoading, loadingPhases.length]);

  useEffect(() => {
    if (isLoading) {
      const timer = window.setTimeout(() => {
        setLoadingPhases(buildLoadingPhases(loadingStepIndex));
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loadingStepIndex, isLoading]);

  const runOrchestration = useCallback(async (
    requestAssignment: string,
    config?: SalesMaterialSessionConfig | null,
    extraMetadata?: Readonly<Record<string, unknown>>,
  ) => {
    setError(null);
    setVisionGate(null);
    setShowVisionDiagnostics(false);
    setResult(null);
    setOutlineOnlyText(null);
    setWorkMemoryUsed(null);
    setWorkMemoryCandidateCount(0);
    setPendingCommander(null);
    setIsLoading(true);
    setBackgroundAccepted(false);
    setLoadingStepIndex(0);
    setLoadingPhases(buildLoadingPhases(0));

    if (config) {
      setSalesMaterialConfig(config);
    }

    const mergedMetadata = {
      ...requestMetadataRef.current,
      ...(extraMetadata ?? {}),
      ...(config ? buildSalesMaterialMetadata(config) : {}),
    };
    requestMetadataRef.current = mergedMetadata;
    setRequestMetadata(mergedMetadata);

    try {
      // Server job — browser does not hold the long orchestration connection.
      const accept = await fetch("/api/work/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: requestAssignment,
          metadata: mergedMetadata,
          // Prevent double-submit of the same request (job runs once).
          idempotencyKey:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        }),
      });
      const acceptBody = (await accept.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        message?: string;
      };
      if (!accept.ok || !acceptBody.jobId) {
        throw new Error(
          acceptBody.error ||
            acceptBody.message ||
            "依頼を受け付けられませんでした。",
        );
      }

      setBackgroundAccepted(true);
      const jobId = acceptBody.jobId;

      // Poll until completed / failed / confirmation.
      for (let i = 0; i < 240; i += 1) {
        await new Promise((r) => setTimeout(r, 2_000));
        const poll = await fetch(`/api/work/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        const body = (await poll.json().catch(() => ({}))) as {
          status?: string;
          result?: OrchestrationResult | null;
          error?: string;
          message?: string;
          visionGate?: CommanderVisionGate | null;
        };
        if (!poll.ok) {
          throw new Error(body.error || "状況を確認できませんでした。");
        }
        if (body.status === "awaiting_confirmation") {
          // Fall back to interactive confirm via classic path when needed.
          setIsLoading(false);
          setBackgroundAccepted(false);
          const orchestrationResult = await submitWorkRequest(
            requestAssignment,
            undefined,
            { metadata: requestMetadataRef.current },
          );
          setResult(orchestrationResult);
          projectService.saveFromOrchestration(
            requestAssignment,
            orchestrationResult,
            orchestrationResult.commanderRunId
              ? `commander-${orchestrationResult.commanderRunId}`
              : undefined,
          );
          return;
        }
        if (body.status === "completed" && body.result) {
          setResult(body.result);
          setWorkMemoryUsed(body.result.workMemory ?? null);
          projectService.saveFromOrchestration(
            requestAssignment,
            body.result,
            body.result.commanderRunId
              ? `commander-${body.result.commanderRunId}`
              : undefined,
          );
          if (body.result.status === "failed" && body.result.error) {
            setError(
              formatUserFacingErrorText(
                toUserFacingError(body.result.error, body.result),
              ),
            );
          }
          return;
        }
        if (body.status === "failed" || body.status === "needs_reanalysis") {
          if (body.visionGate) {
            setVisionGate(body.visionGate);
            setError(body.visionGate.message);
            return;
          }
          throw new Error(body.error || body.message || "確認が必要です。");
        }
      }
      throw new Error(
        "まだ準備中です。しばらくしてから履歴をご確認ください。",
      );
    } catch (err) {
      if (err instanceof CommanderConfirmationRequiredError) {
        setPendingCommander(err.commander);
        setIsLoading(false);
        setBackgroundAccepted(false);
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : formatUserFacingErrorText(toUserFacingError(err));
      setError(message);
    } finally {
      setIsLoading(false);
      setBackgroundAccepted(false);
    }
  }, []);

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
        metadata: requestMetadataRef.current,
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

    requestMetadataRef.current = payload.metadata;
    setRequestMetadata(payload.metadata);
    setAssignment(trimmed);

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

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  // Home → /workspace?autostart=1: consume the SAME WorkRequestSubmitPayload
  // built by buildWorkRequestSubmitPayload (no home-specific metadata).
  useEffect(() => {
    if (searchParams.get("autostart") !== "1") return;
    if (autoStartedRef.current || isLoading || result) return;

    const pending = consumePendingWorkRequestSubmit();
    if (pending) {
      autoStartedRef.current = true;
      void handleSubmitRef.current(pending);
      return;
    }

    // Legacy deep-link support: ?assignment=...&autostart=1
    // Still routed through the shared builder + handleSubmit (not a second path).
    const prefill = searchParams.get("assignment")?.trim();
    if (!prefill) return;

    autoStartedRef.current = true;
    const attachmentIds = consumePendingAttachmentIds();
    let documents: DocumentExtractClient[] = [];
    try {
      const raw = sessionStorage.getItem("atlas.pendingDocumentExtracts");
      sessionStorage.removeItem("atlas.pendingDocumentExtracts");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          documents = parsed.filter(
            (item): item is DocumentExtractClient =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as DocumentExtractClient).extractedText === "string",
          );
        }
      }
    } catch {
      documents = [];
    }

    const payload = buildWorkRequestSubmitPayload({
      assignment: prefill,
      attachmentIds,
      documents,
      preferredFormat: "auto",
    });
    void handleSubmitRef.current(payload);
  }, [searchParams, isLoading, result]);

  const handleWizardComplete = (wizardResult: SalesMaterialWizardResult) => {
    setSalesWizardAssignment(null);

    if (wizardResult.kind === "text_only") {
      setSalesMaterialConfig(wizardResult.config);
      setOutlineOnlyText(formatOutlineAsDisplayText(wizardResult.outline));
      setResult(null);
      setError(null);
      return;
    }

    // Preserve attachmentIds collected before the sales wizard (ref merge alone
    // is easy to lose if config metadata overwrites unexpectedly).
    const priorIds = Array.isArray(requestMetadataRef.current.attachmentIds)
      ? requestMetadataRef.current.attachmentIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    void runOrchestration(wizardResult.assignment, wizardResult.config, {
      ...(priorIds.length > 0 ? { attachmentIds: priorIds } : {}),
    });
  };

  const handleWizardCancel = () => {
    setSalesWizardAssignment(null);
  };

  const handleReset = () => {
    setAssignment("");
    requestMetadataRef.current = {};
    setRequestMetadata({});
    setResult(null);
    setError(null);
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
          <p className="text-xs font-medium tracking-wide text-accent">MINERVOT</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground sm:text-base">
            以前お伺いした進め方で、そのまま取りかかります。
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
        <Card padding="lg" className="space-y-4 border-accent/20 bg-accent/5">
          <h2 className="text-lg font-semibold text-foreground">
            確認が必要です
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            このまま進めてよいか、ご確認ください。
          </p>
          {pendingCommander.confirmationReasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
              {pendingCommander.confirmationReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void handleConfirmPending()}>
              このまま進める
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingCommander(null)}
            >
              やめる
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

      {visionGate && !result && !outlineOnlyText && (
        <div className="mx-auto max-w-lg space-y-3">
          <VisionFailurePanel
            gate={visionGate}
            showDeveloperHint={Boolean(visionGate.diagnosticId)}
            onRetryAnalyze={() => {
              // Re-analyze: new job, force refresh, re-normalize / fallback path.
              void runOrchestration(assignment.trim(), null, {
                forceVisionRefresh: true,
                visionRetry: true,
                visionRetryAt: new Date().toISOString(),
              });
            }}
            onPickAnother={() => {
              setVisionGate(null);
              setError(null);
            }}
          />
          <VisionDiagnosticsPanel
            diagnosticId={visionGate.diagnosticId}
            enabled={showVisionDiagnostics}
            showToggle={Boolean(visionGate.diagnosticId)}
            onToggle={() => setShowVisionDiagnostics((v) => !v)}
          />
        </div>
      )}

      {error && !visionGate && !result && !outlineOnlyText && (
        <ErrorState message={error} />
      )}

      {isLoading && backgroundAccepted && (
        <section className="mx-auto max-w-lg space-y-4 py-16 text-center animate-fade-in">
          <p className="text-sm font-medium text-accent">MINERVOT</p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            依頼を受け付けました
          </h2>
          <p className="text-base text-[var(--foreground-muted)]">
            バックグラウンドで処理しています。完了次第、成果物をお渡しします。
          </p>
          {showWordProgress ? (
            <WordProgressStatus className="animate-soft-pulse text-sm text-[var(--foreground-muted)]" />
          ) : null}
        </section>
      )}

      {isLoading && !backgroundAccepted && (
        <WorkflowResults
          result={result}
          loadingPhases={loadingPhases}
          isLoading={isLoading}
          error={error}
        />
      )}

      {result && !isLoading && (
        <section className="space-y-6 animate-fade-up">
          <header className="space-y-2 text-center">
            <p className="text-sm font-medium text-accent">MINERVOT</p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              すべて完了しました
            </h2>
            <p className="text-sm text-[var(--foreground-muted)] sm:text-base">
              成果物をご確認ください。必要ならすぐ別の形式でもお渡しできます。
            </p>
          </header>

          <FinalOutput
            result={result}
            isLoading={isLoading}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
            expectedFormats={salesMaterialConfig?.formats}
          />

          <div className="flex justify-center pt-2">
            <Button type="button" variant="secondary" onClick={handleReset}>
              別のお願いをする
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
