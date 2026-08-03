import "server-only";

import { timingSafeEqual } from "crypto";
import { auth } from "@clerk/nextjs/server";

import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";

import { isSchedulerProductionEnv, resolveSchedulerEnvironment } from "./env";
import { SCHEDULER_SECRET_COMPAT_UNTIL } from "./types";

const MIN_SECRET_LENGTH = 16;

export type SchedulerAuthOk = {
  ok: true;
  via: "scheduler_secret" | "cron_secret_compat" | "owner";
};

export type SchedulerAuthFail = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
  diagnosticCode:
    | "scheduler_secret_missing"
    | "scheduler_secret_invalid"
    | "scheduler_secret_mismatch"
    | "scheduler_unauthorized"
    | "scheduler_method_not_allowed";
};

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function validateSecretFormat(value: string): boolean {
  if (value.length < MIN_SECRET_LENGTH) return false;
  if (/\s/.test(value)) return false;
  // Reject obvious placeholders.
  if (/^(changeme|secret|password|test)$/i.test(value)) return false;
  return true;
}

/**
 * Primary: SCHEDULER_CRON_SECRET
 * Compat until SCHEDULER_SECRET_COMPAT_UNTIL: CRON_SECRET
 */
export function readSchedulerSecrets(): {
  primary: string | null;
  compat: string | null;
  configured: boolean;
  usingCompatOnly: boolean;
} {
  const primary = process.env.SCHEDULER_CRON_SECRET?.trim() || null;
  const compat = process.env.CRON_SECRET?.trim() || null;
  const primaryOk = primary && validateSecretFormat(primary) ? primary : null;
  const compatOk = compat && validateSecretFormat(compat) ? compat : null;
  return {
    primary: primaryOk,
    compat: compatOk,
    configured: Boolean(primaryOk || compatOk),
    usingCompatOnly: !primaryOk && Boolean(compatOk),
  };
}

export function getSchedulerSecretConfigStatus(): {
  configured: boolean;
  primaryConfigured: boolean;
  compatConfigured: boolean;
  compatUntil: string;
} {
  const secrets = readSchedulerSecrets();
  return {
    configured: secrets.configured,
    primaryConfigured: Boolean(secrets.primary),
    compatConfigured: Boolean(secrets.compat),
    compatUntil: SCHEDULER_SECRET_COMPAT_UNTIL,
  };
}

function extractPresentedSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
  const header =
    request.headers.get("x-scheduler-cron-secret") ??
    request.headers.get("x-cron-secret");
  return header?.trim() || null;
}

/**
 * Formal Scheduler auth: secret (timing-safe) or ATLAS owner.
 * Production / Preview: secret required for non-owner.
 * Never returns ok when no secret is configured and caller is not owner in prod-like envs.
 */
export async function authorizeSchedulerTick(
  request: Request,
  options?: { allowOwner?: boolean; requirePost?: boolean },
): Promise<SchedulerAuthOk | SchedulerAuthFail> {
  if (options?.requirePost !== false && request.method !== "POST") {
    return {
      ok: false,
      status: 403,
      error: "Method not allowed",
      diagnosticCode: "scheduler_method_not_allowed",
    };
  }

  const secrets = readSchedulerSecrets();
  const presented = extractPresentedSecret(request);
  const env = resolveSchedulerEnvironment();
  const productionLike = isSchedulerProductionEnv(env) || env === "preview";

  if (presented && secrets.primary && safeEqualString(presented, secrets.primary)) {
    return { ok: true, via: "scheduler_secret" };
  }
  if (presented && secrets.compat && safeEqualString(presented, secrets.compat)) {
    return { ok: true, via: "cron_secret_compat" };
  }

  if (presented && secrets.configured) {
    // Mismatch path — do not reveal which secret.
    if (options?.allowOwner !== false && (await checkAtlasOwner())) {
      return { ok: true, via: "owner" };
    }
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      diagnosticCode: "scheduler_secret_mismatch",
    };
  }

  if (!secrets.configured) {
    // Fail-closed for unauthenticated cron. ATLAS Owner may still run ops tick.
    if (options?.allowOwner !== false && (await checkAtlasOwner())) {
      return { ok: true, via: "owner" };
    }
    return {
      ok: false,
      status: 503,
      error: "SCHEDULER_CRON_SECRET is not configured",
      diagnosticCode: "scheduler_secret_missing",
    };
  }

  if (options?.allowOwner !== false && (await checkAtlasOwner())) {
    return { ok: true, via: "owner" };
  }

  // Non-production signed-in users: keep local DX for deprecated route only via allowOwner path.
  if (!productionLike) {
    const { userId } = await auth();
    if (userId) {
      return {
        ok: false,
        status: 403,
        error: "Formal Scheduler requires SCHEDULER_CRON_SECRET or ATLAS owner",
        diagnosticCode: "scheduler_unauthorized",
      };
    }
  }

  return {
    ok: false,
    status: 401,
    error: "Unauthorized",
    diagnosticCode: "scheduler_unauthorized",
  };
}
