#!/usr/bin/env node
/**
 * Production CORE LOOP E2E (dedicated Clerk user + Sign-in Token).
 *
 * Secrets (never logged):
 *   CLERK_SECRET_KEY
 *   E2E_CLERK_USER_ID
 *   E2E_CLERK_USER_B_ID (required for isolation check)
 * Optional:
 *   ATLAS_APP_URL (default https://atlasapp.jp)
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 *
 * Exit codes:
 *   0 = PASS
 *   2 = OWNER_SETUP_REQUIRED (secrets/users missing)
 *   1 = FAIL (ran but core loop did not complete)
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

async function fetchProductionVersion() {
  const res = await fetch(`${APP_URL}/api/health/version`, {
    headers: { "cache-control": "no-store" },
  });
  const json = await res.json();
  return { httpStatus: res.status, ...json };
}

async function createSignInToken(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      expires_in_seconds: 300,
    }),
  });
  const text = await res.text();
  assertNoSecretLeak(text);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`clerk_sign_in_token_invalid_json status=${res.status}`);
  }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || json?.message || `status=${res.status}`;
    throw new Error(`clerk_sign_in_token_failed: ${msg}`);
  }
  const token = json.token;
  if (!token || typeof token !== "string") {
    throw new Error("clerk_sign_in_token_missing_token");
  }
  // Prefer Clerk-provided URL when present; never log the raw token.
  // Prefer Clerk-provided consume URL. Fallback uses documented __clerk_ticket query.
  const url =
    typeof json.url === "string" && json.url.startsWith("http")
      ? json.url
      : `${APP_URL}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`;
  return { url, tokenPresent: true, expiresInSeconds: 300 };
}

async function signInWithTicket(browser, ticketUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(ticketUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Ticket redeem may bounce through Clerk then app.
  await page.waitForURL(
    (url) => {
      const u = String(url);
      return (
        u.includes("/projects") ||
        u.includes("/today") ||
        u.includes("/workspace") ||
        (u.includes(APP_URL) && !u.includes("/sign-in") && !u.includes("/sign-up"))
      );
    },
    { timeout: 90_000 },
  ).catch(() => null);

  // Fallback: open /projects and ensure not bounced to sign-in.
  await page.goto(`${APP_URL}/projects`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const finalUrl = page.url();
  if (finalUrl.includes("/sign-in") || finalUrl.includes("/sign-up")) {
    await context.close();
    throw new Error(`ticket_sign_in_failed url=${finalUrl.split("?")[0]}`);
  }
  return { context, page, url: finalUrl.split("?")[0] };
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
      const ticketA = await createSignInToken(USER_A);
      const signedA = await signInWithTicket(browser, ticketA.url);
      contextA = signedA.context;
      page = signedA.page;
      evidence.notificationOrState = {
        ...(evidence.notificationOrState || {}),
        signedInUrl: signedA.url,
      };

      // Capture job accept from real UI path.
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
          // ignore parse errors
        }
      });

      await page.goto(`${APP_URL}/workspace`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(1200);
      if (page.url().includes("/sign-in")) {
        throw new Error("workspace_requires_sign_in_after_ticket");
      }

      const textarea = page.locator('textarea[aria-label="どの仕事を終わらせますか？"]');
      await textarea.waitFor({ state: "visible", timeout: 30_000 });
      await textarea.fill(ASSIGNMENT);

      // Prefer Word when format picker already unlocked; ignore if hidden (first-run).
      const formatToggle = page.getByRole("button", { name: /形式|フォーマット|Word|出力/i });
      if (await formatToggle.count()) {
        try {
          await formatToggle.first().click({ timeout: 2000 });
          const select = page.locator("select");
          if (await select.count()) {
            await select.first().selectOption("docx").catch(() => null);
          }
        } catch {
          // first-run may hide format controls — Word is in assignment text
        }
      }

      const submit = page.getByRole("button", { name: "お願いする" });
      await submit.click();

      // Wait for job id from network or poll UI/API via cookies.
      const deadline = Date.now() + 8 * 60_000;
      let jobStatus = null;
      let jobBody = null;

      while (Date.now() < deadline && !acceptedJobId) {
        await page.waitForTimeout(500);
      }
      if (!acceptedJobId) {
        // Confirmation path may use /api/commander instead; still require job accept on primary path.
        throw new Error("jobId_not_observed_from_POST_/api/work/jobs");
      }
      evidence.jobId = acceptedJobId;

      while (Date.now() < deadline) {
        const poll = await page.request.get(
          `${APP_URL}/api/work/jobs/${encodeURIComponent(acceptedJobId)}`,
        );
        jobBody = await poll.json();
        jobStatus = jobBody?.status || null;
        if (jobStatus === "awaiting_confirmation") {
          const confirmBtn = page.getByRole("button", { name: /確認して実行|確認/ });
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
      const fileMeta = (jobBody.result.files || jobBody.result.deliverables || []).find(
        (f) => f && (f.id === artifactId || f.deliverableId === artifactId),
      );
      evidence.artifactType =
        fileMeta?.format || fileMeta?.mimeType || fileMeta?.fileName || null;

      // UI visibility: FinalOutput download / result area
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
        dl.status() === 200 && dlBuf.byteLength > 32 && evidence.download.zipMagic;

      if (!evidence.storageExistence) {
        throw new Error(
          `download_or_storage_failed status=${dl.status()} bytes=${dlBuf.byteLength}`,
        );
      }

      // Cross-user isolation with user B session.
      const ticketB = await createSignInToken(USER_B);
      const signedB = await signInWithTicket(browser, ticketB.url);
      try {
        const denied = await signedB.page.request.get(
          `${APP_URL}/api/deliverables/${encodeURIComponent(artifactId)}`,
        );
        evidence.crossUserIsolated =
          denied.status() === 404 || denied.status() === 401 || denied.status() === 403;
        if (!evidence.crossUserIsolated) {
          throw new Error(`cross_user_isolation_failed status=${denied.status()}`);
        }
      } finally {
        await signedB.context.close();
      }

      evidence.ok = true;
      evidence.status = "PASS";
    } finally {
      if (contextA) await contextA.close();
      await browser.close();
    }
  } catch (err) {
    evidence.ok = false;
    evidence.status = "FAIL";
    evidence.error = String(err?.message || err).slice(0, 500);
  }

  evidence.endedAt = new Date().toISOString();
  evidence.durationMs =
    Date.parse(evidence.endedAt) - Date.parse(evidence.startedAt);

  const outPath = join(OUT_DIR, `core-loop-${Date.now()}.json`);
  const serialized = JSON.stringify(evidence, null, 2);
  assertNoSecretLeak(serialized);
  writeFileSync(outPath, serialized);
  console.log(
    JSON.stringify({
      ok: evidence.ok,
      status: evidence.status,
      evidencePath: outPath,
      productionShaShort: evidence.productionShaShort,
      jobId: evidence.jobId,
      artifactId: evidence.artifactId ? redactId(evidence.artifactId) : null,
      durationMs: evidence.durationMs,
      error: evidence.error,
      fingerprint: createHash("sha256").update(serialized).digest("hex").slice(0, 16),
      runNonce: randomUUID().slice(0, 8),
    }),
  );

  if (!evidence.ok) process.exit(1);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      status: "FAIL",
      error: String(err?.message || err).slice(0, 500),
    }),
  );
  process.exit(1);
});
