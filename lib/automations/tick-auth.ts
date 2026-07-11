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
 * In non-production, any signed-in user may tick (local UI).
 * In production, only CRON_SECRET or an ATLAS owner may tick.
 */
export async function authorizeAutomationTick(
  request: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
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
      return {
        ok: false,
        status: 503,
        error: "CRON_SECRET is not configured",
      };
    }
    if (await checkAtlasOwner()) return { ok: true };
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { userId } = await auth();
  if (userId) return { ok: true };

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured",
    };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}
