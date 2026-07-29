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
import { WordJobStatusPanel } from "@/components/deliverables/word-job-status-panel";
import { WordProgressStatus } from "@/components/deliverables/word-progress-status";
import { downloadDeliverableFile } from "@/lib/deliverables/download-client";
import {
  clearWordJobSession,
  mapWorkJobStatusToWordUiPhase,
  readWordJobSession,
  sanitizeWordFailureDetail,
  writeWordJobSession,
  type WordJobUiPhase,
} from "@/lib/deliverables/word-job-ui-state";

import { FinalOutput } from "./final-output";
import {
  WorkRequestForm,
  type WorkRequestSubmitPayload,
} from "./work-request-form";
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
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [wordUiPhase, setWordUiPhase] = useState<WordJobUiPhase | null>(null);
  const [wordErrorDetail, setWordErrorDetail] = useState<string | null>(null);
  const [wordActionBusy, setWordActionBusy] = useState(false);

  const autoStartedRef = useRef(false);
  const submittingRef = useRef(false);
  const pollAbortRef = useRef(0);
  const sessionRestoredRef = useRef(false);
  const lastWordAssignmentRef = useRef("");
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

  const wordDeliverable =
    deliverables.find((item) => item.format === "docx") ??
    result?.fileDeliverables?.find((item) => item.format === "docx") ??
    null;

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

  const updateWordPhase = useCallback(
    (
      phase: WordJobUiPhase | null,
      opts?: {
        jobId?: string | null;
        assignment?: string;
        errorDetail?: string | null;
      },
    ) => {
      setWordUiPhase(phase);
      if (phase == null) {
        clearWordJobSession();
        return;
      }
      const nextAssignment =
        opts?.assignment?.trim() ||
        lastWordAssignmentRef.current ||
        assignment;
      if (nextAssignment) {
        lastWordAssignmentRef.current = nextAssignment;
      }
      const jobId = opts?.jobId ?? activeJobId;
      // Persist even without jobId for failed accept — back/reload keeps the panel.
      writeWordJobSession({
        jobId: jobId || `local-failed`,
        assignment: nextAssignment,
        phase,
        updatedAt: new Date().toISOString(),
        errorDetail: opts?.errorDetail ?? null,
      });
    },
    [activeJobId, assignment],
  );

  const pollWorkJobUntilSettled = useCallback(
    async (
      jobId: string,
      requestAssignment: string,
      wantsWord: boolean,
    ): Promise<void> => {
      const pollToken = ++pollAbortRef.current;
      for (let i = 0; i < 240; i += 1) {
        if (pollToken !== pollAbortRef.current) return;
        await new Promise((r) => setTimeout(r, i === 0 ? 400 : 2_000));
        if (pollToken !== pollAbortRef.current) return;

        let poll: Response;
        try {
          poll = await fetch(`/api/work/jobs/${encodeURIComponent(jobId)}`, {
            cache: "no-store",
          });
        } catch {
          if (wantsWord) {
            setWordErrorDetail(null);
            updateWordPhase("network_error", { jobId, assignment: requestAssignment });
            setIsLoading(false);
            setBackgroundAccepted(false);
            return;
          }
          throw new Error("最新状態を取得できませんでした。");
        }

        const body = (await poll.json().catch(() => ({}))) as {
          status?: string;
          blockReason?: string | null;
          result?: OrchestrationResult | null;
          error?: string;
          message?: string;
        };

        if (!poll.ok) {
          if (wantsWord) {
            setWordErrorDetail(null);
            updateWordPhase("network_error", { jobId, assignment: requestAssignment });
            setIsLoading(false);
            setBackgroundAccepted(false);
            return;
          }
          throw new Error(body.error || "最新状態を取得できませんでした。");
        }

        const phase = mapWorkJobStatusToWordUiPhase({
          status: body.status,
          blockReason: body.blockReason,
        });
        if (wantsWord && phase && phase !== "completed") {
          updateWordPhase(phase, { jobId, assignment: requestAssignment });
        }

        const needsConfirmation =
          body.status === "awaiting_confirmation" ||
          (body.status === "processing" &&
            body.blockReason === "awaiting_confirmation");
        if (needsConfirmation) {
          setIsLoading(false);
          setBackgroundAccepted(false);
          updateWordPhase(null);
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
          if (wantsWord) {
            updateWordPhase("completed", {
              jobId,
              assignment: requestAssignment,
            });
          }
          if (body.result.status === "failed" && body.result.error) {
            const detail = sanitizeWordFailureDetail(
              formatUserFacingErrorText(
                toUserFacingError(body.result.error, body.result),
              ),
            );
            setWordErrorDetail(detail);
            if (wantsWord) {
              updateWordPhase("failed", {
                jobId,
                assignment: requestAssignment,
                errorDetail: detail,
              });
            } else {
              setError(detail);
            }
          }
          return;
        }

        if (
          body.status === "failed" ||
          body.status === "timed_out" ||
          body.status === "cancelled"
        ) {
          const detail = sanitizeWordFailureDetail(
            body.error || body.message || "処理を完了できませんでした。",
          );
          setWordErrorDetail(detail);
          if (wantsWord) {
            updateWordPhase(
              body.status === "timed_out" ? "timed_out" : "failed",
              {
                jobId,
                assignment: requestAssignment,
                errorDetail: detail,
              },
            );
            return;
          }
          throw new Error(detail ?? "確認が必要です。");
        }
      }

      const timeoutDetail = sanitizeWordFailureDetail(
        "処理時間を超えたため停止しました。",
      );
      setWordErrorDetail(timeoutDetail);
      if (wantsWord) {
        updateWordPhase("timed_out", {
          jobId,
          assignment: requestAssignment,
          errorDetail: timeoutDetail,
        });
        return;
      }
      throw new Error(timeoutDetail ?? "確認が必要です。");
    },
    [updateWordPhase],
  );

  const runOrchestration = useCallback(async (
    requestAssignment: string,
    config?: SalesMaterialSessionConfig | null,
    extraMetadata?: Readonly<Record<string, unknown>>,
  ) => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    setError(null);
    setResult(null);
    setOutlineOnlyText(null);
    setWorkMemoryUsed(null);
    setWorkMemoryCandidateCount(0);
    setPendingCommander(null);
    setWordErrorDetail(null);
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

    const wantsWord =
      mergedMetadata.preferredDeliverableFormat === "docx" ||
      detectDeliverableFormats(requestAssignment).formats.includes("docx");

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

      const jobId = acceptBody.jobId;
      setActiveJobId(jobId);
      setBackgroundAccepted(true);
      if (wantsWord) {
        updateWordPhase("accepted", {
          jobId,
          assignment: requestAssignment,
        });
      }

      await pollWorkJobUntilSettled(jobId, requestAssignment, wantsWord);
    } catch (err) {
      if (err instanceof CommanderConfirmationRequiredError) {
        setPendingCommander(err.commander);
        setIsLoading(false);
        setBackgroundAccepted(false);
        updateWordPhase(null);
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : formatUserFacingErrorText(toUserFacingError(err));
      if (wantsWord) {
        setWordErrorDetail(sanitizeWordFailureDetail(message));
        updateWordPhase("failed", {
          assignment: requestAssignment,
          errorDetail: sanitizeWordFailureDetail(message),
        });
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
      setBackgroundAccepted(false);
      submittingRef.current = false;
    }
  }, [pollWorkJobUntilSettled, updateWordPhase]);

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
    if (!trimmed || isLoading || submittingRef.current) return;

    requestMetadataRef.current = payload.metadata;
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

    const documentBlock =
      documents.length > 0
        ? [
            "",
            "【添付ファイルの抽出テキスト】",
            ...documents.map((doc, index) =>
              [
                `--- ファイル${index + 1}: ${doc.fileName} (${doc.mimeType}) ---`,
                doc.extractedText,
              ].join("\n"),
            ),
          ].join("\n")
        : "";

    const metadata: Record<string, unknown> = {
      requestUi: "secretary_zero_friction_v1",
      executionPreference: "once",
      priority: "normal",
      skipWorkMemory: false,
      requireVisionSuccess: attachmentIds.length > 0,
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      ...(documents.length > 0
        ? {
            documentExtracts: documents.map((doc) => ({
              id: doc.id,
              fileName: doc.fileName,
              mimeType: doc.mimeType,
              bytes: doc.bytes,
              pageOrSheetCount: doc.pageOrSheetCount,
            })),
          }
        : {}),
    };
    requestMetadataRef.current = metadata;
    setRequestMetadata(metadata);

    if (isSalesMaterialRequest(prefill) && isAvailable("sales_material")) {
      const timer = window.setTimeout(() => {
        setSalesWizardAssignment(prefill);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void runOrchestration(`${prefill}${documentBlock}`, null, metadata);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, isAvailable, isLoading, result, runOrchestration]);

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
    pollAbortRef.current += 1;
    submittingRef.current = false;
    setAssignment("");
    requestMetadataRef.current = {};
    setRequestMetadata({});
    setResult(null);
    setError(null);
    setSalesWizardAssignment(null);
    setSalesMaterialConfig(null);
    setOutlineOnlyText(null);
    setActiveJobId(null);
    setWordUiPhase(null);
    setWordErrorDetail(null);
    setWordActionBusy(false);
    lastWordAssignmentRef.current = "";
    clearWordJobSession();
  };

  const isResumableWordJobId = (jobId: string | null | undefined) =>
    Boolean(jobId && !jobId.startsWith("local-"));

  // Restore Word job panel after back / reload — do not lose in-flight state.
  useEffect(() => {
    if (sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    const session = readWordJobSession();
    if (!session?.phase) return;

    setWordUiPhase(session.phase);
    setWordErrorDetail(session.errorDetail ?? null);
    if (session.assignment) {
      lastWordAssignmentRef.current = session.assignment;
      setAssignment(session.assignment);
    }
    if (isResumableWordJobId(session.jobId)) {
      setActiveJobId(session.jobId);
    }

    if (session.phase === "completed" && isResumableWordJobId(session.jobId)) {
      void (async () => {
        try {
          const poll = await fetch(
            `/api/work/jobs/${encodeURIComponent(session.jobId)}`,
            { cache: "no-store" },
          );
          const body = (await poll.json().catch(() => ({}))) as {
            result?: OrchestrationResult | null;
            status?: string;
          };
          if (body.result) {
            setResult(body.result);
          }
          if (body.status && body.status !== "completed") {
            const mapped = mapWorkJobStatusToWordUiPhase({
              status: body.status,
            });
            if (mapped) {
              updateWordPhase(mapped, {
                jobId: session.jobId,
                assignment: session.assignment,
              });
            }
          }
        } catch {
          updateWordPhase("network_error", {
            jobId: session.jobId,
            assignment: session.assignment,
          });
        }
      })();
      return;
    }

    if (
      (session.phase === "accepted" || session.phase === "processing") &&
      isResumableWordJobId(session.jobId)
    ) {
      setIsLoading(true);
      setBackgroundAccepted(true);
      void (async () => {
        try {
          await pollWorkJobUntilSettled(
            session.jobId,
            session.assignment,
            true,
          );
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "最新状態を取得できませんでした。";
          setWordErrorDetail(sanitizeWordFailureDetail(message));
          updateWordPhase("network_error", {
            jobId: session.jobId,
            assignment: session.assignment,
          });
        } finally {
          setIsLoading(false);
          setBackgroundAccepted(false);
        }
      })();
    }
  }, [pollWorkJobUntilSettled, updateWordPhase]);

  const handleWordOpen = useCallback(() => {
    const el = document.getElementById("word-preview");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: true });
      return;
    }
    // Preview not mounted yet — soft hint without technical jargon.
    setWordErrorDetail(null);
  }, []);

  const handleWordDownload = useCallback(async () => {
    if (!wordDeliverable || wordActionBusy || wordUiPhase !== "completed") {
      return;
    }
    setWordActionBusy(true);
    try {
      await downloadDeliverableFile({
        url: wordDeliverable.downloadUrl,
        fileName: wordDeliverable.fileName,
        mimeType: wordDeliverable.mimeType,
        format: wordDeliverable.format,
      });
    } catch (downloadError) {
      setWordErrorDetail(
        sanitizeWordFailureDetail(
          downloadError instanceof Error
            ? downloadError.message
            : ui.work.downloadFailed,
        ),
      );
    } finally {
      setWordActionBusy(false);
    }
  }, [wordActionBusy, wordDeliverable, wordUiPhase]);

  const handleWordRetry = useCallback(async () => {
    if (submittingRef.current || wordActionBusy || isLoading) return;
    const nextAssignment =
      lastWordAssignmentRef.current.trim() || assignment.trim();
    if (!nextAssignment) return;
    pollAbortRef.current += 1;
    setResult(null);
    setError(null);
    await runOrchestration(nextAssignment, salesMaterialConfig, {
      ...requestMetadataRef.current,
      preferredDeliverableFormat: "docx",
    });
  }, [
    assignment,
    isLoading,
    runOrchestration,
    salesMaterialConfig,
    wordActionBusy,
  ]);

  const handleWordDetail = useCallback(() => {
    window.location.assign("/notifications");
  }, []);

  const handleWordReload = useCallback(async () => {
    if (wordActionBusy) return;
    const session = readWordJobSession();
    const jobId = activeJobId ?? session?.jobId ?? null;
    const nextAssignment =
      session?.assignment ||
      lastWordAssignmentRef.current ||
      assignment.trim();
    if (!isResumableWordJobId(jobId)) {
      window.location.reload();
      return;
    }
    setWordActionBusy(true);
    setIsLoading(true);
    setBackgroundAccepted(true);
    setWordErrorDetail(null);
    updateWordPhase("processing", {
      jobId,
      assignment: nextAssignment,
    });
    try {
      await pollWorkJobUntilSettled(jobId!, nextAssignment, true);
    } catch {
      updateWordPhase("network_error", {
        jobId,
        assignment: nextAssignment,
      });
    } finally {
      setIsLoading(false);
      setBackgroundAccepted(false);
      setWordActionBusy(false);
    }
  }, [
    activeJobId,
    assignment,
    pollWorkJobUntilSettled,
    updateWordPhase,
    wordActionBusy,
  ]);

  const showWordPanel = wordUiPhase != null;
  const showForm =
    !showWordPanel &&
    !isLoading &&
    !result &&
    !salesWizardAssignment &&
    !outlineOnlyText &&
    !pendingCommander;

  const wordPrimaryHandler =
    wordUiPhase === "completed"
      ? handleWordOpen
      : wordUiPhase === "failed" || wordUiPhase === "timed_out"
        ? () => void handleWordRetry()
        : wordUiPhase === "network_error"
          ? () => void handleWordReload()
          : undefined;

  const wordSecondaryHandler =
    wordUiPhase === "completed" && wordDeliverable
      ? () => void handleWordDownload()
      : wordUiPhase === "failed"
        ? handleWordDetail
        : undefined;

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
          isLoading={isLoading || submittingRef.current}
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

      {showWordPanel && wordUiPhase ? (
        <WordJobStatusPanel
          phase={wordUiPhase}
          detail={
            wordErrorDetail ??
            (wordUiPhase === "failed" || wordUiPhase === "timed_out"
              ? sanitizeWordFailureDetail(null)
              : null)
          }
          busy={
            wordActionBusy ||
            (isLoading &&
              (wordUiPhase === "accepted" || wordUiPhase === "processing"))
          }
          onPrimary={wordPrimaryHandler}
          onSecondary={wordSecondaryHandler}
        />
      ) : null}

      {error && !result && !outlineOnlyText && !showWordPanel ? (
        <ErrorState message={error} />
      ) : null}

      {isLoading && backgroundAccepted && !showWordPanel ? (
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
      ) : null}

      {isLoading && !backgroundAccepted && !showWordPanel ? (
        <WorkflowResults
          result={result}
          loadingPhases={loadingPhases}
          isLoading={isLoading}
          error={error}
        />
      ) : null}

      {result && !isLoading && (
        <section className="space-y-6 animate-fade-up">
          {!showWordPanel ? (
            <header className="space-y-2 text-center">
              <p className="text-sm font-medium text-accent">MINERVOT</p>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                すべて完了しました
              </h2>
              <p className="text-sm text-[var(--foreground-muted)] sm:text-base">
                成果物をご確認ください。必要ならすぐ別の形式でもお渡しできます。
              </p>
            </header>
          ) : null}

          <FinalOutput
            result={result}
            isLoading={isLoading}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
            expectedFormats={salesMaterialConfig?.formats}
          />

          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[48px]"
              onClick={handleReset}
            >
              別のお願いをする
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
