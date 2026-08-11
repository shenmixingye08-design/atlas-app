#!/usr/bin/env node
/**
 * Sign in as E2E user A (official clerk.signIn) and GET /api/work/jobs/:id.
 * Used to recover Production failure fields for a known jobId.
 * Secrets never logged.
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
import { createHash } from "node:crypto";

const APP_URL = (process.env.ATLAS_APP_URL || "https://atlasapp.jp").replace(
  /\/$/,
  "",
);
const JOB_ID = process.env.DIAGNOSE_JOB_ID?.trim() || "";
const OUT =
  process.env.DIAGNOSE_OUT?.trim() ||
  join(process.cwd(), "tmp", "fetch-work-job");
const CLERK_SECRET = process.env.CLERK_SECRET_KEY?.trim() || "";
const CLERK_PUBLISHABLE =
  process.env.CLERK_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
  "";
const USER_A = process.env.E2E_CLERK_USER_ID?.trim() || "";

function redact(text) {
  return String(text ?? "")
    .replace(/sk_live_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/sk_test_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/pk_live_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT]")
    .slice(0, 4000);
}

function redactId(id) {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

async function resolveEmail(userId) {
  const client = createClerkClient({ secretKey: CLERK_SECRET });
  const user = await client.users.getUser(userId);
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const primary =
    emails.find((e) => e.id === user.primaryEmailAddressId) || emails[0];
  return primary?.emailAddress || null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!JOB_ID || !CLERK_SECRET || !CLERK_PUBLISHABLE || !USER_A) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing DIAGNOSE_JOB_ID / CLERK_* / E2E_CLERK_USER_ID",
      }),
    );
    process.exit(2);
  }

  process.env.CLERK_SECRET_KEY = CLERK_SECRET;
  process.env.CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE;

  await clerkSetup({
    publishableKey: CLERK_PUBLISHABLE,
    secretKey: CLERK_SECRET,
    dotenv: false,
  });

  const email = await resolveEmail(USER_A);
  if (!email) {
    console.error(JSON.stringify({ ok: false, error: "e2e_user_email_missing" }));
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();
  await setupClerkTestingToken({ context });

  try {
    await page.goto(`${APP_URL}/sign-in`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await clerk.signIn({ page, emailAddress: email });
    await page.waitForFunction(
      () => Boolean(window.Clerk?.user?.id),
      { timeout: 60_000 },
    );
    const uid = await page.evaluate(() => window.Clerk?.user?.id ?? null);
    if (uid !== USER_A) {
      throw new Error(`auth_user_mismatch got=${redactId(uid)}`);
    }

    const api = await page.request.get(
      `${APP_URL}/api/work/jobs/${encodeURIComponent(JOB_ID)}`,
    );
    const status = api.status();
    const bodyText = await api.text();
    let body = null;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: redact(bodyText).slice(0, 500) };
    }
    assertNoSecretLeak(bodyText);

    const vg = body?.visionGate || null;
    const evidence = {
      ok: status === 200 && body?.status != null,
      httpStatus: status,
      jobId: JOB_ID,
      fetchedAt: new Date().toISOString(),
      userIdRedacted: redactId(USER_A),
      status: body?.status ?? null,
      error: body?.error ? redact(body.error).slice(0, 500) : null,
      message: body?.message ? redact(body.message).slice(0, 500) : null,
      completedAt: body?.completedAt ?? null,
      visionGate: vg
        ? {
            analysisSuccess: vg.analysisSuccess ?? null,
            message: vg.message ? redact(vg.message).slice(0, 400) : null,
            diagnosticId: vg.diagnosticId ?? null,
            failedStage: vg.failedStage ?? null,
            failedStageLabel: vg.failedStageLabel ?? null,
            developerCode: vg.developerCode ?? null,
            cause: vg.cause ? redact(vg.cause).slice(0, 400) : null,
            openai: vg.openai
              ? {
                  httpStatus: vg.openai.httpStatus ?? null,
                  type: vg.openai.type ?? null,
                  code: vg.openai.code ?? null,
                  message: vg.openai.message
                    ? redact(vg.openai.message).slice(0, 400)
                    : null,
                  requestId: vg.openai.requestId ?? null,
                }
              : null,
            vercelRequestId: vg.vercelRequestId ?? null,
          }
        : null,
      resultPresent: Boolean(body?.result),
      resultStatus: body?.result?.status ?? null,
      resultKeys: body?.result ? Object.keys(body.result).slice(0, 40) : [],
      fileDeliverablesCount: Array.isArray(body?.result?.fileDeliverables)
        ? body.result.fileDeliverables.length
        : null,
      derived: {
        failedStage: vg?.failedStage ?? null,
        developerCode: vg?.developerCode ?? null,
        diagnosticId: vg?.diagnosticId ?? null,
      },
    };

    const path = join(OUT, `fetch-job-${JOB_ID}.json`);
    const serialized = JSON.stringify(evidence, null, 2);
    assertNoSecretLeak(serialized);
    writeFileSync(path, serialized);
    console.log(
      JSON.stringify({
        ok: evidence.ok,
        evidencePath: path,
        httpStatus: evidence.httpStatus,
        status: evidence.status,
        error: evidence.error,
        failedStage: evidence.derived.failedStage,
        developerCode: evidence.derived.developerCode,
        diagnosticId: evidence.derived.diagnosticId,
        fingerprint: createHash("sha256")
          .update(serialized)
          .digest("hex")
          .slice(0, 16),
      }),
    );
    process.exit(evidence.ok ? 0 : 1);
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

function assertNoSecretLeak(text) {
  const hay = String(text ?? "");
  if (CLERK_SECRET && hay.includes(CLERK_SECRET)) {
    throw new Error("secrets_redaction_failed");
  }
  if (/sk_live_[A-Za-z0-9]{10,}/.test(hay)) {
    throw new Error("secrets_redaction_failed_sk");
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({ ok: false, error: redact(err?.message || err) }),
  );
  process.exit(1);
});
