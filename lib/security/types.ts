/** Production security / permission / billing hardening contracts. */

export type SecurityResourceKind =
  | "user"
  | "organization"
  | "workspace"
  | "artifact"
  | "revision"
  | "notification"
  | "job"
  | "integration"
  | "billing"
  | "admin"
  | "owner"
  | "role"
  | "scope";

export type SecurityAction =
  | "read"
  | "write"
  | "download"
  | "preview"
  | "revise"
  | "delete"
  | "share"
  | "signed_url"
  | "manage"
  | "checkout"
  | "webhook"
  | "admin";

export type SecurityDecision =
  | "allow"
  | "deny_unauthenticated"
  | "deny_owner_required"
  | "deny_organization"
  | "deny_permission"
  | "deny_cross_tenant"
  | "deny_billing"
  | "deny_quota"
  | "deny_rate_limit"
  | "deny_csrf"
  | "deny_replay"
  | "deny_validation"
  | "deny_expired"
  | "deny_guessable";

export type SecurityPrincipal = {
  userId: string | null;
  email?: string | null;
  isOwner: boolean;
  organizationId?: string | null;
  roles: readonly string[];
  scopes: readonly string[];
};

export type SecurityAuditRecord = {
  request_id: string;
  who: string | null;
  when: string;
  what: string;
  whereFrom: string | null;
  resource: SecurityResourceKind | string;
  action: SecurityAction | string;
  success: boolean;
  reason: string;
  decision: SecurityDecision;
  durationMs: number;
};

export type ArtifactAccessOp =
  | "download"
  | "preview"
  | "revision"
  | "delete"
  | "share"
  | "signed_url";
