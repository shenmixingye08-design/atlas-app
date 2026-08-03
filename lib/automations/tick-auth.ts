import "server-only";

import { timingSafeEqual } from "crypto";
import { auth } from "@clerk/nextjs/server";

import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { isAtlasProduction } from "@/lib/runtime/is-production";

function readCronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Accept Vercel Cron Bearer secret.
 * Non-production: any signed-in user may tick (local UI).
 * Production: CRON_SECRET or ATLAS owner only.
 * Fail-closed: never returns ok when production secret is missing.
 */
export type AutomationTickAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      /** Fail-fast diagnostic code for Scheduler audit / ops (never a success path). */
      diagnosticCode:
        | "cron_secret_missing"
        | "cron_secret_mismatch_or_unauthorized"
        | "cron_unauthorized";
    };

export async function authorizeAutomationTick(
  request: Request,
): Promise<AutomationTickAuthResult> {
  const secret = readCronSecret();
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");

  if (secret) {
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length).trim();
      if (safeEqualString(token, secret)) return { ok: true };
    }
    if (headerSecret && safeEqualString(headerSecret, secret)) {
      return { ok: true };
    }
  }

  if (isAtlasProduction()) {
    if (!secret) {
      console.error(
        "[scheduler-audit] FAIL_CLOSED cron_secret_missing env=production",
      );
      return {
        ok: false,
        status: 503,
        error: "CRON_SECRET is not configured",
        diagnosticCode: "cron_secret_missing",
      };
    }
    if (await checkAtlasOwner()) return { ok: true };
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      diagnosticCode: "cron_secret_mismatch_or_unauthorized",
    };
  }

  const { userId } = await auth();
  if (userId) return { ok: true };

  if (!secret) {
    console.error(
      "[scheduler-audit] FAIL_CLOSED cron_secret_missing env=non-production",
    );
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured",
      diagnosticCode: "cron_secret_missing",
    };
  }

  return {
    ok: false,
    status: 401,
    error: "Unauthorized",
    diagnosticCode: "cron_unauthorized",
  };
}
