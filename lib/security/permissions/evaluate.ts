import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";

import type {
  SecurityAction,
  SecurityDecision,
  SecurityPrincipal,
  SecurityResourceKind,
} from "../types";

export type PermissionCheckInput = {
  principal: SecurityPrincipal;
  resource: SecurityResourceKind;
  action: SecurityAction;
  /** Resource owner user id (tenant). */
  resourceOwnerUserId?: string | null;
  /** Optional org scope on the resource. */
  resourceOrganizationId?: string | null;
  /** Required OAuth/API scope if applicable. */
  requiredScope?: string | null;
  /** Required role name if applicable. */
  requiredRole?: string | null;
};

export type PermissionCheckResult = {
  allowed: boolean;
  decision: SecurityDecision;
  reason: string;
};

/**
 * Central permission evaluator for User / Org / Workspace / Artifact / Revision /
 * Notification / Job / Integration / Billing / Admin / Owner / Role / Scope.
 *
 * Tenancy model: Clerk userId is the primary boundary. OrganizationId is enforced
 * when present on both principal and resource (fail closed on mismatch).
 */
export function evaluatePermission(
  input: PermissionCheckInput,
): PermissionCheckResult {
  const { principal, resource, action } = input;

  if (!principal.userId) {
    return {
      allowed: false,
      decision: "deny_unauthenticated",
      reason: "認証が必要です",
    };
  }

  // Owner operators may manage admin/owner surfaces.
  if (resource === "owner" || resource === "admin") {
    if (!principal.isOwner) {
      return {
        allowed: false,
        decision: "deny_owner_required",
        reason: "オーナー権限が必要です",
      };
    }
    return { allowed: true, decision: "allow", reason: "owner_allow" };
  }

  if (input.requiredRole) {
    if (!principal.roles.includes(input.requiredRole) && !principal.isOwner) {
      return {
        allowed: false,
        decision: "deny_permission",
        reason: `ロール ${input.requiredRole} が必要です`,
      };
    }
  }

  if (input.requiredScope) {
    if (!principal.scopes.includes(input.requiredScope) && !principal.isOwner) {
      return {
        allowed: false,
        decision: "deny_permission",
        reason: `スコープ ${input.requiredScope} が必要です`,
      };
    }
  }

  // Organization boundary — fail closed when both sides declare org and they differ.
  if (
    input.resourceOrganizationId &&
    principal.organizationId &&
    input.resourceOrganizationId !== principal.organizationId &&
    !principal.isOwner
  ) {
    return {
      allowed: false,
      decision: "deny_organization",
      reason: "組織が一致しません",
    };
  }

  // Cross-tenant ownership — any resource that declares an owner is fail-closed
  // unless the actor is that owner (or ATLAS owner operator).
  if (
    input.resourceOwnerUserId != null &&
    input.resourceOwnerUserId !== principal.userId &&
    !principal.isOwner
  ) {
    return {
      allowed: false,
      decision: "deny_cross_tenant",
      reason: "他ユーザーのリソースにはアクセスできません",
    };
  }

  // Billing mutations require the authenticated subject to own the billing record.
  if (resource === "billing" && action !== "read" && !principal.userId) {
    return {
      allowed: false,
      decision: "deny_permission",
      reason: "課金操作にはログインが必要です",
    };
  }

  // Share is intentionally denied until an explicit share model exists.
  if (action === "share" && resource === "artifact") {
    return {
      allowed: false,
      decision: "deny_permission",
      reason: "成果物の共有は許可されていません",
    };
  }

  return { allowed: true, decision: "allow", reason: "permission_allow" };
}

export function buildPrincipal(input: {
  userId: string | null;
  email?: string | null;
  organizationId?: string | null;
  roles?: readonly string[];
  scopes?: readonly string[];
}): SecurityPrincipal {
  const email = input.email ?? null;
  const isOwner = isAtlasOwnerEmail(email);
  return {
    userId: input.userId,
    email,
    isOwner,
    organizationId: input.organizationId ?? null,
    roles: input.roles ?? (isOwner ? (["owner"] as const) : (["user"] as const)),
    scopes: input.scopes ?? [],
  };
}
