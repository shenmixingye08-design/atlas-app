import "server-only";

import { randomUUID, timingSafeEqual } from "crypto";
import { auth } from "@clerk/nextjs/server";

import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { isAtlasProduction } from "@/lib/runtime/is-production";
import { safeLog } from "@/lib/security/redact";

export type AutomationTickAuthMethod =
  | "bearer_cron_secret"
  | "x_cron_secret"
  | "atlas_owner_session"
  | "signed_in_preview"
  | "none";

export type AutomationTickCallerType =
  | "vercel_cron"
  | "internal_scheduler"
  | "owner_session"
  | "signed_in_user"
  | "health_probe"
  | "external"
  | "unknown";

export type AutomationTickAuthOk = {
  ok: true;
  tickId: string;
  authMethod: AutomationTickAuthMethod;
  callerType: AutomationTickCallerType;
};

export type AutomationTickAuthDenied = {
  ok: false;
  status: number;
  error: string;
  tickId: string;
  authMethod: AutomationTickAuthMethod;
  callerType: AutomationTickCallerType;
  rejectionReason: string;
};

export type AutomationTickAuthResult =
  | AutomationTickAuthOk
  | AutomationTickAuthDenied;

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

function readTickId(request: Request): string {
  const incoming = request.headers.get("x-atlas-tick-id")?.trim();
  if (incoming && /^tick_[a-zA-Z0-9_-]{8,80}$/.test(incoming)) {
    return incoming;
  }
  return `tick_${randomUUID()}`;
}

function inferCallerType(
  request: Request,
  authMethod: AutomationTickAuthMethod,
): AutomationTickCallerType {
  if (request.headers.get("x-vercel-cron")) return "vercel_cron";
  const scheduler = request.headers.get("x-atlas-scheduler")?.trim().toLowerCase();
  if (scheduler === "github-actions" || scheduler === "internal") {
    return "internal_scheduler";
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (/GitHub-Actions|github-actions/i.test(ua)) return "internal_scheduler";
  if (request.headers.get("x-atlas-health-probe") === "1") return "health_probe";
  if (authMethod === "atlas_owner_session") return "owner_session";
  if (authMethod === "signed_in_preview") return "signed_in_user";
  if (
    authMethod === "bearer_cron_secret" ||
    authMethod === "x_cron_secret"
  ) {
    return "unknown";
  }
  return "external";
}

function deploymentId(): string | null {
  return (
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    null
  );
}

function logTickAuth(result: AutomationTickAuthResult): void {
  safeLog("info", "AUTOMATION_TICK_AUTH", {
    tickId: result.tickId,
    callerType: result.callerType,
    authMethod: result.authMethod,
    authorized: result.ok,
    rejectionReason: result.ok ? null : result.rejectionReason,
    status: result.ok ? 200 : result.status,
    deploymentId: deploymentId(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}

/**
 * Accept Vercel Cron Bearer secret or x-cron-secret (timing-safe).
 * In non-production, any signed-in user may tick (local UI).
 * In production (and Preview, because NODE_ENV=production), only CRON_SECRET
 * or an ATLAS owner may tick.
 *
 * Fail-closed: missing/invalid secret is never treated as public.
 */
export async function authorizeAutomationTick(
  request: Request,
): Promise<AutomationTickAuthResult> {
  const tickId = readTickId(request);
  const secret = readCronSecret();
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");

  const finish = (result: AutomationTickAuthResult): AutomationTickAuthResult => {
    logTickAuth(result);
    return result;
  };

  if (secret) {
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length).trim();
      if (safeEqualString(token, secret)) {
        const authMethod = "bearer_cron_secret" as const;
        return finish({
          ok: true,
          tickId,
          authMethod,
          callerType: inferCallerType(request, authMethod),
        });
      }
    }
    if (headerSecret && safeEqualString(headerSecret, secret)) {
      const authMethod = "x_cron_secret" as const;
      return finish({
        ok: true,
        tickId,
        authMethod,
        callerType: inferCallerType(request, authMethod),
      });
    }
  }

  if (isAtlasProduction()) {
    if (!secret) {
      return finish({
        ok: false,
        status: 503,
        error: "CRON_SECRET is not configured",
        tickId,
        authMethod: "none",
        callerType: inferCallerType(request, "none"),
        rejectionReason: "cron_secret_unconfigured",
      });
    }
    if (await checkAtlasOwner()) {
      const authMethod = "atlas_owner_session" as const;
      return finish({
        ok: true,
        tickId,
        authMethod,
        callerType: inferCallerType(request, authMethod),
      });
    }
    const presented =
      Boolean(authorization?.startsWith("Bearer ")) || Boolean(headerSecret);
    return finish({
      ok: false,
      status: 401,
      error: "Unauthorized",
      tickId,
      authMethod: "none",
      callerType: inferCallerType(request, "none"),
      rejectionReason: presented
        ? "secret_mismatch"
        : "missing_credentials",
    });
  }

  const { userId } = await auth();
  if (userId) {
    const authMethod = "signed_in_preview" as const;
    return finish({
      ok: true,
      tickId,
      authMethod,
      callerType: inferCallerType(request, authMethod),
    });
  }

  if (!secret) {
    return finish({
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured",
      tickId,
      authMethod: "none",
      callerType: inferCallerType(request, "none"),
      rejectionReason: "cron_secret_unconfigured",
    });
  }

  const presented =
    Boolean(authorization?.startsWith("Bearer ")) || Boolean(headerSecret);
  return finish({
    ok: false,
    status: 401,
    error: "Unauthorized",
    tickId,
    authMethod: "none",
    callerType: inferCallerType(request, "none"),
    rejectionReason: presented ? "secret_mismatch" : "missing_credentials",
  });
}
