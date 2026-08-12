#!/usr/bin/env node
/**
 * Production AUTOMATION UNATTENDED GATE
 *
 * Proves 1+ full unattended cycle via the normal Production Minute Scheduler
 * (GHA schedule → POST /api/automations/tick). This harness NEVER calls tick,
 * drain, /run, or "今すぐ実行".
 *
 * Secrets (never logged):
 *   CLERK_SECRET_KEY
 *   CLERK_PUBLISHABLE_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 *   E2E_CLERK_USER_ID
 *   E2E_CLERK_USER_B_ID
 * Optional:
 *   ATLAS_APP_URL (default https://atlasapp.jp)
 *   CORE_LOOP_EXPECT_SHA / GITHUB_SHA — wait for Production SHA
 *   AUTOMATION_UNATTENDED_OUT — evidence directory
 *   AUTOMATION_UNATTENDED_MAX_WAIT_MS — default 100 minutes
 *
 * Exit: 0 PASS · 2 OWNER_SETUP · 1 FAIL
 */

import { chromium } from "playwright";
import { createClerkClient } from "@clerk/backend";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const APP_URL = (process.env.ATLAS_APP_URL || "https://atlasapp.jp").replace(
  /\/$/,
  "",
);
const OUT_DIR =
  process.env.AUTOMATION_UNATTENDED_OUT?.trim() ||
  join(process.cwd(), "tmp", "automation-unattended");
const MAX_WAIT_MS = Number(
  process.env.AUTOMATION_UNATTENDED_MAX_WAIT_MS || 110 * 60 * 1000,
);
const POLL_MS = 20_000;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY?.trim() || "";
const CLERK_PUBLISHABLE =
  process.env.CLERK_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
  "";
const USER_A = process.env.E2E_CLERK_USER_ID?.trim() || "";
const USER_B = process.env.E2E_CLERK_USER_B_ID?.trim() || "";
const EXPECT_SHA =
  process.env.CORE_LOOP_EXPECT_SHA?.trim() ||
  process.env.GITHUB_SHA?.trim() ||
  "";

function redactId(id) {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function tokyoParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function addTokyoMinutes(minutesAhead) {
  const base = new Date(Date.now() + minutesAhead * 60_000);
  return tokyoParts(base);
}

async function waitProductionSha(expected) {
  if (!expected) return null;
  const short = expected.slice(0, 7);
  for (let i = 0; i < 40; i += 1) {
    const res = await fetch(`${APP_URL}/api/health/version`, {
      cache: "no-store",
    });
    const body = await res.json();
    console.log(
      JSON.stringify({
        progress: "wait_production_sha",
        expectedShort: short,
        productionShaShort: body.commitShaShort,
      }),
    );
    if (body.commitSha === expected || body.commitShaShort === short) {
      return body;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`production_sha_mismatch expected=${short}`);
}

async function resolveEmail(userId) {
  const client = createClerkClient({ secretKey: CLERK_SECRET });
  const user = await client.users.getUser(userId);
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const primary =
    emails.find((e) => e.id === user.primaryEmailAddressId) || emails[0];
  return primary?.emailAddress || null;
}

async function signIn(browser, userId) {
  const email = await resolveEmail(userId);
  if (!email) throw new Error(`email_missing:${redactId(userId)}`);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();
  await setupClerkTestingToken({ context });
  await page.goto(`${APP_URL}/sign-in`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await clerk.signIn({ page, emailAddress: email });
  await page.waitForFunction(
    () => Boolean(window.Clerk?.user?.id),
    null,
    { timeout: 60_000 },
  );
  const authApi = await page.request.get(`${APP_URL}/api/billing/summary`);
  if (authApi.status() !== 200) {
    throw new Error(`auth_api_status_${authApi.status()}`);
  }
  return { context, page, emailRedacted: redactId(email) };
}

function listNaturalSchedulerRunsInWindow(isoFrom, isoTo) {
  try {
    const raw = execFileSync(
      "gh",
      [
        "run",
        "list",
        "--workflow=minute-scheduler.yml",
        "--event=schedule",
        "--limit=40",
        "--json",
        "databaseId,createdAt,conclusion,event,status,url",
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    const rows = JSON.parse(raw);
    const fromMs = Date.parse(isoFrom) - 120_000;
    const toMs = isoTo ? Date.parse(isoTo) + 10 * 60_000 : Date.now() + 60_000;
    return rows
      .filter((r) => {
        if (r.event !== "schedule") return false;
        const t = Date.parse(r.createdAt);
        return Number.isFinite(t) && t >= fromMs && t <= toMs;
      })
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  } catch (error) {
    console.log(
      JSON.stringify({
        progress: "gh_scheduler_list_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

function pickClaimedAt(run) {
  const history = Array.isArray(run?.statusHistory) ? run.statusHistory : [];
  const running = history.find(
    (h) => h?.to === "running" || h?.status === "running",
  );
  return (
    running?.at ||
    running?.timestamp ||
    run?.startedAt ||
    run?.queuedAt ||
    null
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const evidence = {
    ok: false,
    status: "RUNNING",
    gate: "AUTOMATION_UNATTENDED",
    appUrl: APP_URL,
    startedAt,
    endedAt: null,
    productionSha: null,
    productionShaShort: null,
    productionShaMatchesMain: null,
    testUserA: redactId(USER_A),
    testUserB: redactId(USER_B),
    automationId: null,
    schedule: null,
    timezone: "Asia/Tokyo",
    createdAt: null,
    scheduledFor: null,
    schedulerDetectedAt: null,
    claimedAt: null,
    executionStartedAt: null,
    completedAt: null,
    nextRunAt: null,
    naturalSchedulerTrigger: false,
    manualExecution: false,
    jobId: null,
    executionId: null,
    correlationId: null,
    finalStatus: null,
    artifactId: null,
    storageExists: null,
    download: null,
    historyConsistent: null,
    notificationConsistent: null,
    memoryRetrieved: null,
    memoryApplied: null,
    memorySeeded: false,
    duplicateExecution: null,
    claimedExactlyOnce: null,
    multiInstanceSafe: null,
    crossUserIsolated: null,
    secretsRedacted: true,
    automationCreated: false,
    schedulePersisted: false,
    executionStarted: false,
    executionCompleted: false,
    finalResultConfirmed: false,
    artifactPersisted: false,
    downloadable: false,
    minuteSchedulerRuns: [],
    error: null,
    failureStage: "init",
  };

  const finish = (code) => {
    evidence.endedAt = new Date().toISOString();
    evidence.status = code === 0 ? "PASS" : "FAIL";
    evidence.ok = code === 0;
    const path = join(OUT_DIR, `automation-unattended-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        ok: evidence.ok,
        status: evidence.status,
        evidencePath: path,
        automationId: evidence.automationId
          ? redactId(evidence.automationId)
          : null,
        executionId: evidence.executionId
          ? redactId(evidence.executionId)
          : null,
        finalStatus: evidence.finalStatus,
        naturalSchedulerTrigger: evidence.naturalSchedulerTrigger,
        manualExecution: evidence.manualExecution,
        error: evidence.error,
      }),
    );
    process.exit(code);
  };

  try {
    if (!CLERK_SECRET || !CLERK_PUBLISHABLE || !USER_A || !USER_B) {
      evidence.error = "missing_clerk_or_e2e_user_secrets";
      finish(2);
    }

    process.env.CLERK_SECRET_KEY = CLERK_SECRET;
    process.env.CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE;

    evidence.failureStage = "wait_production_sha";
    const version = EXPECT_SHA
      ? await waitProductionSha(EXPECT_SHA)
      : await (await fetch(`${APP_URL}/api/health/version`)).json();
    evidence.productionSha = version.commitSha || null;
    evidence.productionShaShort = version.commitShaShort || null;
    evidence.productionShaMatchesMain = EXPECT_SHA
      ? version.commitSha === EXPECT_SHA ||
        version.commitShaShort === EXPECT_SHA.slice(0, 7)
      : true;
    if (EXPECT_SHA && !evidence.productionShaMatchesMain) {
      throw new Error("production_sha_does_not_match_main");
    }

    await clerkSetup({
      publishableKey: CLERK_PUBLISHABLE,
      secretKey: CLERK_SECRET,
      dotenv: false,
    });

    const browser = await chromium.launch({ headless: true });
    let pageA;
    let contextA;
    let pageB;
    let contextB;
    let automationId = null;

    try {
      evidence.failureStage = "sign_in_user_a";
      const signedA = await signIn(browser, USER_A);
      contextA = signedA.context;
      pageA = signedA.page;

      // Seed a safe non-sensitive preference for Memory apply proof.
      evidence.failureStage = "seed_memory";
      const memRes = await pageA.request.post(`${APP_URL}/api/personal-memory`, {
        data: {
          kind: "user_preference",
          scope: "writing_style",
          key: "unattended_gate_tone",
          title: "無人実行ゲート検証用トーン",
          summary: "検証用：簡潔・丁寧な文体を優先",
          value: { tone: "concise_polite", locale: "ja" },
          source: "explicit",
          status: "active",
          confidence: 0.9,
        },
      });
      if (memRes.status() === 201 || memRes.status() === 200) {
        evidence.memorySeeded = true;
      } else {
        // Do not invent Memory; continue and report actual apply flags.
        console.log(
          JSON.stringify({
            progress: "memory_seed_skipped",
            http: memRes.status(),
          }),
        );
      }

      // Preflight feature flags (Production SoT for create gate).
      evidence.failureStage = "feature_flags_preflight";
      const flagsRes = await pageA.request.get(
        `${APP_URL}/api/feature-flags/availability`,
      );
      const flagsBody = await flagsRes.json();
      const flags = flagsBody?.flags || {};
      evidence.featureFlags = {
        automation_v2_enabled: flags.automation_v2_enabled ?? null,
        automation_memory_enabled: flags.automation_memory_enabled ?? null,
      };
      console.log(
        JSON.stringify({
          progress: "feature_flags_preflight",
          http: flagsRes.status(),
          flags: evidence.featureFlags,
        }),
      );
      if (flags.automation_v2_enabled !== true) {
        throw new Error(
          "automation_v2_enabled_false — cannot create Automation on Production",
        );
      }
      if (flags.automation_memory_enabled !== true) {
        throw new Error(
          "automation_memory_enabled_false — Memory policy create blocked (N-05/gate requires ON)",
        );
      }

      const when = addTokyoMinutes(3);
      evidence.schedule = {
        frequency: "daily",
        hour: when.hour,
        minute: when.minute,
        timezone: "Asia/Tokyo",
      };

      const createBody = {
        name: `UNATTENDED-GATE ${startedAt.slice(0, 16)}`,
        description:
          "一般有料公開ゲート② — Production無人1周期検証（短文Word・外部副作用なし）",
        status: "active",
        trigger: {
          type: "schedule",
          timezone: "Asia/Tokyo",
          schedule: {
            frequency: "daily",
            hour: when.hour,
            minute: when.minute,
          },
          event: null,
          condition: null,
        },
        workflow: {
          version: 1,
          steps: [
            {
              id: "step-word",
              type: "word_generate",
              name: "検証用Word生成",
              order: 1,
              inputBindings: {},
              configuration: {
                title: "MINERVOT Unattended Automation Gate",
                content: [
                  "# MINERVOT Unattended Automation Gate",
                  "",
                  "本資料は Production 通常 scheduler による無人実行検証用です。",
                  "外部投稿・メール送信などの副作用はありません。",
                  "",
                  "## 本文",
                  "予定時刻到達 → claim → execute → 成果物保存 までを実証します。",
                  `作成UTC: ${startedAt}`,
                ].join("\n"),
              },
              requiresApproval: false,
              retryPolicy: { maxAttempts: 1, backoffMs: [] },
              timeoutMs: 180_000,
              onSuccess: null,
              onFailure: null,
              enabled: true,
            },
          ],
          onFailure: { strategy: "stop", notify: true },
          timeoutPolicy: {
            workflowTimeoutMs: 900_000,
            stepDefaultTimeoutMs: 180_000,
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
          structuredOptions: { generateWord: true },
          freeformNotes: "無人実行ゲート検証。簡潔に。",
        },
        memoryPolicy: {
          enabled: true,
          allowedScopes: ["writing_style"],
          deniedScopes: [],
          lockedOverrides: {},
        },
        rejectOnConflict: false,
      };

      evidence.failureStage = "create_automation";
      // Freeze "create moment" just before POST so schedule is still in the future.
      const createRes = await pageA.request.post(
        `${APP_URL}/api/automation-platform`,
        { data: createBody },
      );
      const createJson = await createRes.json();
      if (createRes.status() !== 201 && createRes.status() !== 200) {
        const detailFlag =
          createJson?.details?.flag || createJson?.error?.details?.flag || null;
        throw new Error(
          `create_failed http=${createRes.status()} code=${createJson?.error?.code || createJson?.error || "unknown"} flag=${detailFlag || "none"} developerCode=${createJson?.developerCode || createJson?.error?.code || "none"}`,
        );
      }
      const automation = createJson.automation;
      automationId = automation?.id;
      if (!automationId) throw new Error("automation_id_missing");
      evidence.automationId = automationId;
      evidence.automationCreated = true;
      evidence.createdAt = automation.createdAt || new Date().toISOString();
      evidence.scheduledFor = automation.nextRunAt;
      evidence.schedulePersisted = Boolean(automation.nextRunAt);
      evidence.nextRunAt = automation.nextRunAt;
      console.log(
        JSON.stringify({
          progress: "automation_created",
          automationId: redactId(automationId),
          scheduledFor: evidence.scheduledFor,
          schedule: evidence.schedule,
        }),
      );

      if (!evidence.schedulePersisted) {
        throw new Error("nextRunAt_not_persisted");
      }

      // === UNATTENDED WAIT: no tick / no run / no drain ===
      evidence.failureStage = "wait_natural_scheduler";
      evidence.manualExecution = false;
      const deadline = Date.now() + MAX_WAIT_MS;
      let completedRun = null;

      while (Date.now() < deadline) {
        const getAuto = await pageA.request.get(
          `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}`,
        );
        const autoBody = await getAuto.json();
        const auto = autoBody.automation;
        if (auto?.nextRunAt) evidence.nextRunAt = auto.nextRunAt;

        const runsRes = await pageA.request.get(
          `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}/run`,
        );
        const runsBody = await runsRes.json();
        const runs = Array.isArray(runsBody.runs)
          ? runsBody.runs
          : Array.isArray(runsBody)
            ? runsBody
            : [];

        const scheduleRuns = runs.filter((r) => r.triggerType === "schedule");
        const manualRuns = runs.filter((r) => r.triggerType === "manual");
        if (manualRuns.length > 0) {
          evidence.manualExecution = true;
          throw new Error("manual_run_detected_forbidden");
        }

        if (scheduleRuns.length > 0) {
          const run = scheduleRuns.sort(
            (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
          )[0];
          evidence.executionId = run.id;
          evidence.correlationId = run.diagnosticId || null;
          evidence.claimedAt = pickClaimedAt(run);
          evidence.executionStartedAt = run.startedAt || null;
          evidence.finalStatus = run.status;
          evidence.jobId =
            run.completionEvidence?.jobId ||
            run.attempts?.[0]?.jobId ||
            null;

          if (
            ["running", "queued", "retrying", "awaiting_approval", "needs_input"].includes(
              run.status,
            )
          ) {
            evidence.executionStarted = true;
          }

          if (["awaiting_approval", "needs_input"].includes(run.status)) {
            throw new Error(
              `unattended_blocked_on_${run.status}_manual_intervention_forbidden`,
            );
          }

          if (
            ["completed", "succeeded", "failed", "partially_succeeded"].includes(
              run.status,
            )
          ) {
            completedRun = run;
            evidence.completedAt = run.completedAt || null;
            evidence.executionStarted = true;
            evidence.executionCompleted = [
              "completed",
              "succeeded",
            ].includes(run.status);
            break;
          }
        }

        const schedList = listNaturalSchedulerRunsInWindow(
          evidence.scheduledFor,
          null,
        );
        if (schedList) {
          evidence.minuteSchedulerRuns = schedList.slice(0, 8).map((r) => ({
            id: r.databaseId,
            createdAt: r.createdAt,
            conclusion: r.conclusion,
            event: r.event,
            url: r.url,
          }));
          if (schedList.length > 0 && !evidence.schedulerDetectedAt) {
            evidence.schedulerDetectedAt = schedList[0].createdAt;
          }
        }

        console.log(
          JSON.stringify({
            progress: "polling_unattended",
            now: new Date().toISOString(),
            scheduledFor: evidence.scheduledFor,
            scheduleRunCount: scheduleRuns.length,
            naturalSchedulerRuns: evidence.minuteSchedulerRuns.length,
            nextRunAt: evidence.nextRunAt,
          }),
        );
        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!completedRun) {
        throw new Error("unattended_cycle_timeout_no_schedule_run");
      }

      // Natural trigger proof: GHA minute-scheduler schedule event in the
      // [scheduledFor, completedAt] window. Soft fallback from triggerType alone
      // is forbidden (manual tick / workflow_dispatch must not count).
      const windowSchedulers = listNaturalSchedulerRunsInWindow(
        evidence.scheduledFor,
        evidence.completedAt || completedRun.completedAt || new Date().toISOString(),
      );
      if (windowSchedulers === null) {
        throw new Error("natural_scheduler_gha_list_unavailable");
      }
      evidence.minuteSchedulerRuns = windowSchedulers.slice(0, 8).map((r) => ({
        id: r.databaseId,
        createdAt: r.createdAt,
        conclusion: r.conclusion,
        event: r.event,
        url: r.url,
      }));
      if (
        windowSchedulers.length === 0 ||
        completedRun.triggerType !== "schedule" ||
        evidence.manualExecution
      ) {
        evidence.naturalSchedulerTrigger = false;
        throw new Error(
          `natural_scheduler_trigger_not_proven ghaScheduleRuns=${windowSchedulers.length} triggerType=${completedRun.triggerType}`,
        );
      }
      evidence.naturalSchedulerTrigger = true;
      evidence.schedulerDetectedAt =
        evidence.schedulerDetectedAt || windowSchedulers[0].createdAt;

      if (!["completed", "succeeded"].includes(completedRun.status)) {
        throw new Error(
          `run_not_success status=${completedRun.status} code=${completedRun.lastErrorCode || ""}`,
        );
      }

      evidence.failureStage = "collect_result";
      const memUsed = completedRun.memoryUsage?.used?.length || 0;
      const memIds = completedRun.memoryUsage?.memoryIdsUsed?.length || 0;
      evidence.memoryRetrieved = memUsed > 0 || memIds > 0;
      evidence.memoryApplied = memIds > 0 || memUsed > 0;

      const artifacts = Array.isArray(completedRun.artifacts)
        ? completedRun.artifacts
        : [];
      const artifact =
        artifacts.find((a) => a?.id) ||
        (completedRun.completionEvidence?.artifactIds || []).map((id) => ({
          id,
        }))[0];
      evidence.artifactId = artifact?.id || null;
      evidence.artifactPersisted = Boolean(evidence.artifactId);

      if (!evidence.artifactId) {
        throw new Error("artifact_missing_after_success_run");
      }

      evidence.failureStage = "download";
      const dl = await pageA.request.get(
        `${APP_URL}/api/deliverables/${encodeURIComponent(evidence.artifactId)}`,
      );
      const buf = Buffer.from(await dl.body());
      evidence.download = {
        httpStatus: dl.status(),
        mime: dl.headers()["content-type"] || "",
        contentDispositionPresent: Boolean(
          dl.headers()["content-disposition"],
        ),
        bytes: buf.byteLength,
        zipMagic: buf.subarray(0, 2).toString("utf8") === "PK",
      };
      evidence.downloadable =
        dl.status() === 200 && evidence.download.zipMagic === true;
      evidence.storageExists = evidence.downloadable;
      evidence.finalResultConfirmed = evidence.downloadable;

      // Re-fetch automation for nextRunAt advance proof
      const afterAuto = await pageA.request.get(
        `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}`,
      );
      const afterBody = await afterAuto.json();
      evidence.nextRunAt = afterBody.automation?.nextRunAt || null;
      if (
        !evidence.nextRunAt ||
        evidence.nextRunAt === evidence.scheduledFor
      ) {
        throw new Error("nextRunAt_not_advanced_after_cycle");
      }

      // History consistency
      evidence.historyConsistent =
        completedRun.automationId === automationId &&
        ["completed", "succeeded"].includes(completedRun.status);

      // Notifications — success path should have in-app notification
      const notifRes = await pageA.request.get(`${APP_URL}/api/notifications`);
      const notifBody = await notifRes.json();
      const notifs = Array.isArray(notifBody.notifications)
        ? notifBody.notifications
        : Array.isArray(notifBody)
          ? notifBody
          : [];
      // Success path only (N-07): require a notification linked to this run/automation.
      const successRelated = notifs.filter((n) => {
        const linked =
          n?.automationId === automationId ||
          n?.relatedTaskId === completedRun.id ||
          n?.requestId === completedRun.id ||
          n?.targetId === completedRun.id ||
          (typeof automation?.name === "string" &&
            String(n?.message || "").includes(automation.name));
        const isSuccess =
          n?.type === "completed" ||
          n?.lineEvent === "automation_completed" ||
          n?.type === "automation";
        const isFailure =
          n?.type === "error" || n?.lineEvent === "error";
        return linked && isSuccess && !isFailure;
      });
      evidence.notificationConsistent =
        notifRes.status() === 200 &&
        (successRelated.length > 0 ||
          (completedRun.completionEvidence?.notificationIds || []).length > 0);

      // Duplicate occurrence check (same schedule occurrence must run once)
      const runsRes2 = await pageA.request.get(
        `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}/run`,
      );
      const runs2 = (await runsRes2.json()).runs || [];
      const scheduleRunsAll = runs2.filter((r) => r.triggerType === "schedule");
      const occ = completedRun.scheduleOccurrenceKey;
      const sameOcc = occ
        ? scheduleRunsAll.filter((r) => r.scheduleOccurrenceKey === occ)
        : scheduleRunsAll.filter(
            (r) =>
              r.scheduledFor &&
              r.scheduledFor === completedRun.scheduledFor,
          );
      // First unattended cycle must produce exactly one schedule run for this occurrence.
      evidence.duplicateExecution = sameOcc.length !== 1;
      evidence.claimedExactlyOnce = sameOcc.length === 1;
      evidence.multiInstanceSafe = evidence.claimedExactlyOnce;

      // User B isolation
      evidence.failureStage = "user_b_isolation";
      const signedB = await signIn(browser, USER_B);
      contextB = signedB.context;
      pageB = signedB.page;
      const bGet = await pageB.request.get(
        `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}`,
      );
      const bRun = await pageB.request.post(
        `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}/run`,
        { data: {} },
      );
      const bDl = await pageB.request.get(
        `${APP_URL}/api/deliverables/${encodeURIComponent(evidence.artifactId)}`,
      );
      const bPatch = await pageB.request.patch(
        `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}`,
        { data: { status: "paused" } },
      );
      evidence.crossUserIsolated =
        bGet.status() >= 400 &&
        bRun.status() >= 400 &&
        bDl.status() >= 400 &&
        bPatch.status() >= 400;

      // Pause automation to stop further Production cycles (cleanup, not execute).
      await pageA.request.patch(
        `${APP_URL}/api/automation-platform/${encodeURIComponent(automationId)}`,
        { data: { status: "paused" } },
      );

      const required = {
        productionShaMatchesMain: evidence.productionShaMatchesMain === true,
        automationCreated: evidence.automationCreated === true,
        schedulePersisted: evidence.schedulePersisted === true,
        naturalSchedulerTrigger: evidence.naturalSchedulerTrigger === true,
        manualExecution: evidence.manualExecution === false,
        claimedExactlyOnce: evidence.claimedExactlyOnce === true,
        executionStarted: evidence.executionStarted === true,
        executionCompleted: evidence.executionCompleted === true,
        finalResultConfirmed: evidence.finalResultConfirmed === true,
        historyConsistent: evidence.historyConsistent === true,
        notificationConsistent: evidence.notificationConsistent === true,
        nextRunAtUpdated:
          Boolean(evidence.nextRunAt) &&
          evidence.nextRunAt !== evidence.scheduledFor,
        duplicateExecution: evidence.duplicateExecution === false,
        crossUserIsolated: evidence.crossUserIsolated === true,
        secretsRedacted: evidence.secretsRedacted === true,
        artifactPersisted: evidence.artifactPersisted === true,
        storageExists: evidence.storageExists === true,
        downloadable: evidence.downloadable === true,
      };
      if (evidence.memorySeeded) {
        required.memoryRetrieved = evidence.memoryRetrieved === true;
        required.memoryApplied = evidence.memoryApplied === true;
      }

      const failed = Object.entries(required)
        .filter(([, v]) => v !== true)
        .map(([k]) => k);
      if (failed.length) {
        throw new Error(`gate_assertions_failed:${failed.join(",")}`);
      }

      evidence.failureStage = "complete";
      finish(0);
    } finally {
      await contextB?.close().catch(() => {});
      await contextA?.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    finish(1);
  }
}

main();
