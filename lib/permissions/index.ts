/**
 * Public permission surface — implementation lives in lib/security/permissions.
 * Keeps a stable import path for route guards and future org/RBAC expansion.
 */

export {
  buildPrincipal,
  evaluatePermission,
  type PermissionCheckInput,
  type PermissionCheckResult,
} from "@/lib/security/permissions/evaluate";

export type {
  SecurityAction,
  SecurityDecision,
  SecurityPrincipal,
  SecurityResourceKind,
} from "@/lib/security/types";
