import {
  buildPrincipal,
  evaluatePermission,
} from "@/lib/security/permissions/evaluate";
import {
  createSecurityRequestId,
  recordSecurityAudit,
} from "@/lib/security/audit/security-audit";
import type { ArtifactAccessOp, SecurityDecision } from "@/lib/security/types";

export type ArtifactAccessInput = {
  actorUserId: string | null;
  actorEmail?: string | null;
  artifactOwnerUserId: string | null | undefined;
  organizationId?: string | null;
  op: ArtifactAccessOp;
  /** Signed URL expiry (ms since epoch). */
  signedUrlExpiresAtMs?: number | null;
  /** Reject obviously guessable ids (too short / sequential patterns). */
  artifactId?: string | null;
  requestId?: string;
  ip?: string | null;
};

export type ArtifactAccessResult = {
  allowed: boolean;
  decision: SecurityDecision;
  reason: string;
  request_id: string;
};

const GUESSABLE_ID = /^(1|2|3|test|demo|admin|000+|aaaa+)$/i;

function mapOpToAction(
  op: ArtifactAccessOp,
): "download" | "preview" | "revise" | "delete" | "share" | "signed_url" {
  if (op === "revision") return "revise";
  return op;
}

/**
 * Deny cross-user artifact download / preview / revision / delete / share /
 * signed URL access. Also rejects expired and guessable signed URLs.
 */
export function assertArtifactAccess(
  input: ArtifactAccessInput,
): ArtifactAccessResult {
  const started = Date.now();
  const request_id = input.requestId ?? createSecurityRequestId();
  const principal = buildPrincipal({
    userId: input.actorUserId,
    email: input.actorEmail,
    organizationId: input.organizationId,
  });

  if (input.op === "signed_url") {
    if (
      typeof input.signedUrlExpiresAtMs === "number" &&
      Date.now() > input.signedUrlExpiresAtMs
    ) {
      const result: ArtifactAccessResult = {
        allowed: false,
        decision: "deny_expired",
        reason: "署名URLの有効期限が切れています",
        request_id,
      };
      recordSecurityAudit({
        request_id,
        who: input.actorUserId,
        what: `artifact.${input.op}`,
        whereFrom: input.ip ?? null,
        resource: "artifact",
        action: "signed_url",
        success: false,
        reason: result.reason,
        decision: result.decision,
        durationMs: Date.now() - started,
      });
      return result;
    }
  }

  if (input.artifactId && GUESSABLE_ID.test(input.artifactId.trim())) {
    const result: ArtifactAccessResult = {
      allowed: false,
      decision: "deny_guessable",
      reason: "推測可能な成果物IDは拒否されます",
      request_id,
    };
    recordSecurityAudit({
      request_id,
      who: input.actorUserId,
      what: `artifact.${input.op}`,
      whereFrom: input.ip ?? null,
      resource: "artifact",
      action: mapOpToAction(input.op),
      success: false,
      reason: result.reason,
      decision: result.decision,
      durationMs: Date.now() - started,
    });
    return result;
  }

  // Missing owner → deny (fail closed). Never reveal existence to other users.
  if (!input.artifactOwnerUserId) {
    const result: ArtifactAccessResult = {
      allowed: false,
      decision: "deny_cross_tenant",
      reason: "成果物が見つからないか権限がありません",
      request_id,
    };
    recordSecurityAudit({
      request_id,
      who: input.actorUserId,
      what: `artifact.${input.op}`,
      whereFrom: input.ip ?? null,
      resource: "artifact",
      action: mapOpToAction(input.op),
      success: false,
      reason: result.reason,
      decision: result.decision,
      durationMs: Date.now() - started,
    });
    return result;
  }

  const permission = evaluatePermission({
    principal,
    resource: input.op === "revision" ? "revision" : "artifact",
    action: mapOpToAction(input.op),
    resourceOwnerUserId: input.artifactOwnerUserId,
    resourceOrganizationId: input.organizationId,
  });

  const result: ArtifactAccessResult = {
    allowed: permission.allowed,
    decision: permission.decision,
    reason: permission.allowed
      ? "artifact_access_allow"
      : "成果物が見つからないか権限がありません",
    request_id,
  };

  recordSecurityAudit({
    request_id,
    who: input.actorUserId,
    what: `artifact.${input.op}`,
    whereFrom: input.ip ?? null,
    resource: input.op === "revision" ? "revision" : "artifact",
    action: mapOpToAction(input.op),
    success: permission.allowed,
    reason: result.reason,
    decision: result.decision,
    durationMs: Date.now() - started,
  });

  return result;
}

export function artifactAccessDeniedResponse(
  result: ArtifactAccessResult,
): Response {
  const status =
    result.decision === "deny_unauthenticated"
      ? 401
      : result.decision === "deny_expired"
        ? 410
        : 404;
  return Response.json(
    {
      error: result.reason,
      code: result.decision,
      request_id: result.request_id,
    },
    { status },
  );
}
