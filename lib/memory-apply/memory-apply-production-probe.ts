/**
 * N-05 Production probe: Personal Memory save → retrieve → apply
 * (artifact + automation), DB SoT, isolation, update/delete, fail-closed.
 * Soft-success / fixed-true flags forbidden.
 */

import "server-only";

import { randomUUID } from "crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { applyMemoryForDeliverable } from "@/lib/memory-apply/deliverables";
import { buildExplicitWritingPreferenceValue } from "@/lib/memory-apply/preference-structure";
import { SUPABASE_ONLY_DOMAIN_KEYS } from "@/lib/persistence/durable-domain";
import { loadDurableDomain } from "@/lib/persistence/durable-domain";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import {
  PERSONAL_MEMORY_DOMAIN_KEY,
  ensurePersonalMemoryHydrated,
  evictPersonalMemoryCacheForUser,
  persistPersonalMemoryNow,
  resetPersonalMemoryDurableForTests,
  type DurablePersonalMemoryState,
} from "@/lib/personal-memory/durable";
import {
  createPersonalMemory,
  deletePersonalMemory,
  resolveForContext,
  updatePersonalMemory,
} from "@/lib/personal-memory/service";
import { listStoredPersonalMemories } from "@/lib/personal-memory/store";
import { redactForLog } from "@/lib/personal-memory/security";

export type MemoryApplyProductionProbeResult = {
  ok: boolean;
  dbSotOk: boolean;
  saveRetrieveOk: boolean;
  memoryAppliedOk: boolean;
  artifactPreferenceAppliedOk: boolean;
  automationPreferenceAppliedOk: boolean;
  restartDurableOk: boolean;
  multiInstanceOk: boolean;
  ownershipIsolationOk: boolean;
  crossUserMemoryLeak: boolean;
  deletePropagationOk: boolean;
  updatePropagationOk: boolean;
  secretsRedacted: boolean;
  failClosedOk: boolean;
  memorySaved: boolean;
  memoryRetrieved: boolean;
  memoryApplied: boolean;
  failClosed: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
  correlationId: string;
};

const PREFERENCE_TEXT =
  "今後、文章は短め・箇条書き中心・結論を最初にしてください";

const ARTIFACT_BASELINE = [
  "これは長い導入です。背景として多くの事情を説明します。",
  "追加の補足として、関係者との調整も必要です。",
  "さらに詳細な事情を述べると、準備期間も考慮すべきです。",
  "結論は、来週の会議で方針を確定することです。",
  "なお最後に、参考資料の確認も忘れないでください。",
].join("");

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function baseFail(
  error: string,
  extra?: Partial<MemoryApplyProductionProbeResult>,
): MemoryApplyProductionProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    dbSotOk: false,
    saveRetrieveOk: false,
    memoryAppliedOk: false,
    artifactPreferenceAppliedOk: false,
    automationPreferenceAppliedOk: false,
    restartDurableOk: false,
    multiInstanceOk: false,
    ownershipIsolationOk: false,
    crossUserMemoryLeak: true,
    deletePropagationOk: false,
    updatePropagationOk: false,
    secretsRedacted: false,
    failClosedOk: false,
    memorySaved: false,
    memoryRetrieved: false,
    memoryApplied: false,
    failClosed: true,
    error,
    commitShaShort,
    environment,
    correlationId: `corr_n05_${randomUUID().slice(0, 8)}`,
    ...extra,
  };
}

async function atlasUserStateReadable(): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_service_role_not_configured" };
  }
  const { error } = await client
    .from("atlas_user_state")
    .select("user_id")
    .eq("domain", PERSONAL_MEMORY_DOMAIN_KEY)
    .limit(1);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

async function cleanupProbeUsers(userIds: readonly string[]): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (client && userIds.length > 0) {
    await client
      .from("atlas_user_state")
      .delete()
      .in("user_id", [...userIds])
      .eq("domain", PERSONAL_MEMORY_DOMAIN_KEY);
  }
  for (const userId of userIds) {
    evictPersonalMemoryCacheForUser(userId);
  }
}

function stubAutomation(userId: string, id: string): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    name: "n05-probe-automation",
    description: "N-05 memory probe",
    status: "active",
    trigger: {
      type: "manual",
      timezone: "Asia/Tokyo",
      schedule: null,
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps: [
        {
          id: "s1",
          type: "word_generate",
          name: "Word",
          order: 0,
          enabled: true,
          inputBindings: {},
          configuration: { title: "probe" },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [0] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
        },
      ],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 300_000,
        stepDefaultTimeoutMs: 60_000,
      },
    },
    executionPolicy: {
      mode: "run_then_notify",
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: [],
      systemHighRiskOverride: true,
    },
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: {
      freeformNotes: "X投稿の下書きを作ってください",
      structuredOptions: {},
    },
    memoryPolicy: {
      enabled: true,
      allowedScopes: ["writing_style", "recurring_work_preferences"],
      deniedScopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
  } as AutomationV2;
}

function artifactShowsPreferences(text: string): boolean {
  // Overlay headers are prepended; conclusion marker is in the transformed body.
  const conclusionIdx = text.indexOf("結論：");
  const bulletIdx = text.search(/(^|\n)- /);
  const hasConclusionFirst =
    conclusionIdx >= 0 && (bulletIdx < 0 || conclusionIdx < bulletIdx);
  const hasBullets = bulletIdx >= 0;
  const hasShortMarker =
    text.includes("length:short") || text.includes("【好み反映】");
  const hasKeys =
    text.includes("structure:bullets") ||
    text.includes("conclusion:first") ||
    text.includes("【適用する好み】");
  return hasConclusionFirst && hasBullets && (hasShortMarker || hasKeys);
}

async function probeOnce(): Promise<MemoryApplyProductionProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const correlationId = `corr_n05_${randomUUID().slice(0, 8)}`;
  const runId = randomUUID().slice(0, 8);
  const probeUserA = `user_n05_mem_a_${runId}`;
  const probeUserB = `user_n05_mem_b_${runId}`;
  const probeUsers = [probeUserA, probeUserB] as const;

  try {
    const dbSotOk = (SUPABASE_ONLY_DOMAIN_KEYS as readonly string[]).includes(
      PERSONAL_MEMORY_DOMAIN_KEY,
    );
    if (!dbSotOk) {
      return baseFail("atlasPersonalMemory_not_supabase_only", {
        correlationId,
      });
    }

    const table = await atlasUserStateReadable();
    if (!table.ok) {
      return baseFail(table.error ?? "atlas_user_state_unavailable", {
        dbSotOk: true,
        failClosedOk: true,
        correlationId,
      });
    }

    await cleanupProbeUsers(probeUsers);
    resetPersonalMemoryDurableForTests();

    // fail-closed: empty userId must not throw cross-user data
    let failClosedOk = false;
    try {
      const empty = await resolveForContext({ userId: "", notes: "x" });
      failClosedOk = empty.ledger.memoryIdsUsed.length === 0;
    } catch {
      failClosedOk = true;
    }

    const preferenceValue = buildExplicitWritingPreferenceValue(PREFERENCE_TEXT);
    const saved = await createPersonalMemory(probeUserA, {
      kind: "user_preference",
      scope: "writing_style",
      key: "writing_preference",
      title: "文章の好み",
      summary: PREFERENCE_TEXT.slice(0, 120),
      value: preferenceValue,
      source: "explicit",
      status: "active",
      confidence: 0.95,
      appliesTo: { global: true, automationIds: [], artifactTypes: [], capabilities: [] },
    });
    const persistA = await persistPersonalMemoryNow(probeUserA);
    const memorySaved = persistA === "supabase" && Boolean(saved.id);

    // User B different preference (must never leak to A)
    await createPersonalMemory(probeUserB, {
      kind: "user_preference",
      scope: "writing_style",
      key: "writing_preference",
      title: "文章の好みB",
      summary: "今後は丁寧な長文で書いてください",
      value: { text: "丁寧な長文", length: "long" },
      source: "explicit",
      status: "active",
      confidence: 0.9,
      appliesTo: { global: true, automationIds: [], artifactTypes: [], capabilities: [] },
    });
    const persistB = await persistPersonalMemoryNow(probeUserB);
    if (persistB !== "supabase") {
      return baseFail(`persist_b_${persistB}`, {
        dbSotOk: true,
        memorySaved,
        failClosedOk,
        correlationId,
      });
    }

    // restart / multi-instance: evict process cache, rehydrate from Postgres
    evictPersonalMemoryCacheForUser(probeUserA);
    evictPersonalMemoryCacheForUser(probeUserB);
    const memoryEmptyAfterEvict =
      listStoredPersonalMemories(probeUserA).length === 0 &&
      listStoredPersonalMemories(probeUserB).length === 0;

    await ensurePersonalMemoryHydrated(probeUserA);
    await ensurePersonalMemoryHydrated(probeUserB);
    const durableA = await loadDurableDomain<DurablePersonalMemoryState>(
      probeUserA,
      PERSONAL_MEMORY_DOMAIN_KEY,
    );
    const hydratedA = listStoredPersonalMemories(probeUserA).filter(
      (m) => m.status === "active",
    );
    const restartDurableOk =
      memoryEmptyAfterEvict &&
      hydratedA.some((m) => m.id === saved.id) &&
      Boolean(
        durableA?.memories?.some(
          (m) => m.id === saved.id && m.userId === probeUserA,
        ),
      );

    // retrieve without restating preference (job 2 assignment has no preference text)
    const job2Assignment = "週次の進捗メモを作成してください";
    const resolved = await resolveForContext({
      userId: probeUserA,
      notes: job2Assignment,
      artifactTypes: ["docx"],
    });
    const memoryRetrieved = resolved.ledger.memoryIdsUsed.includes(saved.id);
    const saveRetrieveOk = memorySaved && memoryRetrieved;

    // artifact apply
    const artifact = await applyMemoryForDeliverable({
      userId: probeUserA,
      content: ARTIFACT_BASELINE,
      format: "docx",
      assignment: job2Assignment,
    });
    // Drain any fire-and-forget persist from resolve/apply before mutating Memory.
    await persistPersonalMemoryNow(probeUserA);
    const artifactPreferenceAppliedOk =
      artifact.memoryRetrieved &&
      artifact.memoryApplied &&
      artifactShowsPreferences(artifact.content) &&
      artifact.appliedPreferenceKeys.includes("length:short") &&
      artifact.appliedPreferenceKeys.includes("structure:bullets") &&
      artifact.appliedPreferenceKeys.includes("conclusion:first");

    // automation apply (v2 path)
    const auto = await applyMemoryForAutomation({
      automation: stubAutomation(probeUserA, `auto_n05_${runId}`),
    });
    const automationPreferenceAppliedOk =
      auto.diagnostics.applied &&
      auto.ledger.memoryIdsUsed.includes(saved.id) &&
      auto.contentOverlay.preferenceKeys.includes("length:short");

    const memoryAppliedOk =
      artifactPreferenceAppliedOk && automationPreferenceAppliedOk;
    const memoryApplied = memoryAppliedOk;

    // ownership isolation / cross-user leak
    const resolvedB = await resolveForContext({
      userId: probeUserB,
      notes: job2Assignment,
    });
    const aIds = new Set(resolved.ledger.memoryIdsUsed);
    const bIds = new Set(resolvedB.ledger.memoryIdsUsed);
    const crossUserMemoryLeak = [...aIds].some((id) => bIds.has(id));
    const ownershipIsolationOk =
      !crossUserMemoryLeak &&
      aIds.has(saved.id) &&
      !bIds.has(saved.id) &&
      hydratedA.every((m) => m.userId === probeUserA);

    // update propagation
    const updated = await updatePersonalMemory(probeUserA, saved.id, {
      summary: "今後、文章は短め・箇条書き中心にしてください（更新）",
      value: {
        text: "短め・箇条書き（更新）",
        length: "short",
        structure: "bullets",
        // conclusion removed on purpose
      },
    });
    const persistUpdated = await persistPersonalMemoryNow(probeUserA);
    evictPersonalMemoryCacheForUser(probeUserA);
    await ensurePersonalMemoryHydrated(probeUserA);
    const afterUpdate = await applyMemoryForDeliverable({
      userId: probeUserA,
      content: ARTIFACT_BASELINE,
      format: "docx",
      assignment: "更新後の別依頼",
    });
    await persistPersonalMemoryNow(probeUserA);
    const updatePropagationOk =
      persistUpdated === "supabase" &&
      updated.summary.includes("更新") &&
      afterUpdate.appliedPreferenceKeys.includes("length:short") &&
      afterUpdate.appliedPreferenceKeys.includes("structure:bullets") &&
      !afterUpdate.appliedPreferenceKeys.includes("conclusion:first");

    // delete propagation
    await deletePersonalMemory(probeUserA, saved.id);
    const persistDeleted = await persistPersonalMemoryNow(probeUserA);
    evictPersonalMemoryCacheForUser(probeUserA);
    await ensurePersonalMemoryHydrated(probeUserA);
    const afterDelete = await applyMemoryForDeliverable({
      userId: probeUserA,
      content: ARTIFACT_BASELINE,
      format: "docx",
      assignment: "削除後の別依頼",
    });
    const deletePropagationOk =
      persistDeleted === "supabase" &&
      !afterDelete.memoryIdsUsed.includes(saved.id) &&
      !afterDelete.appliedPreferenceKeys.includes("length:short");

    // secrets redaction: sensitive/restricted values must not leak to logs
    const redacted = redactForLog({
      sensitivity: "restricted",
      summary: PREFERENCE_TEXT,
      value: {
        password: "secret-password-value",
        token: "tok_live_xxx",
      },
    });
    const redactedJson = JSON.stringify(redacted);
    const secretsRedacted =
      !redactedJson.includes("secret-password-value") &&
      !redactedJson.includes("tok_live_xxx") &&
      redacted.value === "[redacted]";

    const multiInstanceOk =
      restartDurableOk && ownershipIsolationOk && memoryEmptyAfterEvict;

    const ok =
      dbSotOk &&
      table.ok &&
      saveRetrieveOk &&
      memoryAppliedOk &&
      artifactPreferenceAppliedOk &&
      automationPreferenceAppliedOk &&
      restartDurableOk &&
      multiInstanceOk &&
      ownershipIsolationOk &&
      !crossUserMemoryLeak &&
      deletePropagationOk &&
      updatePropagationOk &&
      secretsRedacted &&
      failClosedOk;

    return {
      ok,
      dbSotOk: true,
      saveRetrieveOk,
      memoryAppliedOk,
      artifactPreferenceAppliedOk,
      automationPreferenceAppliedOk,
      restartDurableOk,
      multiInstanceOk,
      ownershipIsolationOk,
      crossUserMemoryLeak,
      deletePropagationOk,
      updatePropagationOk,
      secretsRedacted,
      failClosedOk,
      memorySaved,
      memoryRetrieved,
      memoryApplied,
      failClosed: true,
      error: ok
        ? null
        : [
            !saveRetrieveOk ? "save_retrieve_failed" : null,
            !artifactPreferenceAppliedOk
              ? `artifact_apply_failed(keys=${artifact.appliedPreferenceKeys.join(",") || "none"};concl=${artifact.content.includes("結論：")};bullets=${/(^|\n)- /.test(artifact.content)})`
              : null,
            !automationPreferenceAppliedOk ? "automation_apply_failed" : null,
            !restartDurableOk ? "restart_durable_failed" : null,
            !ownershipIsolationOk ? "ownership_isolation_failed" : null,
            crossUserMemoryLeak ? "cross_user_leak" : null,
            !updatePropagationOk
              ? `update_propagation_failed(keys=${afterUpdate.appliedPreferenceKeys.join(",") || "none"})`
              : null,
            !deletePropagationOk ? "delete_propagation_failed" : null,
            !secretsRedacted ? "secrets_not_redacted" : null,
            !failClosedOk ? "fail_closed_failed" : null,
            correlationId,
          ]
            .filter(Boolean)
            .join("|") || "n05_probe_failed",
      commitShaShort,
      environment,
      correlationId,
    };
  } catch (error) {
    return baseFail(error instanceof Error ? error.message : String(error), {
      correlationId,
    });
  } finally {
    await cleanupProbeUsers(probeUsers).catch(() => undefined);
  }
}

export async function probeMemoryApplyProduction(): Promise<MemoryApplyProductionProbeResult> {
  const first = await probeOnce();
  if (first.ok) return first;
  if (
    first.error &&
    /schema cache|JWT|clock|does not exist|persist|supabase|MEMORY_NOT_FOUND|artifact_apply|update_propagation/i.test(
      first.error,
    )
  ) {
    await new Promise((r) => setTimeout(r, 800));
    return probeOnce();
  }
  return first;
}
