#!/usr/bin/env node
/**
 * Production CORE LOOP E2E — Clerk official Playwright testing helpers.
 *
 * Auth path (no app bypass, no ticket URL retry):
 *   1) clerkSetup() — mint Testing Token via Clerk Backend API
 *   2) createAgentTestingTask({ onBehalfOf: { userId } }) — official session URL
 *   3) setupClerkTestingToken({ page }) — attach Testing Token to FAPI
 *   4) page.goto(agentTask.url) — establish Production Clerk session
 *   5) Prove session via Clerk.user.id + authenticated API (== 200)
 *
 * Why not clerk.signIn({ emailAddress })?
 *   That helper still mints a Sign-in Token and uses strategy:"ticket".
 *   Production Google-only + prior evidence already showed ticket redemption
 *   leaves the browser on /sign-in with authApiStatus=401.
 *   Agent Tasks is Clerk's documented Playwright path for userId-based
 *   authenticated sessions without the standard sign-in UI.
 *
 * Secrets (never logged):
 *   CLERK_SECRET_KEY
 *   CLERK_PUBLISHABLE_KEY or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 *   E2E_CLERK_USER_ID
 *   E2E_CLERK_USER_B_ID
 * Optional:
 *   ATLAS_APP_URL (default https://atlasapp.jp)
 *
 * Exit codes:
 *   0 = PASS
 *   2 = OWNER_SETUP_REQUIRED
 *   1 = FAIL
 */

import { chromium } from "playwright";
import {
  clerkSetup,
  createAgentTestingTask,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const APP_URL = (process.env.ATLAS_APP_URL || "https://atlasapp.jp").replace(
  /\/$/,
  "",
);
const OUT_DIR =
  process.env.CORE_LOOP_E2E_OUT?.trim() ||
  join(process.cwd(), "tmp", "core-loop-e2e");
const ASSIGNMENT = [
  "簡単な営業報告書をWordで作成してください。",
  "タイトル: MINERVOT Production Test",
  "内容: 本番E2E検証用の短い営業報告",
].join("\n");

const CLERK_SECRET = process.env.CLERK_SECRET_KEY?.trim() || "";
const CLERK_PUBLISHABLE =
  process.env.CLERK_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
  "";
const USER_A = process.env.E2E_CLERK_USER_ID?.trim() || "";
const USER_B = process.env.E2E_CLERK_USER_B_ID?.trim() || "";

function redactId(id) {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function assertNoSecretLeak(text) {
  const hay = String(text ?? "");
  if (CLERK_SECRET && hay.includes(CLERK_SECRET)) {
    throw new Error("secrets_redaction_failed: clerk secret leaked");
  }
  if (CLERK_PUBLISHABLE && hay.includes(CLERK_PUBLISHABLE)) {
    throw new Error("secrets_redaction_failed: clerk publishable leaked");
  }
  if (/sk_live_[A-Za-z0-9]+/.test(hay) || /sk_test_[A-Za-z0-9]+/.test(hay)) {
    throw new Error("secrets_redaction_failed: sk_ pattern in evidence");
  }
}

function ownerSetupExit(reason) {
  const body = {
    ok: false,
    status: "OWNER_SETUP_REQUIRED",
    reason,
    appUrl: APP_URL,
    setupDoc: "docs/development/core-loop-production-e2e-setup.md",
  };
  console.error(JSON.stringify(body));
  process.exit(2);
}

function safeUrlMeta(urlString) {
  try {
    const u = new URL(urlString);
    const redacted = new URL(u.toString());
    for (const key of [
      "__clerk_ticket",
      "ticket",
      "__clerk_testing_token",
      "redirect_url",
      "token",
    ]) {
      if (redacted.searchParams.has(key)) {
        redacted.searchParams.set(key, "[REDACTED]");
      }
    }
    // Agent Task accept URLs often embed opaque path tokens — keep origin+pathname only.
    return {
      origin: u.origin,
      pathname: u.pathname,
      redactedUrl: `${redacted.origin}${redacted.pathname}`,
    };
  } catch {
    return {
      origin: null,
      pathname: null,
      redactedUrl: null,
    };
  }
}

async function fetchProductionVersion() {
  const res = await fetch(`${APP_URL}/api/health/version`, {
    headers: { "cache-control": "no-store" },
  });
  const json = await res.json();
  return { httpStatus: res.status, ...json };
}

/**
 * Establish a real Production Clerk session for expectedUserId via
 * @clerk/testing/playwright Agent Tasks + Testing Tokens.
 * Does NOT add app-level auth bypass.
 */
async function signInWithClerkOfficial(browser, expectedUserId) {
  const auth = {
    clerkSetupOk: false,
    clerkSignInOk: false,
    clerkSessionDetected: false,
    authenticatedUserIdMatchesExpected: false,
    authApiStatus: null,
    protectedPageAccessible: false,
    testingTokenReady: false,
    agentTaskCreated: false,
    agentTaskUrlPresent: false,
    initialHttpStatus: null,
    redirectChain: [],
    finalUrlPath: null,
    failureStage: "init",
    authMethod: "clerk_testing_agent_task",
    expectedUserIdRedacted: redactId(expectedUserId),
  };

  try {
    auth.failureStage = "clerk_setup";
    await clerkSetup({
      publishableKey: CLERK_PUBLISHABLE,
      secretKey: CLERK_SECRET,
      dotenv: false,
    });
    auth.clerkSetupOk = Boolean(process.env.CLERK_TESTING_TOKEN);
    if (!auth.clerkSetupOk) {
      throw new Error("clerk_setup_missing_testing_token");
    }
  } catch (err) {
    auth.failureStage = "clerk_setup_failed";
    const message = String(err?.message || err);
    if (/agent.?task|beta|not.?enabled|403|404|forbidden/i.test(message)) {
      const error = new Error(`OWNER_SETUP_REQUIRED: ${message.slice(0, 240)}`);
      error.auth = auth;
      error.ownerSetup = true;
      throw error;
    }
    const error = new Error(`clerk_setup_failed: ${message.slice(0, 240)}`);
    error.auth = auth;
    throw error;
  }

  let agentTask;
  try {
    auth.failureStage = "create_agent_testing_task";
    agentTask = await createAgentTestingTask({
      secretKey: CLERK_SECRET,
      onBehalfOf: { userId: expectedUserId },
      permissions: "*",
      agentName: "minervot-core-loop-e2e",
      taskDescription: "production-core-loop-auth",
      redirectUrl: `${APP_URL}/projects`,
      sessionMaxDurationInSeconds: 1800,
    });
    auth.agentTaskCreated = true;
    auth.agentTaskUrlPresent = Boolean(
      agentTask?.url && typeof agentTask.url === "string",
    );
    if (!auth.agentTaskUrlPresent) {
      throw new Error("agent_task_url_missing");
    }
  } catch (err) {
    auth.failureStage = "agent_task_create_failed";
    const message = String(err?.message || err);
    const ownerHint =
      /beta|not.?enabled|forbidden|403|404|feature|unavailable|permission/i.test(
        message,
      );
    const error = new Error(
      ownerHint
        ? `OWNER_SETUP_REQUIRED: Agent Tasks API failed — enable Agent Tasks (beta) on Production Clerk or check Secret. detail=${message.slice(0, 200)}`
        : `agent_task_create_failed: ${message.slice(0, 240)}`,
    );
    error.auth = auth;
    error.ownerSetup = ownerHint;
    throw error;
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const meta = safeUrlMeta(frame.url());
    if (meta.pathname) {
      auth.redirectChain.push(meta.pathname);
      if (auth.redirectChain.length > 20) auth.redirectChain.shift();
    }
  });

  try {
    auth.failureStage = "setup_clerk_testing_token";
    await setupClerkTestingToken({ page });
    auth.testingTokenReady = true;

    auth.failureStage = "open_agent_task_url";
    const agentMeta = safeUrlMeta(agentTask.url);
    auth.agentTaskOrigin = agentMeta.origin;
    auth.agentTaskPath = agentMeta.pathname;

    const navResp = await page.goto(agentTask.url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    auth.initialHttpStatus = navResp?.status() ?? null;

    // Agent Task accept redirects through Clerk-hosted hosts, then to redirectUrl.
    // Clerk JS for our app is only available after we land on APP_URL.
    auth.failureStage = "wait_app_origin_after_agent_task";
    const appOrigin = new URL(APP_URL).origin;
    if (!page.url().startsWith(appOrigin)) {
      await page
        .waitForURL(
          (url) => {
            try {
              return new URL(url).origin === appOrigin;
            } catch {
              return false;
            }
          },
          { timeout: 75_000 },
        )
        .catch(() => null);
    }

    if (!page.url().startsWith(appOrigin)) {
      // Force navigation to protected page; session cookies from Agent Task should apply.
      await page.goto(`${APP_URL}/projects`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    }

    auth.failureStage = "wait_clerk_session";
    await page
      .waitForFunction(
        () => Boolean(window.Clerk?.loaded && (window.Clerk?.user?.id || window.Clerk?.session)),
        { timeout: 60_000 },
      )
      .catch(() => null);

    const sessionUserId = await page
      .evaluate(() => window.Clerk?.user?.id ?? null)
      .catch(() => null);
    auth.clerkSessionDetected = Boolean(sessionUserId);
    auth.authenticatedUserIdMatchesExpected = sessionUserId === expectedUserId;
    auth.clerkSignInOk =
      auth.clerkSessionDetected && auth.authenticatedUserIdMatchesExpected;

    auth.failureStage = "auth_api_probe";
    const apiProbe = await page.request.get(`${APP_URL}/api/notifications`);
    auth.authApiStatus = apiProbe.status();

    auth.failureStage = "protected_page";
    await page.goto(`${APP_URL}/projects`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(800);
    const finalUrl = page.url();
    auth.finalUrlPath = safeUrlMeta(finalUrl).pathname;
    auth.protectedPageAccessible =
      !finalUrl.includes("/sign-in") &&
      !finalUrl.includes("/sign-up") &&
      auth.authApiStatus === 200 &&
      auth.clerkSignInOk;

    if (!auth.clerkSetupOk) {
      auth.failureStage = "clerk_setup_not_ok";
      throw new Error("clerkSetupOk=false");
    }
    if (!auth.clerkSignInOk) {
      auth.failureStage = "clerk_sign_in_failed";
      throw new Error(
        `clerkSignInOk=false session=${auth.clerkSessionDetected} userMatch=${auth.authenticatedUserIdMatchesExpected} path=${auth.finalUrlPath}`,
      );
    }
    if (!auth.clerkSessionDetected) {
      auth.failureStage = "clerk_session_missing";
      throw new Error("clerk_session_missing_after_agent_task");
    }
    if (!auth.authenticatedUserIdMatchesExpected) {
      auth.failureStage = "user_mismatch";
      throw new Error(
        `authenticated_user_mismatch got=${redactId(sessionUserId)}`,
      );
    }
    if (auth.authApiStatus !== 200) {
      auth.failureStage =
        auth.authApiStatus === 401 ? "auth_api_still_401" : "auth_api_not_200";
      throw new Error(`authenticated_api_status_${auth.authApiStatus}`);
    }
    if (!auth.protectedPageAccessible) {
      auth.failureStage = "protected_page_blocked";
      throw new Error(
        `protected_page_not_accessible path=${auth.finalUrlPath}`,
      );
    }

    auth.failureStage = "auth_ok";
    return { context, page, url: finalUrl.split("?")[0], auth };
  } catch (err) {
    await context.close().catch(() => null);
    if (!err.auth) err.auth = auth;
    if (!auth.failureStage || auth.failureStage === "auth_ok") {
      auth.failureStage = "clerk_sign_in_failed";
    }
    throw err;
  }
}

function pickDeliverableId(result) {
  const files = result?.files;
  if (!Array.isArray(files)) return null;
  for (const f of files) {
    if (f && typeof f.id === "string" && f.id.length > 0) return f.id;
    if (f && typeof f.deliverableId === "string") return f.deliverableId;
  }
  const nested = result?.deliverables;
  if (Array.isArray(nested)) {
    for (const f of nested) {
      if (f && typeof f.id === "string") return f.id;
    }
  }
  return null;
}

function scanSecretsInUiText(text) {
  const t = String(text ?? "");
  const bad = [];
  if (/sk_live_|sk_test_|pk_live_|pk_test_/.test(t)) bad.push("clerk_key_pattern");
  if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(t)) bad.push("bearer_token_pattern");
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(t)) {
    bad.push("jwt_pattern");
  }
  if (/SUPABASE_SERVICE_ROLE|POSTGRES_URL|DATABASE_URL/.test(t)) {
    bad.push("infra_secret_name");
  }
  return bad;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const evidence = {
    ok: false,
    status: "RUNNING",
    appUrl: APP_URL,
    startedAt,
    endedAt: null,
    productionSha: null,
    productionShaShort: null,
    testUserA: redactId(USER_A),
    testUserB: redactId(USER_B),
    auth: null,
    jobId: null,
    correlationId: null,
    diagnosticId: null,
    aiExecution: null,
    completedDbState: null,
    artifactId: null,
    artifactType: null,
    storageExistence: null,
    uiArtifactVisible: null,
    download: null,
    notificationOrState: null,
    crossUserIsolated: null,
    secretsRedacted: null,
    durationMs: null,
    error: null,
    failureStage: null,
  };

  if (!CLERK_SECRET || !USER_A || !USER_B || !CLERK_PUBLISHABLE) {
    ownerSetupExit(
      "Missing CLERK_SECRET_KEY and/or CLERK_PUBLISHABLE_KEY|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and/or E2E_CLERK_USER_ID and/or E2E_CLERK_USER_B_ID",
    );
  }
  if (CLERK_SECRET.startsWith("sk_test_")) {
    ownerSetupExit("CLERK_SECRET_KEY must be Production sk_live_ (not sk_test_)");
  }
  if (!CLERK_PUBLISHABLE.startsWith("pk_live_")) {
    ownerSetupExit(
      "CLERK_PUBLISHABLE_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be Production pk_live_",
    );
  }
  if (USER_A === USER_B) {
    ownerSetupExit("E2E_CLERK_USER_ID and E2E_CLERK_USER_B_ID must be different");
  }

  // Ensure @clerk/testing helpers see canonical env names.
  process.env.CLERK_SECRET_KEY = CLERK_SECRET;
  process.env.CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE;

  try {
    const version = await fetchProductionVersion();
    evidence.productionSha = version.commitSha || null;
    evidence.productionShaShort = version.commitShaShort || null;
    if (!version.ok || version.environment !== "production") {
      throw new Error("production_version_not_ok");
    }

    const browser = await chromium.launch({ headless: true });
    let contextA;
    let page;
    try {
      const signedA = await signInWithClerkOfficial(browser, USER_A);
      contextA = signedA.context;
      page = signedA.page;
      evidence.auth = signedA.auth;
      evidence.notificationOrState = {
        signedInUrl: signedA.url,
        authApiStatus: signedA.auth.authApiStatus,
        clerkSetupOk: signedA.auth.clerkSetupOk,
        clerkSignInOk: signedA.auth.clerkSignInOk,
        protectedPageAccessible: signedA.auth.protectedPageAccessible,
      };

      let acceptedJobId = null;
      page.on("response", async (response) => {
        try {
          if (
            response.request().method() === "POST" &&
            response.url().includes("/api/work/jobs") &&
            !response.url().match(/\/api\/work\/jobs\/[^/]+$/)
          ) {
            if (response.status() === 202 || response.status() === 200) {
              const body = await response.json();
              if (body?.jobId) acceptedJobId = body.jobId;
            }
          }
        } catch {
          // ignore
        }
      });

      evidence.failureStage = "open_workspace";
      await page.goto(`${APP_URL}/workspace`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(1200);
      if (page.url().includes("/sign-in")) {
        throw new Error("workspace_requires_sign_in_after_clerk_official_auth");
      }

      evidence.failureStage = "submit_request";
      const textarea = page.locator(
        'textarea[aria-label="どの仕事を終わらせますか？"]',
      );
      await textarea.waitFor({ state: "visible", timeout: 30_000 });
      await textarea.fill(ASSIGNMENT);

      const formatToggle = page.getByRole("button", {
        name: /形式|フォーマット|Word|出力/i,
      });
      if (await formatToggle.count()) {
        try {
          await formatToggle.first().click({ timeout: 2000 });
          const select = page.locator("select");
          if (await select.count()) {
            await select.first().selectOption("docx").catch(() => null);
          }
        } catch {
          // first-run may hide format controls
        }
      }

      await page.getByRole("button", { name: "お願いする" }).click();

      const deadline = Date.now() + 8 * 60_000;
      let jobStatus = null;
      let jobBody = null;

      while (Date.now() < deadline && !acceptedJobId) {
        await page.waitForTimeout(500);
      }
      if (!acceptedJobId) {
        throw new Error("jobId_not_observed_from_POST_/api/work/jobs");
      }
      evidence.jobId = acceptedJobId;
      evidence.failureStage = "poll_job";

      while (Date.now() < deadline) {
        const poll = await page.request.get(
          `${APP_URL}/api/work/jobs/${encodeURIComponent(acceptedJobId)}`,
        );
        jobBody = await poll.json();
        jobStatus = jobBody?.status || null;
        if (jobStatus === "awaiting_confirmation") {
          const confirmBtn = page.getByRole("button", {
            name: /確認して実行|確認/,
          });
          if (await confirmBtn.count()) {
            await confirmBtn.first().click().catch(() => null);
          }
        }
        if (jobStatus === "completed" || jobStatus === "failed") break;
        await page.waitForTimeout(2000);
      }

      evidence.completedDbState = jobStatus;
      evidence.correlationId =
        jobBody?.correlationId ||
        jobBody?.result?.correlationId ||
        jobBody?.diagnosticId ||
        null;
      evidence.diagnosticId = jobBody?.diagnosticId || evidence.correlationId;
      evidence.aiExecution = {
        status: jobStatus,
        hasResult: Boolean(jobBody?.result),
        resultStatus: jobBody?.result?.status ?? null,
      };

      if (jobStatus !== "completed" || !jobBody?.result) {
        throw new Error(`job_not_completed status=${jobStatus}`);
      }

      const artifactId = pickDeliverableId(jobBody.result);
      evidence.artifactId = artifactId;
      const fileMeta = (
        jobBody.result.files ||
        jobBody.result.deliverables ||
        []
      ).find((f) => f && (f.id === artifactId || f.deliverableId === artifactId));
      evidence.artifactType =
        fileMeta?.format || fileMeta?.mimeType || fileMeta?.fileName || null;

      await page.waitForTimeout(1000);
      const uiText = (await page.locator("body").innerText()) || "";
      assertNoSecretLeak(uiText);
      const secretHits = scanSecretsInUiText(uiText);
      evidence.secretsRedacted = secretHits.length === 0;
      if (!evidence.secretsRedacted) {
        throw new Error(`ui_secret_leak:${secretHits.join(",")}`);
      }
      evidence.uiArtifactVisible =
        /ダウンロード|完成|完了|Word|docx|成果物|ファイル/i.test(uiText);
      evidence.notificationOrState = {
        ...(evidence.notificationOrState || {}),
        jobStatus,
        uiMentionsCompletion: /完了|完成|ダウンロード/i.test(uiText),
      };

      if (!artifactId) {
        throw new Error("artifactId_missing_from_completed_job");
      }

      evidence.failureStage = "download";
      const dl = await page.request.get(
        `${APP_URL}/api/deliverables/${encodeURIComponent(artifactId)}`,
      );
      const dlBuf = Buffer.from(await dl.body());
      const mime = dl.headers()["content-type"] || "";
      const disposition = dl.headers()["content-disposition"] || "";
      evidence.download = {
        httpStatus: dl.status(),
        mime,
        contentDispositionPresent: Boolean(disposition),
        bytes: dlBuf.byteLength,
        zipMagic: dlBuf.subarray(0, 2).toString("utf8") === "PK",
      };
      evidence.storageExistence =
        dl.status() === 200 &&
        dlBuf.byteLength > 32 &&
        evidence.download.zipMagic;

      if (!evidence.storageExistence) {
        throw new Error(
          `download_or_storage_failed status=${dl.status()} bytes=${dlBuf.byteLength}`,
        );
      }

      evidence.failureStage = "cross_user_isolation";
      const signedB = await signInWithClerkOfficial(browser, USER_B);
      try {
        const denied = await signedB.page.request.get(
          `${APP_URL}/api/deliverables/${encodeURIComponent(artifactId)}`,
        );
        evidence.crossUserIsolated =
          denied.status() === 404 ||
          denied.status() === 401 ||
          denied.status() === 403;
        if (!evidence.crossUserIsolated) {
          throw new Error(
            `cross_user_isolation_failed status=${denied.status()}`,
          );
        }
      } finally {
        await signedB.context.close();
      }

      evidence.ok = true;
      evidence.status = "PASS";
      evidence.failureStage = "complete";
    } finally {
      if (contextA) await contextA.close();
      await browser.close();
    }
  } catch (err) {
    if (err?.ownerSetup) {
      ownerSetupExit(String(err.message || err).slice(0, 400));
    }
    evidence.ok = false;
    evidence.status = "FAIL";
    evidence.error = String(err?.message || err).slice(0, 500);
    if (err?.auth) evidence.auth = err.auth;
    evidence.failureStage =
      err?.auth?.failureStage || evidence.failureStage || "unknown";
  }

  evidence.endedAt = new Date().toISOString();
  evidence.durationMs =
    Date.parse(evidence.endedAt) - Date.parse(evidence.startedAt);

  const outPath = join(OUT_DIR, `core-loop-${Date.now()}.json`);
  const serialized = JSON.stringify(evidence, null, 2);
  assertNoSecretLeak(serialized);
  writeFileSync(outPath, serialized);

  const summary = {
    ok: evidence.ok,
    status: evidence.status,
    evidencePath: outPath,
    productionShaShort: evidence.productionShaShort,
    failureStage: evidence.failureStage,
    clerkSetupOk: evidence.auth?.clerkSetupOk ?? null,
    clerkSignInOk: evidence.auth?.clerkSignInOk ?? null,
    testingTokenReady: evidence.auth?.testingTokenReady ?? null,
    agentTaskCreated: evidence.auth?.agentTaskCreated ?? null,
    agentTaskUrlPresent: evidence.auth?.agentTaskUrlPresent ?? null,
    initialHttpStatus: evidence.auth?.initialHttpStatus ?? null,
    redirectChain: evidence.auth?.redirectChain ?? null,
    finalUrlPath: evidence.auth?.finalUrlPath ?? null,
    clerkSessionDetected: evidence.auth?.clerkSessionDetected ?? null,
    authenticatedUserIdMatchesExpected:
      evidence.auth?.authenticatedUserIdMatchesExpected ?? null,
    authApiStatus: evidence.auth?.authApiStatus ?? null,
    protectedPageAccessible: evidence.auth?.protectedPageAccessible ?? null,
    authMethod: evidence.auth?.authMethod ?? null,
    jobId: evidence.jobId,
    artifactId: evidence.artifactId ? redactId(evidence.artifactId) : null,
    durationMs: evidence.durationMs,
    error: evidence.error,
    fingerprint: createHash("sha256").update(serialized).digest("hex").slice(0, 16),
    runNonce: randomUUID().slice(0, 8),
  };
  assertNoSecretLeak(JSON.stringify(summary));
  console.log(JSON.stringify(summary));

  if (!evidence.ok) process.exit(1);
}

main().catch((err) => {
  if (err?.ownerSetup) {
    ownerSetupExit(String(err.message || err).slice(0, 400));
  }
  console.error(
    JSON.stringify({
      ok: false,
      status: "FAIL",
      failureStage: err?.auth?.failureStage || "fatal",
      error: String(err?.message || err).slice(0, 500),
    }),
  );
  process.exit(1);
});
