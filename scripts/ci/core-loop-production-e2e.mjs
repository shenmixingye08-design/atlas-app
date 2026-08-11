#!/usr/bin/env node
/**
 * Production CORE LOOP E2E — Clerk official Playwright helpers (no app bypass).
 *
 * Auth path (Clerk docs / Production Testing Tokens changelog):
 *   1) clerkSetup() — mint Testing Token (works on Production instances)
 *   2) Resolve optional email via Backend API from E2E_CLERK_USER_ID
 *      (E2E users may have no emailAddresses — do NOT require Email/Password)
 *   3) page.goto(/sign-in) so Clerk loads (no ticket query)
 *   4) Auth paths (in order):
 *      A) clerk.signIn({ emailAddress }) when email exists
 *      B) Sign-in Token token.url accept (/v1/tickets/accept) by userId
 *      C) client.signIn.create({ strategy:'ticket' }) with fresh userId token
 *      D) Backend sessions.createSession + real __session JWT cookie (fallback)
 *         — always reached even when Path C times out (withTimeout must not abort)
 *   5) Prove session: Clerk.user.id OR (Backend JWT cookie + API 200) + protected page
 *
 * NOT used:
 *   - Agent Tasks API (not present in this Production Dashboard)
 *   - ticket-query sign-in URL primary path (prior Production FAIL)
 *   - App auth bypass / middleware skip / mock auth
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
import { createClerkClient } from "@clerk/backend";
import { parsePublishableKey } from "@clerk/shared/keys";
import {
  clerk,
  clerkSetup,
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

function redactEmail(email) {
  if (!email || typeof email !== "string") return null;
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email.slice(0, 2)}…@${email.slice(at + 1)}`;
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
    return {
      origin: u.origin,
      pathname: u.pathname,
      redactedUrl: `${redacted.origin}${redacted.pathname}${redacted.search}`,
    };
  } catch {
    return { origin: null, pathname: null, redactedUrl: null };
  }
}

function sanitizeClerkError(err) {
  const raw = String(err?.message || err || "");
  return raw
    .replace(/sk_live_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/sk_test_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/pk_live_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/pk_test_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .slice(0, 280);
}

async function fetchProductionVersion() {
  const res = await fetch(`${APP_URL}/api/health/version`, {
    headers: { "cache-control": "no-store" },
  });
  const json = await res.json();
  return { httpStatus: res.status, ...json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until Production /api/health/version matches the expected git SHA.
 * Avoids racing Vercel Production deploy after merge-to-main (evidence run
 * 31471647287 ran against stale SHA d513789 while main was already b2e1029).
 */
async function waitForProductionSha(expectedSha, { timeoutMs = 10 * 60_000 } = {}) {
  const full = String(expectedSha || "").trim();
  if (!full || full.length < 7) return null;
  const short = full.slice(0, 7);
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fetchProductionVersion().catch((err) => ({
      ok: false,
      error: sanitizeClerkError(err),
    }));
    const got = last?.commitSha || "";
    const gotShort = last?.commitShaShort || got.slice(0, 7);
    if (
      last?.ok &&
      last?.environment === "production" &&
      (got === full || gotShort === short || got.startsWith(short))
    ) {
      console.log(
        JSON.stringify({
          progress: "production_sha_matched",
          expectedShort: short,
          productionShaShort: gotShort,
        }),
      );
      return last;
    }
    console.log(
      JSON.stringify({
        progress: "wait_production_sha",
        expectedShort: short,
        productionShaShort: gotShort || null,
        environment: last?.environment ?? null,
      }),
    );
    await sleep(15_000);
  }
  throw new Error(
    `production_sha_timeout expected=${short} last=${last?.commitShaShort || last?.commitSha || "null"}`,
  );
}

function buildClerkClient() {
  return createClerkClient({ secretKey: CLERK_SECRET });
}

/**
 * Safe pairing check: publishable frontendApi + secret can read E2E user.
 * Does not log key material.
 */
async function verifyInstancePairing(expectedUserId) {
  const parsed = parsePublishableKey(CLERK_PUBLISHABLE);
  const frontendApi =
    typeof parsed?.frontendApi === "string" ? parsed.frontendApi : null;
  if (!frontendApi) {
    throw Object.assign(new Error("publishable_key_frontend_api_unparsed"), {
      ownerSetup: true,
    });
  }

  const client = buildClerkClient();
  let user;
  try {
    user = await client.users.getUser(expectedUserId);
  } catch (err) {
    throw Object.assign(
      new Error(
        `OWNER_SETUP_REQUIRED: CLERK_SECRET_KEY cannot read E2E_CLERK_USER_ID (instance mismatch or wrong user). detail=${sanitizeClerkError(err)}`,
      ),
      { ownerSetup: true },
    );
  }

  const appHost = new URL(APP_URL).hostname;
  // Production custom FAPI is typically clerk.<app-domain>.
  const frontendApiMatchesApp =
    frontendApi === `clerk.${appHost}` ||
    frontendApi.endsWith(`.${appHost}`) ||
    frontendApi.includes("atlasapp");

  return {
    publishableFrontendApi: frontendApi,
    secretCanReadE2EUser: user.id === expectedUserId,
    frontendApiMatchesAppHost: frontendApiMatchesApp,
    instancePairOk:
      user.id === expectedUserId && Boolean(frontendApi) && frontendApiMatchesApp,
  };
}

async function resolveUserEmailOrNull(userId) {
  const client = buildClerkClient();
  const user = await client.users.getUser(userId);
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const primary =
    emails.find((e) => e.id === user.primaryEmailAddressId) || emails[0];
  const email =
    primary && typeof primary.emailAddress === "string"
      ? primary.emailAddress
      : null;
  return { email, userId: user.id };
}

async function collectAuthDiagnostics(page) {
  const cookies = await page.context().cookies();
  const cookieNames = cookies
    .filter((c) => /clerk|__session|__client/i.test(c.name))
    .map((c) => c.name)
    .sort();
  // Domains only (never values) — critical to detect accounts.* vs app host cookies.
  const cookieDomains = [
    ...new Set(
      cookies
        .filter((c) => /clerk|__session|__client/i.test(c.name))
        .map((c) => `${c.name}@${c.domain}`),
    ),
  ].sort();
  const clerkState = await page
    .evaluate(() => ({
      clerkLoaded: Boolean(window.Clerk?.loaded),
      hasUser: Boolean(window.Clerk?.user?.id),
      hasSession: Boolean(window.Clerk?.session?.id),
      hasClientSignIn: Boolean(window.Clerk?.client?.signIn?.create),
      userIdPrefix:
        typeof window.Clerk?.user?.id === "string"
          ? window.Clerk.user.id.slice(0, 6)
          : null,
    }))
    .catch(() => ({
      clerkLoaded: false,
      hasUser: false,
      hasSession: false,
      hasClientSignIn: false,
      userIdPrefix: null,
    }));
  return { cookieNames, cookieDomains, clerkState };
}

/**
 * Establish Production Clerk session via official clerk.signIn({ emailAddress }).
 */
async function signInWithClerkOfficial(browser, expectedUserId) {
  const auth = {
    clerkSetupOk: false,
    clerkSignInOk: false,
    clerkSessionDetected: false,
    authenticatedUserIdMatchesExpected: false,
    authApiStatus: null,
    authApiErrorCode: null,
    protectedPageAccessible: false,
    instancePairOk: false,
    publishableFrontendApi: null,
    secretCanReadE2EUser: false,
    frontendApiMatchesAppHost: false,
    emailResolved: false,
    emailRedacted: null,
    signInPath: "clerk.signIn.emailAddress",
    signInTokenCreated: false,
    acceptUrlPresent: false,
    acceptUrlOrigin: null,
    acceptUrlPath: null,
    initialHttpStatus: null,
    redirectChain: [],
    finalUrlPath: null,
    cookieNames: null,
    cookieDomains: null,
    clerkState: null,
    ticketRedeemStatus: null,
    ticketRedeemError: null,
    backendSessionCreated: false,
    backendSessionTokenMinted: false,
    cookieSuffix: null,
    signInError: null,
    failureStage: "init",
    authMethod: "clerk_testing_userid_token",
    expectedUserIdRedacted: redactId(expectedUserId),
  };

  try {
    auth.failureStage = "verify_instance_pairing";
    const pair = await verifyInstancePairing(expectedUserId);
    auth.publishableFrontendApi = pair.publishableFrontendApi;
    auth.secretCanReadE2EUser = pair.secretCanReadE2EUser;
    auth.frontendApiMatchesAppHost = pair.frontendApiMatchesAppHost;
    auth.instancePairOk = pair.instancePairOk;
    if (!pair.instancePairOk) {
      throw Object.assign(
        new Error(
          `OWNER_SETUP_REQUIRED: publishable/secret/user instance pairing failed frontendApi=${pair.publishableFrontendApi} secretCanReadUser=${pair.secretCanReadE2EUser} frontendApiMatchesApp=${pair.frontendApiMatchesAppHost}`,
        ),
        { ownerSetup: true },
      );
    }
  } catch (err) {
    if (!err.auth) err.auth = auth;
    throw err;
  }

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
    auth.signInError = sanitizeClerkError(err);
    const error = new Error(`clerk_setup_failed: ${auth.signInError}`);
    error.auth = auth;
    throw error;
  }

  let email = null;
  try {
    auth.failureStage = "resolve_user_email";
    const resolved = await resolveUserEmailOrNull(expectedUserId);
    email = resolved.email;
    auth.emailResolved = Boolean(email);
    auth.emailRedacted = redactEmail(email);
  } catch (err) {
    if (!err.auth) err.auth = auth;
    throw err;
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  // Playwright library default timeout is 0 (unlimited). @clerk/testing helpers
  // call waitForFunction without an explicit timeout — without this, a failed
  // sign-in hangs until the GitHub job limit (evidence: run 31467514024).
  context.setDefaultTimeout(60_000);
  context.setDefaultNavigationTimeout(60_000);
  const page = await context.newPage();

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const meta = safeUrlMeta(frame.url());
    if (meta.pathname) {
      auth.redirectChain.push(meta.pathname);
      if (auth.redirectChain.length > 20) auth.redirectChain.shift();
    }
  });

  async function waitForSessionUserId(timeoutMs = 45_000) {
    await page
      .waitForFunction(
        () => Boolean(window.Clerk?.loaded && window.Clerk?.user?.id),
        { timeout: timeoutMs },
      )
      .catch(() => null);
    return page.evaluate(() => window.Clerk?.user?.id ?? null).catch(() => null);
  }

  async function withTimeout(promise, ms, label) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timeout_${label}_${ms}ms`)),
            ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function openPublicClerkPage() {
    // Prefer /sign-in (public, guaranteed Clerk bootstrap) without ticket query.
    console.log(
      JSON.stringify({
        progress: "open_public_clerk_page",
        expectedUserIdRedacted: auth.expectedUserIdRedacted,
      }),
    );
    const publicResp = await page.goto(`${APP_URL}/sign-in`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (auth.initialHttpStatus == null) {
      auth.initialHttpStatus = publicResp?.status() ?? null;
    }
    await withTimeout(clerk.loaded({ page }), 45_000, "clerk_loaded").catch(
      () => null,
    );
  }

  async function mintSignInToken() {
    const client = buildClerkClient();
    const token = await client.signInTokens.createSignInToken({
      userId: expectedUserId,
      expiresInSeconds: 300,
    });
    if (!token?.token) throw new Error("sign_in_token_missing");
    auth.signInTokenCreated = true;
    return token;
  }

  async function consumeAcceptUrl(token) {
    const candidates = [];
    if (typeof token.url === "string" && token.url.startsWith("http")) {
      candidates.push(token.url);
    }
    // Explicit FAPI ticket accept (Clerk JS allowlist includes /v1/tickets/accept).
    if (auth.publishableFrontendApi && token.token) {
      candidates.push(
        `https://${auth.publishableFrontendApi}/v1/tickets/accept?ticket=${encodeURIComponent(token.token)}&redirect_url=${encodeURIComponent(`${APP_URL}/projects`)}`,
      );
    }
    auth.acceptUrlPresent = candidates.length > 0;
    if (!candidates.length) return false;

    const testing = process.env.CLERK_TESTING_TOKEN;
    const appOrigin = new URL(APP_URL).origin;
    for (const acceptUrl of candidates) {
      const acceptMeta = safeUrlMeta(acceptUrl);
      auth.acceptUrlOrigin = acceptMeta.origin;
      auth.acceptUrlPath = acceptMeta.pathname;
      let navUrl = acceptUrl;
      try {
        const u = new URL(acceptUrl);
        if (testing && !u.searchParams.has("__clerk_testing_token")) {
          u.searchParams.set("__clerk_testing_token", testing);
        }
        navUrl = u.toString();
      } catch {
        // use raw
      }
      console.log(
        JSON.stringify({
          progress: "consume_accept_url",
          origin: acceptMeta.origin,
          path: acceptMeta.pathname,
        }),
      );
      await page.goto(navUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
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
            { timeout: 45_000 },
          )
          .catch(() => null);
      }
      if (!page.url().startsWith(appOrigin)) {
        await page.goto(`${APP_URL}/projects`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
      }
      const uid = await waitForSessionUserId(15_000);
      if (uid === expectedUserId) return true;
    }
    return false;
  }

  async function redeemTicketOnApp(ticket) {
    await setupClerkTestingToken({ page });
    await openPublicClerkPage();
    const result = await page.evaluate(async (t) => {
      const work = async () => {
        if (!window.Clerk?.client?.signIn?.create) {
          return { ok: false, error: "missing_client_signIn_create" };
        }
        const signIn = await window.Clerk.client.signIn.create({
          strategy: "ticket",
          ticket: t,
        });
        if (signIn.status === "complete" && signIn.createdSessionId) {
          await window.Clerk.setActive({ session: signIn.createdSessionId });
          return {
            ok: true,
            status: signIn.status,
            userId: window.Clerk.user?.id ?? null,
          };
        }
        return {
          ok: false,
          status: signIn.status ?? null,
          error: `incomplete_status:${signIn.status}`,
        };
      };
      try {
        return await Promise.race([
          work(),
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ ok: false, error: "browser_ticket_create_timeout" }),
              20_000,
            ),
          ),
        ]);
      } catch (e) {
        return {
          ok: false,
          error: String(e?.message || e).slice(0, 220),
        };
      }
    }, ticket);
    auth.ticketRedeemStatus = result?.status ?? null;
    auth.ticketRedeemError = result?.error
      ? sanitizeClerkError(result.error)
      : null;
    return result;
  }

  /**
   * Backend Session API → real session JWT → Clerk __session cookie(s).
   * Not a fixed/fake cookie: JWT is minted by Clerk for the real E2E userId.
   * Used when client ticket redeem hangs under Production bot protection.
   */
  async function signInViaBackendSession() {
    auth.failureStage = "backend_create_session";
    console.log(JSON.stringify({ progress: "backend_create_session" }));
    const client = buildClerkClient();
    let session;
    try {
      session = await client.sessions.createSession({
        userId: expectedUserId,
      });
    } catch (err) {
      auth.signInError = sanitizeClerkError(err);
      return { ok: false, error: auth.signInError };
    }
    auth.backendSessionCreated = Boolean(session?.id);
    const tokenObj = await client.sessions.getToken(session.id);
    const jwt = typeof tokenObj?.jwt === "string" ? tokenObj.jwt : null;
    if (!jwt) {
      return { ok: false, error: "session_jwt_missing" };
    }
    auth.backendSessionTokenMinted = true;

    // Detect Clerk cookie suffix from existing client_uat_* cookies when present.
    const existing = await context.cookies();
    const suffixMatch = existing
      .map((c) => c.name)
      .find((n) => n.startsWith("__client_uat_"));
    const suffix = suffixMatch ? suffixMatch.slice("__client_uat_".length) : null;
    auth.cookieSuffix = suffix;

    const cookieNames = suffix
      ? [`__session_${suffix}`, "__session"]
      : ["__session"];
    // Clerk middleware often pairs session JWT with client_uat; set both.
    const uatValue = String(Math.floor(Date.now() / 1000));
    const uatNames = suffix
      ? [`__client_uat_${suffix}`, "__client_uat"]
      : ["__client_uat"];
    const domains = [".atlasapp.jp", "atlasapp.jp"];
    const cookies = [];
    for (const domain of domains) {
      for (const name of cookieNames) {
        cookies.push({
          name,
          value: jwt,
          domain,
          path: "/",
          secure: true,
          httpOnly: false,
          sameSite: "Lax",
        });
      }
      for (const name of uatNames) {
        cookies.push({
          name,
          value: uatValue,
          domain,
          path: "/",
          secure: true,
          httpOnly: false,
          sameSite: "Lax",
        });
      }
    }
    await context.addCookies(cookies);
    auth.signInPath = "backend_session_cookie";
    await page.goto(`${APP_URL}/projects`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    return { ok: true, sessionIdPrefix: String(session.id).slice(0, 8) };
  }

  try {
    const pathErrors = [];
    auth.failureStage = "open_public_clerk_page";
    await openPublicClerkPage();

    // Path A: official email helper when the E2E user has an email identifier.
    if (email) {
      auth.failureStage = "clerk_sign_in_email";
      console.log(JSON.stringify({ progress: "clerk_sign_in_email" }));
      try {
        await withTimeout(
          clerk.signIn({ page, emailAddress: email }),
          60_000,
          "clerk_sign_in_email",
        );
        auth.signInPath = "clerk.signIn.emailAddress";
      } catch (err) {
        pathErrors.push(`email:${sanitizeClerkError(err)}`);
        auth.signInError = sanitizeClerkError(err);
        email = null; // fall through to userId token paths
      }
    }

    // Path B/C: userId Sign-in Token (works when emailAddresses is empty).
    // Production evidence (run 31466769298): E2E users had no email on record.
    let sessionProbe = await waitForSessionUserId(8_000);
    if (sessionProbe === expectedUserId) {
      auth.signInPath = auth.signInPath || "clerk.signIn.emailAddress";
    } else {
      auth.failureStage = "clerk_ticket_accept_url";
      auth.signInPath = "sign_in_token.accept_url";
      console.log(JSON.stringify({ progress: "clerk_ticket_accept_url" }));
      const token = await mintSignInToken();
      const usedAccept = await consumeAcceptUrl(token);
      sessionProbe = await waitForSessionUserId(25_000);
      if (sessionProbe !== expectedUserId) {
        auth.failureStage = "clerk_ticket_redeem_on_app";
        auth.signInPath = usedAccept
          ? "ticket_redeem_after_accept"
          : "ticket_redeem_on_app";
        console.log(
          JSON.stringify({ progress: "clerk_ticket_redeem_on_app" }),
        );
        // Mint a fresh token — accept URL may have consumed the previous one.
        // Production evidence (31470602669 / 31471647287): client ticket create
        // can hang under bot protection. withTimeout MUST NOT abort the outer
        // try — otherwise Path D Backend session never runs.
        const token2 = await mintSignInToken();
        let redeemed = null;
        try {
          redeemed = await withTimeout(
            redeemTicketOnApp(token2.token),
            // Shorter when no email: Path D is the proven fallback.
            email ? 45_000 : 25_000,
            "ticket_redeem_on_app",
          );
        } catch (err) {
          redeemed = { ok: false, error: sanitizeClerkError(err) };
          pathErrors.push(`ticket_redeem:${redeemed.error}`);
          auth.signInError = pathErrors.join(" | ").slice(0, 280);
          auth.ticketRedeemError = redeemed.error;
        }
        if (!redeemed?.ok) {
          if (!pathErrors.some((e) => e.startsWith("ticket_redeem:"))) {
            pathErrors.push(
              `ticket_redeem:${redeemed?.error || redeemed?.status || "failed"}`,
            );
          }
          auth.signInError = pathErrors.join(" | ").slice(0, 280);
          // Path D: Backend createSession + session JWT cookies (real Clerk session).
          const backend = await signInViaBackendSession();
          if (!backend.ok) {
            pathErrors.push(`backend_session:${backend.error}`);
            auth.signInError = pathErrors.join(" | ").slice(0, 280);
            throw new Error(auth.signInError);
          }
        }
      }
    }

    // If still unsigned after token paths (e.g. accept URL left us on /sign-in), try Backend session.
    // Also covers cases where ticket redeem "succeeded" in status but no session cookie landed.
    sessionProbe = await waitForSessionUserId(8_000);
    if (sessionProbe !== expectedUserId) {
      const apiProbeEarly = await page.request
        .get(`${APP_URL}/api/notifications`)
        .catch(() => null);
      if (apiProbeEarly?.status() !== 200) {
        if (!auth.backendSessionCreated) {
          const backend = await signInViaBackendSession();
          if (!backend.ok) {
            pathErrors.push(`backend_session_final:${backend.error}`);
            auth.signInError = pathErrors.join(" | ").slice(0, 280);
          }
        }
      }
    }

    auth.failureStage = "wait_clerk_session";
    let sessionUserId = await waitForSessionUserId(20_000);

    // If Clerk JS user is set but cookies may lag, reload once on app origin.
    if (sessionUserId === expectedUserId) {
      await page.goto(`${APP_URL}/projects`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      sessionUserId = await waitForSessionUserId(20_000);
    }

    const diag = await collectAuthDiagnostics(page);
    auth.cookieNames = diag.cookieNames;
    auth.cookieDomains = diag.cookieDomains;
    auth.clerkState = diag.clerkState;

    auth.failureStage = "auth_api_probe";
    const apiProbe = await page.request.get(`${APP_URL}/api/notifications`);
    auth.authApiStatus = apiProbe.status();
    if (auth.authApiStatus !== 200) {
      const bodyText = await apiProbe.text().catch(() => "");
      assertNoSecretLeak(bodyText);
      try {
        const body = JSON.parse(bodyText);
        auth.authApiErrorCode =
          typeof body?.error === "string" ? body.error.slice(0, 80) : "non_200";
      } catch {
        auth.authApiErrorCode = `http_${auth.authApiStatus}`;
      }
    }

    // Session proof: Clerk.user OR (Backend-minted session cookie + authenticated API).
    const sessionCookiePresent = (auth.cookieNames || []).some((n) =>
      n.startsWith("__session"),
    );
    auth.clerkSessionDetected = Boolean(
      sessionUserId || (sessionCookiePresent && auth.authApiStatus === 200),
    );
    auth.authenticatedUserIdMatchesExpected =
      sessionUserId === expectedUserId ||
      (auth.backendSessionTokenMinted &&
        auth.authApiStatus === 200 &&
        auth.backendSessionCreated);
    auth.clerkSignInOk =
      auth.clerkSessionDetected && auth.authenticatedUserIdMatchesExpected;

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
        `clerkSignInOk=false session=${auth.clerkSessionDetected} userMatch=${auth.authenticatedUserIdMatchesExpected} path=${auth.finalUrlPath} signInError=${auth.signInError || "null"} cookies=${(auth.cookieNames || []).join(",")}`,
      );
    }
    if (auth.authApiStatus !== 200) {
      auth.failureStage =
        auth.authApiStatus === 401 ? "auth_api_still_401" : "auth_api_not_200";
      throw new Error(
        `authenticated_api_status_${auth.authApiStatus} error=${auth.authApiErrorCode}`,
      );
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
    const diag = await collectAuthDiagnostics(page).catch(() => null);
    if (diag) {
      auth.cookieNames = diag.cookieNames;
      auth.cookieDomains = diag.cookieDomains;
      auth.clerkState = diag.clerkState;
    }
    await context.close().catch(() => null);
    if (!err.auth) err.auth = auth;
    if (!auth.failureStage || auth.failureStage === "auth_ok") {
      auth.failureStage = "clerk_sign_in_failed";
    }
    if (!auth.signInError) auth.signInError = sanitizeClerkError(err);
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

  process.env.CLERK_SECRET_KEY = CLERK_SECRET;
  process.env.CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE;

  try {
    const expectSha =
      process.env.CORE_LOOP_EXPECT_SHA?.trim() ||
      process.env.GITHUB_SHA?.trim() ||
      "";
    const version = expectSha
      ? await waitForProductionSha(expectSha)
      : await fetchProductionVersion();
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
        instancePairOk: signedA.auth.instancePairOk,
        signInPath: signedA.auth.signInPath,
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
    evidence.error = sanitizeClerkError(err).slice(0, 500);
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
    instancePairOk: evidence.auth?.instancePairOk ?? null,
    publishableFrontendApi: evidence.auth?.publishableFrontendApi ?? null,
    emailResolved: evidence.auth?.emailResolved ?? null,
    signInPath: evidence.auth?.signInPath ?? null,
    initialHttpStatus: evidence.auth?.initialHttpStatus ?? null,
    redirectChain: evidence.auth?.redirectChain ?? null,
    finalUrlPath: evidence.auth?.finalUrlPath ?? null,
    clerkSessionDetected: evidence.auth?.clerkSessionDetected ?? null,
    authenticatedUserIdMatchesExpected:
      evidence.auth?.authenticatedUserIdMatchesExpected ?? null,
    authApiStatus: evidence.auth?.authApiStatus ?? null,
    authApiErrorCode: evidence.auth?.authApiErrorCode ?? null,
    protectedPageAccessible: evidence.auth?.protectedPageAccessible ?? null,
    cookieNames: evidence.auth?.cookieNames ?? null,
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
    ownerSetupExit(sanitizeClerkError(err).slice(0, 400));
  }
  console.error(
    JSON.stringify({
      ok: false,
      status: "FAIL",
      failureStage: err?.auth?.failureStage || "fatal",
      error: sanitizeClerkError(err).slice(0, 500),
    }),
  );
  process.exit(1);
});
