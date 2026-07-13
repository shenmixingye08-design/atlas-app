import "server-only";

import { GOOGLE_ACCOUNT_SCOPES } from "./config";

/** Scopes required for Gmail read/modify flows. */
export const GMAIL_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

/** Scopes required for Calendar events + calendar list. */
export const CALENDAR_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

/** Scopes required for Drive file access. */
export const DRIVE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive",
] as const;

export type GoogleCapability = "gmail" | "calendar" | "drive";

const CAPABILITY_SCOPES: Record<GoogleCapability, readonly string[]> = {
  gmail: GMAIL_REQUIRED_SCOPES,
  calendar: CALENDAR_REQUIRED_SCOPES,
  drive: DRIVE_REQUIRED_SCOPES,
};

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

  return CAPABILITY_SCOPES[capability].every((scope) => granted.has(scope));
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
