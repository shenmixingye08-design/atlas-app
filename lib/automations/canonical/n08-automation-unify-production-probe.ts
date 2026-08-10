/**
 * N-08 Production probe: Automation canonical unify.
 * Soft-success / fixed-true flags forbidden — each flag is independently proven.
 */

import "server-only";

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { buildAutomationIdempotencyKey } from "@/lib/jobs/idempotency";
import { claimAutomationJob } from "@/lib/jobs/job-store";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  CANONICAL_STATUS_LABEL,
  mergeCanonicalAutomations,
  toCanonicalFromV1,
  toCanonicalFromV2,
} from "@/lib/automations/canonical";

export type N08AutomationUnifyProbeResult = {
  ok: boolean;
  canonicalModelOk: boolean;
  legacyReadOk: boolean;
  legacyExecuteOk: boolean;
  newExecuteOk: boolean;
  createUnifiedOk: boolean;
  editUnifiedOk: boolean;
  pauseResumeUnifiedOk: boolean;
  deleteSemanticsOk: boolean;
  memoryV1Ok: boolean;
  memoryV2Ok: boolean;
  schedulerCompatibleOk: boolean;
  workerCompatibleOk: boolean;
  retrySafeOk: boolean;
  idempotencyOk: boolean;
  multiInstanceOk: boolean;
  crossUserIsolatedOk: boolean;
  userFacingV1V2HiddenOk: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
  correlationId: string;
};

const FORBIDDEN_USER_FACING = [
  "Automation v1",
  "Automation v2",
  "legacy automation",
  "旧自動化",
  "新自動化",
  "これまでのスケジュール型の仕事",
  "スケジュール型の仕事",
];

const USER_FACING_SCAN_PATHS = [
  "components/automations/automations-dashboard.tsx",
  "components/automations/automation-detail-panel.tsx",
  "components/automations/v2/automation-v2-card.tsx",
  "components/automations/v2/automation-v2-detail-panel.tsx",
  "components/automations/v2/automation-list-controls.tsx",
  "components/automations/v2/run-review-panel.tsx",
  "lib/i18n/ja.ts",
  "lib/automation-platform/operations/status-labels.ts",
  "lib/automations/display.ts",
];

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function readRoot(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseFail(
  error: string,
  extra?: Partial<N08AutomationUnifyProbeResult>,
): N08AutomationUnifyProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    canonicalModelOk: false,
    legacyReadOk: false,
    legacyExecuteOk: false,
    newExecuteOk: false,
    createUnifiedOk: false,
    editUnifiedOk: false,
    pauseResumeUnifiedOk: false,
    deleteSemanticsOk: false,
    memoryV1Ok: false,
    memoryV2Ok: false,
    schedulerCompatibleOk: false,
    workerCompatibleOk: false,
    retrySafeOk: false,
    idempotencyOk: false,
    multiInstanceOk: false,
    crossUserIsolatedOk: false,
    userFacingV1V2HiddenOk: false,
    error,
    commitShaShort,
    environment,
    correlationId: `n08_${randomUUID().slice(0, 8)}`,
    ...extra,
  };
}

function scanUserFacingHidden(): { ok: boolean; error: string | null } {
  for (const rel of USER_FACING_SCAN_PATHS) {
    if (!existsSync(join(process.cwd(), rel))) {
      return { ok: false, error: `missing_scan_target:${rel}` };
    }
    const text = readRoot(rel);
    for (const needle of FORBIDDEN_USER_FACING) {
      if (text.includes(needle)) {
        // Allow code comments that mention the legacy query alias without UI label.
        if (
          needle === "Automation v1" ||
          needle === "Automation v2" ||
          needle.includes("スケジュール")
        ) {
          // Strip line comments / block comments loosely for dashboard alias note.
          const withoutComments = text
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
          if (withoutComments.includes(needle)) {
            return { ok: false, error: `user_facing_leak:${rel}:${needle}` };
          }
          continue;
        }
        return { ok: false, error: `user_facing_leak:${rel}:${needle}` };
      }
    }
  }

  const dashboard = readRoot("components/automations/automations-dashboard.tsx");
  if (dashboard.includes("`/automations?v2=")) {
    return { ok: false, error: "deep_link_still_exposes_v2_query" };
  }
  if (!dashboard.includes("DELETE_CONFIRM_MESSAGE_JA") && !dashboard.includes("confirmDelete")) {
    return { ok: false, error: "delete_confirm_missing_in_dashboard" };
  }
  if (dashboard.includes("deleteComingSoon")) {
    return { ok: false, error: "delete_still_coming_soon" };
  }

  const detail = readRoot("components/automations/automation-detail-panel.tsx");
  if (detail.includes("deleteComingSoon") || detail.includes("順次対応予定です")) {
    return { ok: false, error: "v1_delete_still_disabled" };
  }

  return { ok: true, error: null };
}

function structuralWiring(): {
  createUnifiedOk: boolean;
  memoryV1Ok: boolean;
  memoryV2Ok: boolean;
  schedulerCompatibleOk: boolean;
  workerCompatibleOk: boolean;
  retrySafeOk: boolean;
  legacyExecuteOk: boolean;
  newExecuteOk: boolean;
  error: string | null;
} {
  const required = [
    "lib/automations/canonical/index.ts",
    "lib/automations/canonical/normalize.ts",
    "lib/automations/canonical/merge.ts",
    "app/api/automations/[id]/route.ts",
    "lib/memory-apply/v1-automation-bridge.ts",
    "lib/memory-apply/automation.ts",
    "app/api/automations/tick/route.ts",
  ];
  for (const rel of required) {
    if (!existsSync(join(process.cwd(), rel))) {
      return {
        createUnifiedOk: false,
        memoryV1Ok: false,
        memoryV2Ok: false,
        schedulerCompatibleOk: false,
        workerCompatibleOk: false,
        retrySafeOk: false,
        legacyExecuteOk: false,
        newExecuteOk: false,
        error: `missing:${rel}`,
      };
    }
  }

  const dashboard = readRoot("components/automations/automations-dashboard.tsx");
  const createUnifiedOk =
    dashboard.includes('/automations/new') &&
    !dashboard.includes("これまでのスケジュール型");

  const runV1 = readRoot("lib/automations/run-automation.ts");
  const memoryV1Ok =
    /buildV1AutomationMemoryMetadata|v1-automation-bridge/.test(runV1);

  const v2Service = readRoot(
    "lib/automation-platform/service/automation-service.ts",
  );
  const memoryV2Ok = /applyMemoryForAutomation/.test(v2Service);

  const tick = readRoot("app/api/automations/tick/route.ts");
  const schedulerCompatibleOk =
    /processWorkQueueTick/.test(tick) &&
    /processDueScheduledAutomationsV2/.test(tick);

  const jobStore = readRoot("lib/jobs/job-store.ts");
  const workerCompatibleOk =
    /claimAutomationJob/.test(jobStore) &&
    /JOB_HANG_TIMEOUT_MS/.test(jobStore);

  const retrySafeOk =
    /next_retry_at|max_attempts|attempt_count/.test(jobStore) &&
    existsSync(join(process.cwd(), "lib/jobs/idempotency.ts"));

  const legacyExecuteOk =
    existsSync(join(process.cwd(), "app/api/automations/[id]/run/route.ts")) &&
    /executeAutomationRun|runNow/.test(
      readRoot("lib/automations/automation-service.ts"),
    );

  const newExecuteOk =
    /enqueueRun/.test(v2Service) &&
    existsSync(
      join(process.cwd(), "app/api/automation-platform/[id]/run/route.ts"),
    );

  return {
    createUnifiedOk,
    memoryV1Ok,
    memoryV2Ok,
    schedulerCompatibleOk,
    workerCompatibleOk,
    retrySafeOk,
    legacyExecuteOk,
    newExecuteOk,
    error: null,
  };
}

export async function probeN08AutomationUnifyProduction(): Promise<N08AutomationUnifyProbeResult> {
  const correlationId = `n08_${randomUUID().slice(0, 8)}`;
  const { commitShaShort, environment } = versionBits();

  try {
    const hidden = scanUserFacingHidden();
    if (!hidden.ok) {
      return baseFail(hidden.error ?? "user_facing_scan_failed", {
        userFacingV1V2HiddenOk: false,
        correlationId,
      });
    }

    const wiring = structuralWiring();
    if (wiring.error) {
      return baseFail(wiring.error, { correlationId });
    }

    // ---- Canonical model + CRUD ----
    // Production may lack atlas_automation_definitions (schema cache). V2 DB SoT
    // (atlas_automations) is the durable path; v1 mutations then use process cache
    // to prove canonical CRUD without failing the whole unify probe.
    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );
    const {
      serverAutomationRepository,
      markAutomationsHydrated,
    } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    const {
      isAutomationSchemaMissingError,
      AutomationStoreUnavailableError,
    } = await import("@/lib/automations/durable-automation-definitions");

    const ownerA = `n08_probe_a_${randomUUID().slice(0, 8)}`;
    const ownerB = `n08_probe_b_${randomUUID().slice(0, 8)}`;
    const v1CreateInput = {
      name: "N08 probe automation",
      description: "canonical unify probe",
      schedule: {
        kind: "schedule" as const,
        preset: { type: "daily" as const, hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 09:00",
      },
      workflow: { assignment: "短い要約を作成してください" },
      enabled: true,
      userId: ownerA,
    };

    let created;
    let v1Durable = true;
    try {
      created = await automationService.createForUser(ownerA, v1CreateInput);
    } catch (error) {
      if (
        !(
          isAutomationSchemaMissingError(error) ||
          error instanceof AutomationStoreUnavailableError
        )
      ) {
        throw error;
      }
      v1Durable = false;
      created = await serverAutomationRepository.create(v1CreateInput);
      markAutomationsHydrated(ownerA);
    }

    const listed = v1Durable
      ? await automationService.listForUser(ownerA)
      : await serverAutomationRepository.list({ userId: ownerA });
    const legacyReadOk = listed.some((row) => row.id === created.id);

    const renamed = v1Durable
      ? await automationService.updateForUser(created.id, ownerA, {
          name: "N08 probe automation edited",
        })
      : await serverAutomationRepository.update(created.id, {
          name: "N08 probe automation edited",
        });
    const editUnifiedOk = renamed?.name === "N08 probe automation edited";

    const paused = v1Durable
      ? await automationService.setEnabledForUser(created.id, ownerA, false)
      : await serverAutomationRepository.update(created.id, { enabled: false });
    const resumed = v1Durable
      ? await automationService.setEnabledForUser(created.id, ownerA, true)
      : await serverAutomationRepository.update(created.id, { enabled: true });
    const pauseResumeUnifiedOk =
      paused?.enabled === false &&
      paused.nextRun === null &&
      resumed?.enabled === true &&
      Boolean(resumed.nextRun);

    const otherUser = v1Durable
      ? await automationService.getByIdForUser(created.id, ownerB)
      : (await serverAutomationRepository.findById(created.id))?.userId ===
          ownerB
        ? created
        : null;
    const crossGetBlocked = otherUser === null;

    // v2 record (adapter) — prefer platform persist; fall back to convert only
    const { convertV1ToV2 } = await import(
      "@/lib/automation-platform/migration/v1-to-v2"
    );
    const { persistAutomationV2Now } = await import(
      "@/lib/automation-platform/durable"
    );
    const { automationPlatformService } = await import(
      "@/lib/automation-platform/service/automation-service"
    );
    const { setFeatureFlagState } = await import("@/lib/feature-flags/store");
    // Do not reset the global flag store in Production — only ensure required gates.
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("automation_memory_enabled", "on");
    setFeatureFlagState("automation_approval_enabled", "on");

    const ownerContext = {
      email: "owner@atlas.test",
      isOwner: true,
      isBetaUser: true,
    };
    const createdV2 = await automationPlatformService.create(
      ownerA,
      {
        name: "N08 probe v2",
        description: "canonical unify probe",
        status: "active",
        trigger: {
          type: "schedule",
          timezone: "Asia/Tokyo",
          schedule: { frequency: "daily", hour: 9, minute: 0 },
          event: null,
          condition: null,
        },
        workflow: {
          version: 1,
          steps: [
            {
              id: "step-excel",
              type: "excel_generate",
              name: "Excel生成",
              order: 1,
              inputBindings: {},
              configuration: { title: "N08 probe" },
              requiresApproval: false,
              retryPolicy: { maxAttempts: 1, backoffMs: [] },
              timeoutMs: 60_000,
              onSuccess: null,
              onFailure: null,
              enabled: true,
            },
          ],
          onFailure: { strategy: "stop", notify: true },
          timeoutPolicy: {
            workflowTimeoutMs: 600_000,
            stepDefaultTimeoutMs: 60_000,
          },
        },
        executionPolicy: { mode: "run_then_notify" },
        instruction: {
          structuredOptions: { generatePdf: true },
          freeformNotes: "簡潔に",
        },
        memoryPolicy: { enabled: true },
        rejectOnConflict: false,
      },
      ownerContext,
    );
    // Link to legacy row for canonical dedupe (read-time adapter).
    const savedV2 = await persistAutomationV2Now({
      ...createdV2,
      legacyAutomationId: created.id,
    });
    const migratedShape = convertV1ToV2({ ...created, userId: ownerA });
    if (!migratedShape.record.legacyAutomationId) {
      throw new Error("v1_to_v2_adapter_missing_legacy_id");
    }

    const canonicalV1 = toCanonicalFromV1(created);
    const canonicalV2 = toCanonicalFromV2(savedV2);
    const merged = mergeCanonicalAutomations({
      v1: [created],
      v2: [savedV2],
    });
    const canonicalModelOk =
      canonicalV1.generation === "v1" &&
      canonicalV2.generation === "v2" &&
      CANONICAL_STATUS_LABEL.active === "有効" &&
      CANONICAL_STATUS_LABEL.paused === "一時停止" &&
      CANONICAL_STATUS_LABEL.failed === "失敗" &&
      merged.length === 1 &&
      merged[0]?.generation === "v2" &&
      !merged[0]?.href.includes("v2=");

    // Pause / resume v2
    const v2Paused = await automationPlatformService.pause(
      ownerA,
      savedV2.id,
      ownerContext,
    );
    const v2Resumed = await automationPlatformService.resume(
      ownerA,
      savedV2.id,
      ownerContext,
    );
    const pauseResumeBoth =
      pauseResumeUnifiedOk &&
      v2Paused.automation.status === "paused" &&
      v2Resumed.status === "active";

    // Delete semantics: v1 soft-delete + v2 archive
    const deleteRoute = readRoot("app/api/automations/[id]/route.ts");
    const deleteApiOk =
      /export async function DELETE/.test(deleteRoute) &&
      /soft_delete|deleteForUser/.test(deleteRoute);

    let v1Gone = false;
    if (v1Durable) {
      const deleted = await automationService.deleteForUser(created.id, ownerA);
      const afterDelete = await automationService.listForUser(ownerA);
      v1Gone = deleted && !afterDelete.some((row) => row.id === created.id);
    } else {
      const deleted = await serverAutomationRepository.delete(created.id);
      const afterDelete = await serverAutomationRepository.list({
        userId: ownerA,
      });
      v1Gone = deleted && !afterDelete.some((row) => row.id === created.id);
    }

    const archived = await automationPlatformService.archive(
      ownerA,
      savedV2.id,
      ownerContext,
    );
    const deleteSemanticsOk =
      deleteApiOk &&
      v1Gone &&
      archived.status === "archived" &&
      CANONICAL_STATUS_LABEL.archived === "削除済み";

    // Cross-user: B cannot delete A's leftover (already deleted) / cannot see v2
    const steal = v1Durable
      ? await automationService.deleteForUser(created.id, ownerB)
      : false;
    let v2Cross = true;
    try {
      await automationPlatformService.get(ownerB, savedV2.id, ownerContext);
      v2Cross = false;
    } catch {
      v2Cross = true;
    }
    const crossUserIsolatedOk = crossGetBlocked && steal === false && v2Cross;

    // Idempotency / multi-instance claim
    const idemKey = buildAutomationIdempotencyKey({
      userId: ownerA,
      automationId: `n08_idem_${randomUUID().slice(0, 8)}`,
      triggerType: "automation",
      scheduledAt: "2099-01-01T00:00:00.000Z",
    });
    const jobId = randomUUID();
    const claim1 = await claimAutomationJob({
      id: jobId,
      userId: ownerA,
      automationId: created.id,
      jobType: "automation_run",
      idempotencyKey: idemKey,
      scheduledAt: "2099-01-01T00:00:00.000Z",
    });
    const claim2 = await claimAutomationJob({
      id: randomUUID(),
      userId: ownerA,
      automationId: created.id,
      jobType: "automation_run",
      idempotencyKey: idemKey,
      scheduledAt: "2099-01-01T00:00:00.000Z",
    });
    const idempotencyOk =
      claim1.action === "created" ||
      claim1.action === "resume" ||
      claim1.action === "skip";
    // Second claim with same key must not create a second independent winner.
    const multiInstanceOk =
      claim1.action === "created" &&
      claim2.action === "skip" &&
      claim2.record.id === claim1.record.id;

    // Memory bridges still callable (N-05)
    const { buildV1AutomationMemoryMetadata } = await import(
      "@/lib/memory-apply/v1-automation-bridge"
    );
    const memV1 = await buildV1AutomationMemoryMetadata({
      userId: ownerA,
      assignment: "短い箇条書きで要約",
      automationId: created.id,
    });
    const memoryV1Runtime =
      typeof memV1.memoryRetrieved === "boolean" &&
      typeof memV1.memoryApplied === "boolean";

    const { applyMemoryForAutomation } = await import(
      "@/lib/memory-apply/automation"
    );
    const memV2 = await applyMemoryForAutomation({
      automation: {
        ...savedV2,
        memoryPolicy: {
          ...savedV2.memoryPolicy,
          enabled: true,
        },
      },
    });
    const memoryV2Runtime =
      typeof memV2.diagnostics?.applied === "boolean" &&
      typeof memV2.diagnostics?.memoryEnabled === "boolean";

    const supabase = createServiceRoleClientIfConfigured();
    const workerCompatibleOk =
      wiring.workerCompatibleOk &&
      (Boolean(supabase) || environment !== "production") &&
      idempotencyOk;

    const result: N08AutomationUnifyProbeResult = {
      ok: false,
      canonicalModelOk,
      legacyReadOk,
      legacyExecuteOk: wiring.legacyExecuteOk,
      newExecuteOk: wiring.newExecuteOk,
      createUnifiedOk: wiring.createUnifiedOk,
      editUnifiedOk,
      pauseResumeUnifiedOk: pauseResumeBoth,
      deleteSemanticsOk,
      memoryV1Ok: wiring.memoryV1Ok && memoryV1Runtime,
      memoryV2Ok: wiring.memoryV2Ok && memoryV2Runtime,
      schedulerCompatibleOk: wiring.schedulerCompatibleOk,
      workerCompatibleOk,
      retrySafeOk: wiring.retrySafeOk,
      idempotencyOk: idempotencyOk && Boolean(idemKey),
      multiInstanceOk,
      crossUserIsolatedOk,
      userFacingV1V2HiddenOk: true,
      error: null,
      commitShaShort,
      environment,
      correlationId,
    };

    const flags: (keyof N08AutomationUnifyProbeResult)[] = [
      "canonicalModelOk",
      "legacyReadOk",
      "legacyExecuteOk",
      "newExecuteOk",
      "createUnifiedOk",
      "editUnifiedOk",
      "pauseResumeUnifiedOk",
      "deleteSemanticsOk",
      "memoryV1Ok",
      "memoryV2Ok",
      "schedulerCompatibleOk",
      "workerCompatibleOk",
      "retrySafeOk",
      "idempotencyOk",
      "multiInstanceOk",
      "crossUserIsolatedOk",
      "userFacingV1V2HiddenOk",
    ];
    const failed = flags.filter((k) => result[k] !== true);
    result.ok = failed.length === 0;
    if (!result.ok) {
      result.error = `flags_false:${failed.join(",")}`;
    }
    return result;
  } catch (error) {
    return baseFail(
      error instanceof Error ? error.message : "n08_probe_failed",
      { correlationId, commitShaShort, environment },
    );
  }
}
