import "server-only";

import { GOOGLE_ACCOUNT_SCOPES } from "./config";

/** Broad Gmail scope (legacy connections). */
export const GMAIL_MODIFY_SCOPE =
  "https://www.googleapis.com/auth/gmail.modify" as const;
export const GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send" as const;
export const GMAIL_COMPOSE_SCOPE =
  "https://www.googleapis.com/auth/gmail.compose" as const;
export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly" as const;

/** Scopes required for Gmail read/modify flows (legacy baseline). */
export const GMAIL_REQUIRED_SCOPES = [GMAIL_MODIFY_SCOPE] as const;

export type GmailScopeAction =
  | "draft"
  | "send"
  | "reply"
  | "read"
  | "send_draft";

/**
 * Least-privilege Gmail scopes by action.
 * gmail.modify satisfies all actions for already-connected accounts.
 */
export function getRequiredGmailScopesForAction(
  action: GmailScopeAction,
): readonly string[] {
  switch (action) {
    case "draft":
      return [GMAIL_COMPOSE_SCOPE];
    case "send":
    case "send_draft":
      return [GMAIL_SEND_SCOPE];
    case "reply":
      return [GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE];
    case "read":
      return [GMAIL_READONLY_SCOPE];
    default:
      return [GMAIL_COMPOSE_SCOPE];
  }
}

export function hasGmailScopesForAction(
  grantedScope: string | null | undefined,
  action: GmailScopeAction,
): boolean {
  const granted = parseGoogleScopeString(grantedScope);
  if (granted.has(GMAIL_MODIFY_SCOPE)) return true;

  const required = getRequiredGmailScopesForAction(action);
  if (action === "reply") {
    const canSend =
      granted.has(GMAIL_SEND_SCOPE) || granted.has(GMAIL_COMPOSE_SCOPE);
    const canRead =
      granted.has(GMAIL_READONLY_SCOPE) || granted.has(GMAIL_COMPOSE_SCOPE);
    return canSend && canRead;
  }
  if (action === "draft") {
    return (
      granted.has(GMAIL_COMPOSE_SCOPE) ||
      granted.has(GMAIL_SEND_SCOPE) ||
      granted.has(GMAIL_MODIFY_SCOPE)
    );
  }
  if (action === "send" || action === "send_draft") {
    return granted.has(GMAIL_SEND_SCOPE) || granted.has(GMAIL_MODIFY_SCOPE);
  }
  return required.every((scope) => granted.has(scope));
}

export function getMissingGmailScopesForAction(
  grantedScope: string | null | undefined,
  action: GmailScopeAction,
): string[] {
  if (hasGmailScopesForAction(grantedScope, action)) return [];
  return [...getRequiredGmailScopesForAction(action)];
}

/** Scopes required for Calendar events + calendar list. */
export const CALENDAR_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

/**
 * Scopes accepted for Drive upload.
 * Prefer drive.file; legacy full drive still satisfies capability checks.
 */
export const DRIVE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
] as const;

export const DRIVE_ACCEPTED_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive",
] as const;

export type GoogleCapability = "gmail" | "calendar" | "drive";

export function parseGoogleScopeString(
  scope: string | null | undefined,
): Set<string> {
  if (!scope?.trim()) return new Set();
  return new Set(
    scope
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function hasAllGoogleScopes(
  grantedScope: string | null | undefined,
  required: readonly string[],
): boolean {
  const granted = parseGoogleScopeString(grantedScope);
  return required.every((scope) => granted.has(scope));
}

export function getMissingGoogleScopes(
  grantedScope: string | null | undefined,
  required: readonly string[],
): string[] {
  const granted = parseGoogleScopeString(grantedScope);
  return required.filter((scope) => !granted.has(scope));
}

export function hasGoogleCapability(
  grantedScope: string | null | undefined,
  capability: GoogleCapability,
): boolean {
  const granted = parseGoogleScopeString(grantedScope);

  if (capability === "calendar") {
    return (
      granted.has("https://www.googleapis.com/auth/calendar.events") ||
      granted.has("https://www.googleapis.com/auth/calendar.readonly") ||
      granted.has("https://www.googleapis.com/auth/calendar")
    );
  }

  if (capability === "gmail") {
    return (
      granted.has("https://www.googleapis.com/auth/gmail.modify") ||
      granted.has("https://www.googleapis.com/auth/gmail.readonly") ||
      (granted.has("https://www.googleapis.com/auth/gmail.send") &&
        granted.has("https://www.googleapis.com/auth/gmail.compose"))
    );
  }

  if (capability === "drive") {
    return DRIVE_ACCEPTED_SCOPES.some((scope) => granted.has(scope));
  }

  return false;
}

export function getMissingDriveScopes(
  grantedScope: string | null | undefined,
): string[] {
  if (hasGoogleCapability(grantedScope, "drive")) return [];
  return [...DRIVE_REQUIRED_SCOPES];
}

/** Prefer stored OAuth scope string; fall back to planned account scopes. */
export function resolveGrantedGoogleScope(
  storedScope: string | null | undefined,
  connectionScopes?: readonly string[],
): string {
  if (storedScope?.trim()) return storedScope;
  if (connectionScopes?.length) return connectionScopes.join(" ");
  return GOOGLE_ACCOUNT_SCOPES.join(" ");
}

export const GOOGLE_INSUFFICIENT_PERMISSION_MESSAGE =
  "必要なGoogle権限が不足しています。再接続して権限を許可してください";

export const GOOGLE_RECONNECT_REQUIRED_MESSAGE =
  "Google連携の有効期限が切れました。再接続してください";

export const GOOGLE_NOT_CONNECTED_MESSAGE = "Googleを接続してください";
