import { auth, currentUser } from "@clerk/nextjs/server";

import { checkRateLimit, recordRateLimitHit } from "@/lib/http/rate-limit";
import {
  createSecurityRequestId,
  recordSecurityAudit,
} from "@/lib/security/audit/security-audit";
import { assertCsrfForMutation } from "@/lib/security/api/csrf";
import {
  assertNotReplay,
  buildReplayKey,
  markReplaySeen,
} from "@/lib/security/api/replay";
import {
  buildPrincipal,
  evaluatePermission,
} from "@/lib/security/permissions/evaluate";
import { redactSecrets } from "@/lib/security/secrets/redact";
import type {
  SecurityAction,
  SecurityDecision,
  SecurityResourceKind,
} from "@/lib/security/types";

export type ApiSecurityGateInput = {
  request: Request;
  resource: SecurityResourceKind;
  action: SecurityAction;
  resourceOwnerUserId?: string | null;
  resourceOrganizationId?: string | null;
  requiredScope?: string | null;
  requiredRole?: string | null;
  /** Rate limit bucket (defaults to resource.action). */
  rateLimit?: {
    bucket?: string;
    max: number;
    windowMs: number;
    minIntervalMs?: number;
  };
  /** Enable CSRF check for mutating methods. */
  csrf?: boolean;
  /** Enable replay protection using Idempotency-Key or body hash. */
  replay?: boolean;
  bodyFingerprint?: string | null;
  validate?: () => { ok: true } | { ok: false; reason: string };
};

export type ApiSecurityGateSuccess = {
  ok: true;
  userId: string;
  email: string | null;
  isOwner: boolean;
  request_id: string;
};

export type ApiSecurityGateFailure = {
  ok: false;
  response: Response;
  decision: SecurityDecision;
  request_id: string;
};

function denyResponse(
  status: number,
  decision: SecurityDecision,
  reason: string,
  request_id: string,
): Response {
  return Response.json(
    {
      error: redactSecrets(reason) ?? "アクセスが拒否されました",
      code: decision,
      request_id,
    },
    {
      status,
      headers: {
        "x-atlas-request-id": request_id,
      },
    },
  );
}

/**
 * Unified API security gate: auth → validation → CSRF → rate limit →
 * replay → permission. Emits a security audit row for every decision.
 */
export async function enforceApiSecurity(
  input: ApiSecurityGateInput,
): Promise<ApiSecurityGateSuccess | ApiSecurityGateFailure> {
  const started = Date.now();
  const request_id =
    input.request.headers.get("x-atlas-request-id")?.trim() ||
    createSecurityRequestId();
  const method = input.request.method.toUpperCase();
  const path = new URL(input.request.url).pathname;
  const ip =
    input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    input.request.headers.get("x-real-ip");

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const principal = buildPrincipal({
    userId,
    email,
    organizationId: input.resourceOrganizationId ?? null,
  });

  const finish = (
    result: ApiSecurityGateSuccess | ApiSecurityGateFailure,
    decision: SecurityDecision,
    reason: string,
    success: boolean,
  ) => {
    recordSecurityAudit({
      request_id,
      who: userId,
      what: `${method} ${path}`,
      whereFrom: ip ?? null,
      resource: input.resource,
      action: input.action,
      success,
      reason,
      decision,
      durationMs: Date.now() - started,
    });
    return result;
  };

  if (!userId) {
    return finish(
      {
        ok: false,
        decision: "deny_unauthenticated",
        request_id,
        response: denyResponse(
          401,
          "deny_unauthenticated",
          "認証が必要です",
          request_id,
        ),
      },
      "deny_unauthenticated",
      "認証が必要です",
      false,
    );
  }

  if (input.validate) {
    const validated = input.validate();
    if (!validated.ok) {
      return finish(
        {
          ok: false,
          decision: "deny_validation",
          request_id,
          response: denyResponse(
            400,
            "deny_validation",
            validated.reason,
            request_id,
          ),
        },
        "deny_validation",
        validated.reason,
        false,
      );
    }
  }

  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (mutating && input.csrf !== false) {
    const csrf = assertCsrfForMutation({ request: input.request, userId });
    if (!csrf.ok) {
      return finish(
        {
          ok: false,
          decision: "deny_csrf",
          request_id,
          response: denyResponse(403, "deny_csrf", csrf.reason, request_id),
        },
        "deny_csrf",
        csrf.reason,
        false,
      );
    }
  }

  if (input.rateLimit) {
    const key = `${userId}:${input.resource}:${input.action}`;
    const options = {
      bucket: input.rateLimit.bucket ?? `api:${input.resource}`,
      max: input.rateLimit.max,
      windowMs: input.rateLimit.windowMs,
      minIntervalMs: input.rateLimit.minIntervalMs,
    };
    const limited = checkRateLimit(key, options);
    if (!limited.allowed) {
      return finish(
        {
          ok: false,
          decision: "deny_rate_limit",
          request_id,
          response: denyResponse(
            429,
            "deny_rate_limit",
            "リクエストが多すぎます。しばらくしてから再度お試しください",
            request_id,
          ),
        },
        "deny_rate_limit",
        "rate_limited",
        false,
      );
    }
    recordRateLimitHit(key, options);
  }

  if (mutating && input.replay !== false) {
    const idempotencyKey =
      input.request.headers.get("idempotency-key") ??
      input.request.headers.get("x-idempotency-key");
    if (idempotencyKey || input.bodyFingerprint) {
      const replayKey = buildReplayKey({
        userId,
        method,
        path,
        idempotencyKey,
        bodyFingerprint: input.bodyFingerprint,
      });
      const replay = assertNotReplay({ key: replayKey });
      if (!replay.ok) {
        return finish(
          {
            ok: false,
            decision: "deny_replay",
            request_id,
            response: denyResponse(409, "deny_replay", replay.reason, request_id),
          },
          "deny_replay",
          replay.reason,
          false,
        );
      }
      markReplaySeen(replayKey);
    }
  }

  const permission = evaluatePermission({
    principal,
    resource: input.resource,
    action: input.action,
    resourceOwnerUserId: input.resourceOwnerUserId ?? userId,
    resourceOrganizationId: input.resourceOrganizationId,
    requiredScope: input.requiredScope,
    requiredRole: input.requiredRole,
  });

  if (!permission.allowed) {
    const status =
      permission.decision === "deny_owner_required"
        ? 403
        : permission.decision === "deny_unauthenticated"
          ? 401
          : 404;
    return finish(
      {
        ok: false,
        decision: permission.decision,
        request_id,
        response: denyResponse(
          status,
          permission.decision,
          permission.reason,
          request_id,
        ),
      },
      permission.decision,
      permission.reason,
      false,
    );
  }

  return finish(
    {
      ok: true,
      userId,
      email,
      isOwner: principal.isOwner,
      request_id,
    },
    "allow",
    "api_security_allow",
    true,
  );
}
