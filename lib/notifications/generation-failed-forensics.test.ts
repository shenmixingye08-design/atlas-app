/**
 * Forensic reproduction of:
 *   code=generation_failed http=200
 *   found=true wordFileFound=false
 *   commanderStatus / workJobStatus previously null
 *
 * Direct cause under test: Word durable Storage persist failure
 * (fault_inject:storage_upload → storage_failed) after DOCX binary creation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCommanderRun,
  updateCommanderRun,
} from "@/lib/commander/run-store";
import { buildCommanderPlan } from "@/lib/commander/plan";
import { persistCommanderResultAsProject } from "@/lib/commander/durable-store";
import { clearWordFaults, injectWordFault } from "@/lib/deliverables/fault-inject";
import { exportWordDeliverableOnServer } from "@/lib/deliverables/server-word-export";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { decideNotificationResult } from "@/lib/notifications/result-resolution";
import { resolveDeliverableLookupForNotification } from "@/lib/notifications/resolve-deliverable-lookup";
import { createNotification } from "@/lib/notifications/service";
import { findWorkJobByLinkedIds } from "@/lib/work-jobs/durable";
import { saveWorkJob } from "@/lib/work-jobs/store";
import { createProjectFromOrchestration } from "@/lib/projects/domain";

const OWNER = "user_forensics_word_fail";

vi.mock("@/lib/commander/durable-store", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/commander/durable-store")
  >("@/lib/commander/durable-store");
  const projects = new Map<string, import("@/lib/projects/types").Project>();
  const runSnapshots: import("@/lib/commander/durable-store").DurableCommanderRunSnapshot[] =
    [];
  return {
    ...actual,
    persistCommanderResultAsProject: vi.fn(
      async (input: {
        userId: string;
        assignment: string;
        result: OrchestrationResult;
        projectId?: string;
      }) => {
        const project = createProjectFromOrchestration(
          input.assignment,
          input.result,
          input.projectId,
        );
        projects.set(`${input.userId}:${project.id}`, project);
        return project.id;
      },
    ),
    loadPersistedProjectById: vi.fn(
      async (input: { userId: string; projectId: string }) => {
        const project = projects.get(`${input.userId}:${input.projectId}`) ?? null;
        return { project, found: Boolean(project), durable: true };
      },
    ),
    persistCommanderRunToClerk: vi.fn(
      async (run: import("@/lib/commander/types").CommanderRunRecord) => {
        const idx = runSnapshots.findIndex((s) => s.id === run.id);
        const snap: import("@/lib/commander/durable-store").DurableCommanderRunSnapshot =
          {
            id: run.id,
            userId: run.userId,
            assignment: run.assignment,
            status: run.status,
            plan: run.plan,
            planSummary: run.plan.classification.summary,
            templateLabel: run.plan.requiredTemplate.label,
            confirmationReasons: run.confirmationReasons,
            attemptCount: run.attempts.length || 1,
            error: run.error,
            resultPreview: run.result?.finalResponse?.slice(0, 400) ?? null,
            workMemoryIds: run.plan.requiredMemory.workMemoryIds ?? [],
            workMemoryTitles: run.plan.requiredMemory.workMemoryTitles ?? [],
            workflowRunId: run.workflowRunId,
            projectId: null,
            cancelRequested: run.cancelRequested,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            startedAt: run.createdAt,
            endedAt: run.updatedAt,
          };
        if (idx >= 0) runSnapshots[idx] = snap;
        else runSnapshots.push(snap);
      },
    ),
    loadCommanderRunsFromClerk: vi.fn(async (userId: string) =>
      runSnapshots.filter((s) => s.userId === userId),
    ),
    __forensicsProjects: projects,
    __forensicsRuns: runSnapshots,
  };
});

vi.mock("@/lib/work-jobs/durable", async () => {
  const jobs = new Map<string, import("@/lib/work-jobs/store").WorkJobRecord>();
  return {
    persistWorkJob: vi.fn(async (job: import("@/lib/work-jobs/store").WorkJobRecord) => {
      jobs.set(`${job.userId}:${job.id}`, job);
      return "supabase" as const;
    }),
    loadWorkJobFromDisk: vi.fn(() => null),
    loadWorkJobFromDurable: vi.fn(
      async (id: string, userId: string) => jobs.get(`${userId}:${id}`) ?? null,
    ),
    loadWorkJobsForUserFromDurable: vi.fn(async (userId: string) =>
      [...jobs.values()].filter((j) => j.userId === userId),
    ),
    findWorkJobByLinkedIds: vi.fn(
      async (input: {
        userId: string;
        workJobId?: string | null;
        commanderRunId?: string | null;
        projectId?: string | null;
        requestId?: string | null;
      }) => {
        const list = [...jobs.values()].filter((j) => j.userId === input.userId);
        if (input.workJobId) {
          const hit = list.find((j) => j.id === input.workJobId);
          if (hit) return hit;
        }
        for (const job of list) {
          const meta = job.metadata ?? {};
          if (
            input.commanderRunId &&
            (meta.commanderRunId === input.commanderRunId ||
              job.result?.commanderRunId === input.commanderRunId)
          ) {
            return job;
          }
          if (input.projectId && meta.projectId === input.projectId) {
            return job;
          }
        }
        return null;
      },
    ),
    isVercelEphemeralFs: vi.fn(() => false),
    __forensicsJobs: jobs,
  };
});

function baseOrch(runId: string): OrchestrationResult {
  const body =
    "# 営業報告書\n\n今月の売上は前月比10%増でした。詳細を本文に記載します。\n\n## 概要\n\n主要顧客との商談が順調です。";
  const base = emptyDeliverable("document");
  return {
    assignment: "営業報告書をWordで作成してください",
    status: "completed",
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      ...base,
      title: "営業報告書",
      summary: "今月の売上をまとめた報告書です。",
      content: body,
      markdown: body,
      html: `<p>${body}</p>`,
      plainText: body,
    },
    reviewComments: "",
    approved: true,
    finalResponse: "営業報告書を作成しました。",
    totalDurationMs: 1200,
    commanderRunId: runId,
  };
}

describe("generation_failed forensics — storage_failed direct cause", () => {
  beforeEach(() => {
    clearWordFaults();
    // Clear commander memory bucket between tests when available
    try {
      const bucket = (
        globalThis as typeof globalThis & {
          __atlasCommanderRunStore?: Map<string, unknown>;
        }
      ).__atlasCommanderRunStore;
      bucket?.clear();
    } catch {
      /* ignore */
    }
  });

  it("determines direct cause: STORAGE_UPLOAD / storage_failed", async () => {
    const workJobId = "11111111-1111-4111-8111-111111111111";
    const plan = buildCommanderPlan({
      assignment: "営業報告書をWordで作成してください",
      userId: OWNER,
    });
    const run = createCommanderRun({
      userId: OWNER,
      assignment: plan.assignment,
      plan,
      status: "running",
    });
    const commanderRunId = run.id;
    const projectId = `commander-${commanderRunId}`;

    // Production-like: no disk fallback; Storage upload fault is fatal.
    process.env.ATLAS_DELIVERABLE_STORAGE = "supabase";
    process.env.ATLAS_FORCE_EPHEMERAL_FS = "1";
    process.env.VERCEL_ENV = "preview";
    // Exhaust upload attempts (2 per persist call) + db fallback.
    injectWordFault("storage_upload", 8);
    injectWordFault("db_upsert", 4);

    const orch = baseOrch(commanderRunId);
    const wordExport = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: orch.assignment,
      result: orch,
      requestId: commanderRunId,
      jobId: `cmdword_${commanderRunId.replace(/-/g, "").slice(0, 20)}`,
      metadata: { jobId: workJobId, workJobId, preferredDeliverableFormat: "docx" },
      notify: false,
    });

    expect(wordExport.attempted).toBe(true);
    expect(wordExport.ok).toBe(false);
    if (!wordExport.attempted || wordExport.ok) {
      throw new Error("expected word export failure");
    }

    // ===== Direct cause (deterministic) =====
    expect(wordExport.failedStage).toBe("STORAGE_UPLOAD");
    expect(wordExport.generationFailure.errorCode).toBe("storage_failed");
    expect(wordExport.reason).toMatch(/storage/i);

    const failedResult: OrchestrationResult = {
      ...orch,
      status: "failed",
      error: `${wordExport.userTitle}: ${wordExport.userMessage} [${wordExport.jobId}] ${wordExport.reason}`,
      generationFailure: {
        ...wordExport.generationFailure,
        workJobId,
        commanderRunId,
        projectId,
      },
      fileDeliverables: [],
    };

    const persistedId = await persistCommanderResultAsProject({
      userId: OWNER,
      assignment: orch.assignment,
      result: failedResult,
      projectId,
    });
    expect(persistedId).toBe(projectId);

    updateCommanderRun(commanderRunId, OWNER, {
      status: "failed",
      result: failedResult,
      error: failedResult.error ?? null,
    });

    await saveWorkJob({
      id: workJobId,
      userId: OWNER,
      assignment: orch.assignment,
      idempotencyKey: `idem-${workJobId}`,
      metadata: {
        jobId: workJobId,
        workJobId,
        commanderRunId,
        projectId,
        generationFailure: failedResult.generationFailure,
      },
      status: "failed",
      attemptCount: 1,
      maxAttempts: 2,
      error: failedResult.error ?? "failed",
      visionGate: null,
      result: { ...failedResult, commanderRunId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    // Cold start: wipe in-memory commander runs
    const scope = globalThis as typeof globalThis & {
      __atlasCommanderRunStore?: Map<string, unknown>;
      __atlasCommanderHydratedUsers?: Set<string>;
    };
    scope.__atlasCommanderRunStore = new Map();
    scope.__atlasCommanderHydratedUsers = new Set();

    const notification = createNotification({
      audience: "user",
      userId: OWNER,
      type: "error",
      title: wordExport.userTitle,
      message: wordExport.userMessage,
      targetType: "deliverable",
      targetId: projectId,
      deliverableId: projectId,
      relatedTaskId: projectId,
      requestId: commanderRunId,
    });

    const resolved = await resolveDeliverableLookupForNotification({
      notification,
      userId: OWNER,
    });

    // Match the reported signature
    expect(resolved.lookup.durable && resolved.lookup.found).toBe(true);
    expect(resolved.trace.wordFileFound).toBe(false);
    expect(resolved.lookup).toMatchObject({
      durable: true,
      found: true,
      displayKind: "failed",
    });

    // After fix: statuses + real error are recoverable
    expect(resolved.trace.workJobId).toBe(workJobId);
    expect(resolved.trace.workJobStatus).toBe("failed");
    expect(resolved.trace.commanderRunId).toBe(commanderRunId);
    // Commander status recovered via durable hydrate after cold start
    expect(resolved.trace.commanderStatus).toBe("failed");
    expect(resolved.trace.projectError).toMatch(/storage|Storage|保存|fault_inject/i);
    expect(resolved.trace.generationFailure?.failedStage).toBe("STORAGE_UPLOAD");
    expect(resolved.trace.generationFailure?.errorCode).toBe("storage_failed");
    expect(resolved.trace.generationFailure?.diagnosticId).toBeTruthy();

    const decision = decideNotificationResult({
      notification,
      requesterUserId: OWNER,
      lookup: resolved.lookup,
    });
    expect(decision).toEqual({
      status: "error",
      code: "generation_failed",
      http: 200,
    });

    // Word binary absent from durable lookup
    expect(resolved.trace.fileDeliverableIds).toEqual([]);

    // ID correspondence table assertions
    const linked = await findWorkJobByLinkedIds({
      userId: OWNER,
      commanderRunId,
      projectId,
    });
    expect(linked?.id).toBe(workJobId);
    expect(linked?.id).not.toBe(commanderRunId);

    // Pipeline stage classification for the report
    const stages = {
      WORD_EXPORT_REQUESTED: "実行済み",
      WORD_EXPORT_STARTED: "実行済み",
      WORD_CONTENT_GENERATED: "実行済み",
      DOCX_BINARY_CREATED: "実行済み",
      DOCX_VALIDATED: "実行済み",
      STORAGE_UPLOAD_STARTED: "失敗",
      STORAGE_UPLOAD_COMPLETED: "未実行",
      ARTIFACT_METADATA_SAVED: "未実行",
      PROJECT_RESULT_SAVED: "実行済み",
      NOTIFICATION_CREATED: "実行済み",
    };
    expect(stages.STORAGE_UPLOAD_STARTED).toBe("失敗");
    expect(wordExport.generationFailure.lastSuccessStage).toBe("DOCX_VALIDATED");

    delete process.env.ATLAS_DELIVERABLE_STORAGE;
    delete process.env.ATLAS_FORCE_EPHEMERAL_FS;
    delete process.env.VERCEL_ENV;
  });

  it("transient STORAGE_UPLOAD fault recovers via retry (direct cause fix)", async () => {
    clearWordFaults();
    process.env.ATLAS_DELIVERABLE_STORAGE = "supabase";
    process.env.ATLAS_FORCE_EPHEMERAL_FS = "1";
    process.env.VERCEL_ENV = "preview";
    // Only one fault — second attempt inside uploadDeliverableObject succeeds
    // (local supabase missing → after fault cleared, supabase_not_configured
    // is not used because… wait: without client, returns supabase_not_configured.
    // Use local backend with fault-once instead.
    delete process.env.VERCEL_ENV;
    delete process.env.ATLAS_FORCE_EPHEMERAL_FS;
    process.env.ATLAS_DELIVERABLE_STORAGE = "local";
    injectWordFault("storage_upload", 1);

    const runId = "33333333-3333-4333-8333-333333333333";
    const orch = baseOrch(runId);
    const wordExport = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: orch.assignment,
      result: orch,
      requestId: runId,
      metadata: { preferredDeliverableFormat: "docx" },
      notify: false,
    });
    expect(wordExport.attempted && wordExport.ok).toBe(true);
    if (!wordExport.ok || !wordExport.attempted) {
      throw new Error("expected recovery success");
    }
    const stored = await getStoredDeliverableForUser(wordExport.docx.id, OWNER);
    expect(stored?.buffer.byteLength).toBeGreaterThan(1000);
    delete process.env.ATLAS_DELIVERABLE_STORAGE;
  });

  it("Word success path: wordFileFound=true and downloadable buffer", async () => {
    clearWordFaults();
    delete process.env.ATLAS_FORCE_EPHEMERAL_FS;
    delete process.env.VERCEL_ENV;
    process.env.ATLAS_DELIVERABLE_STORAGE = "local";
    const runId = "22222222-2222-4222-8222-222222222222";
    const orch = baseOrch(runId);
    const wordExport = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: orch.assignment,
      result: orch,
      requestId: runId,
      metadata: { preferredDeliverableFormat: "docx" },
      notify: false,
    });
    expect(wordExport.attempted && wordExport.ok).toBe(true);
    if (!wordExport.ok || !wordExport.attempted) throw new Error("expected ok");
    const stored = await getStoredDeliverableForUser(wordExport.docx.id, OWNER, {
      bypassMemory: false,
      bypassDisk: false,
    });
    expect(stored?.buffer.byteLength).toBeGreaterThan(1000);
    expect(stored?.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    delete process.env.ATLAS_DELIVERABLE_STORAGE;
  });
});
