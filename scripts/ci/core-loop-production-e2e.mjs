#!/usr/bin/env node
/**
 * Production CORE LOOP E2E (dedicated Clerk user + Sign-in Token).
 *
 * Auth path (no app bypass):
 *   1) Backend API: POST /v1/sign_in_tokens
 *   2) Backend API: POST /v1/testing_tokens  (Production bot-protection bypass)
 *   3) Load atlasapp.jp so Clerk JS initializes
 *   4) clerk.client.signIn.create({ strategy: 'ticket', ticket }) + setActive
 *   5) Prove session via authenticated API (!= 401)
 *
 * Secrets (never logged):
 *   CLERK_SECRET_KEY
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
    const ticketQueryPresent =
      u.searchParams.has("__clerk_ticket") ||
      u.searchParams.has("ticket") ||
      u.pathname.includes("/ticket");
    const redacted = new URL(u.toString());
    for (const key of [
      "__clerk_ticket",
      "ticket",
      "__clerk_testing_token",
      "redirect_url",
    ]) {
      if (redacted.searchParams.has(key)) {
        redacted.searchParams.set(key, "[REDACTED]");
      }
    }
    return {
      origin: u.origin,
      pathname: u.pathname,
      ticketQueryPresent,
      redactedUrl: `${redacted.origin}${redacted.pathname}${redacted.search}`,
    };
  } catch {
    return {
      origin: null,
      pathname: null,
      ticketQueryPresent: false,
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

async function clerkBackendPost(path, body) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  assertNoSecretLeak(text);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`clerk_api_invalid_json path=${path} status=${res.status}`);
  }
  if (!res.ok) {
    const msg =
      json?.errors?.[0]?.message || json?.message || `status=${res.status}`;
    throw new Error(`clerk_api_failed path=${path}: ${msg}`);
  }
  return json;
}

async function createSignInToken(userId) {
  const json = await clerkBackendPost("/sign_in_tokens", {
    user_id: userId,
    expires_in_seconds: 300,
  });
  const token = json.token;
  if (!token || typeof token !== "string") {
    throw new Error("clerk_sign_in_token_missing_token");
  }
  const clerkUrl =
    typeof json.url === "string" && json.url.startsWith("http") ? json.url : null;
  // App URL with __clerk_ticket is the documented SignIn component consume form.
  const constructedUrl = `${APP_URL}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`;
  const preferredUrl = clerkUrl || constructedUrl;
  const meta = safeUrlMeta(preferredUrl);
  return {
    token,
    tokenCreated: true,
    clerkUrlPresent: Boolean(clerkUrl),
    preferredUrl,
    constructedUrlMeta: safeUrlMeta(constructedUrl),
    preferredUrlMeta: meta,
    ticketUrlConstructed: true,
    ticketQueryPresent: meta.ticketQueryPresent || Boolean(clerkUrl),
  };
}

async function createTestingToken() {
  // POST /v1/testing_tokens — empty JSON object is accepted by Clerk Backend API.
  const json = await clerkBackendPost("/testing_tokens", {});
  const token = json.token;
  if (!token || typeof token !== "string") {
    throw new Error("clerk_testing_token_missing_token");
  }
  return { token, tokenCreated: true };
}

/**
 * Establish a real Production Clerk session for expectedUserId.
 * Uses official ticket strategy + Production testing token (bot bypass).
 * Does NOT add app-level auth bypass.
 */
async function signInWithTicket(browser, expectedUserId) {
  const auth = {
    tokenCreated: false,
    testingTokenCreated: false,
    ticketUrlConstructed: false,
    ticketQueryPresent: false,
    clerkUrlPresent: false,
    initialHttpStatus: null,
    redirectChain: [],
    finalUrlPath: null,
    clerkSessionDetected: false,
    authenticatedUserIdMatchesExpected: false,
    authApiStatus: null,
    signInStatus: null,
    failureStage: "init",
    expectedUserIdRedacted: redactId(expectedUserId),
  };

  let signInToken;
  let testingToken;
  try {
    auth.failureStage = "create_sign_in_token";
    signInToken = await createSignInToken(expectedUserId);
    auth.tokenCreated = true;
    auth.ticketUrlConstructed = signInToken.ticketUrlConstructed;
    auth.ticketQueryPresent = signInToken.ticketQueryPresent;
    auth.clerkUrlPresent = signInToken.clerkUrlPresent;

    auth.failureStage = "create_testing_token";
    testingToken = await createTestingToken();
    auth.testingTokenCreated = true;
  } catch (err) {
    auth.failureStage = auth.failureStage || "token_api";
    const error = new Error(String(err?.message || err));
    error.auth = auth;
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

  // Official Production E2E pattern: attach __clerk_testing_token to Clerk FAPI calls.
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const isClerkFapi =
      url.includes("clerk.atlasapp.jp") ||
      url.includes(".clerk.accounts.") ||
      /\/v1\/client(\/|\?|$)/.test(url);
    if (!isClerkFapi) {
      await route.continue();
      return;
    }
    try {
      const u = new URL(url);
      if (!u.searchParams.has("__clerk_testing_token")) {
        u.searchParams.set("__clerk_testing_token", testingToken.token);
        await route.continue({ url: u.toString() });
        return;
      }
    } catch {
      // fall through
    }
    await route.continue();
  });

  try {
    auth.failureStage = "load_app_for_clerk_js";
    const homeResp = await page.goto(`${APP_URL}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    auth.initialHttpStatus = homeResp?.status() ?? null;

    auth.failureStage = "wait_clerk_js";
    await page.waitForFunction(
      () =>
        Boolean(
          window.Clerk &&
            (window.Clerk.loaded || window.Clerk.client || window.Clerk.session),
        ),
      { timeout: 60_000 },
    );

    auth.failureStage = "ticket_strategy_redeem";
    const redeem = await page.evaluate(async (ticket) => {
      const clerk = window.Clerk;
      if (!clerk) return { ok: false, stage: "clerk_missing" };
      try {
        if (typeof clerk.load === "function" && !clerk.client) {
          await clerk.load();
        }
        if (!clerk.client?.signIn) {
          return { ok: false, stage: "clerk_client_signin_missing" };
        }
        const signIn = await clerk.client.signIn.create({
          strategy: "ticket",
          ticket,
        });
        if (signIn.status === "complete" && signIn.createdSessionId) {
          await clerk.setActive({ session: signIn.createdSessionId });
          return {
            ok: true,
            status: signIn.status,
            userId: clerk.user?.id ?? null,
          };
        }
        return {
          ok: false,
          stage: "ticket_incomplete",
          status: signIn.status ?? null,
        };
      } catch (e) {
        return {
          ok: false,
          stage: "ticket_threw",
          message: String(e?.message || e).slice(0, 180),
        };
      }
    }, signInToken.token);

    auth.signInStatus = redeem.status || redeem.stage || null;
    if (!redeem.ok) {
      auth.failureStage = redeem.stage || "ticket_redeem_failed";
      // Fallback: navigate SignIn page with __clerk_ticket (still no bypass).
      auth.failureStage = "signin_page_ticket_fallback";
      const ticketPageUrl = `${APP_URL}/sign-in?__clerk_ticket=${encodeURIComponent(
        signInToken.token,
      )}&__clerk_testing_token=${encodeURIComponent(testingToken.token)}`;
      auth.ticketQueryPresent = true;
      await page.goto(ticketPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page
        .waitForFunction(
          () => Boolean(window.Clerk?.user?.id || window.Clerk?.session),
          { timeout: 45_000 },
        )
        .catch(() => null);
    }

    const sessionUserId = await page.evaluate(() => window.Clerk?.user?.id ?? null);
    auth.clerkSessionDetected = Boolean(sessionUserId);
    auth.authenticatedUserIdMatchesExpected = sessionUserId === expectedUserId;

    auth.failureStage = "auth_api_probe";
    const apiProbe = await page.request.get(`${APP_URL}/api/notifications`);
    auth.authApiStatus = apiProbe.status();

    auth.failureStage = "post_auth_navigation";
    await page.goto(`${APP_URL}/projects`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(1200);
    const finalUrl = page.url();
    auth.finalUrlPath = safeUrlMeta(finalUrl).pathname;

    if (finalUrl.includes("/sign-in") || finalUrl.includes("/sign-up")) {
      auth.failureStage = "ticket_sign_in_failed";
      const error = new Error(
        `ticket_sign_in_failed url=${finalUrl.split("?")[0]} stage=${auth.failureStage}`,
      );
      error.auth = auth;
      throw error;
    }
    if (!auth.clerkSessionDetected) {
      auth.failureStage = "clerk_session_missing";
      const error = new Error("clerk_session_missing_after_ticket");
      error.auth = auth;
      throw error;
    }
    if (!auth.authenticatedUserIdMatchesExpected) {
      auth.failureStage = "user_mismatch";
      const error = new Error(
        `authenticated_user_mismatch got=${redactId(sessionUserId)}`,
      );
      error.auth = auth;
      throw error;
    }
    if (auth.authApiStatus === 401) {
      auth.failureStage = "auth_api_still_401";
      const error = new Error("authenticated_api_still_401");
      error.auth = auth;
      throw error;
    }

    auth.failureStage = "auth_ok";
    return { context, page, url: finalUrl.split("?")[0], auth };
  } catch (err) {
    await context.close().catch(() => null);
    if (!err.auth) err.auth = auth;
    if (!auth.failureStage || auth.failureStage === "auth_ok") {
      auth.failureStage = "ticket_sign_in_failed";
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

  if (!CLERK_SECRET || !USER_A || !USER_B) {
    ownerSetupExit(
      "Missing CLERK_SECRET_KEY and/or E2E_CLERK_USER_ID and/or E2E_CLERK_USER_B_ID",
    );
  }
  if (CLERK_SECRET.startsWith("sk_test_")) {
    ownerSetupExit("CLERK_SECRET_KEY must be Production sk_live_ (not sk_test_)");
  }
  if (USER_A === USER_B) {
    ownerSetupExit("E2E_CLERK_USER_ID and E2E_CLERK_USER_B_ID must be different");
  }

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
      const signedA = await signInWithTicket(browser, USER_A);
      contextA = signedA.context;
      page = signedA.page;
      evidence.auth = signedA.auth;
      evidence.notificationOrState = {
        signedInUrl: signedA.url,
        authApiStatus: signedA.auth.authApiStatus,
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
        throw new Error("workspace_requires_sign_in_after_ticket");
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
      const signedB = await signInWithTicket(browser, USER_B);
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
    tokenCreated: evidence.auth?.tokenCreated ?? null,
    testingTokenCreated: evidence.auth?.testingTokenCreated ?? null,
    ticketUrlConstructed: evidence.auth?.ticketUrlConstructed ?? null,
    ticketQueryPresent: evidence.auth?.ticketQueryPresent ?? null,
    initialHttpStatus: evidence.auth?.initialHttpStatus ?? null,
    redirectChain: evidence.auth?.redirectChain ?? null,
    finalUrlPath: evidence.auth?.finalUrlPath ?? null,
    clerkSessionDetected: evidence.auth?.clerkSessionDetected ?? null,
    authenticatedUserIdMatchesExpected:
      evidence.auth?.authenticatedUserIdMatchesExpected ?? null,
    authApiStatus: evidence.auth?.authApiStatus ?? null,
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
