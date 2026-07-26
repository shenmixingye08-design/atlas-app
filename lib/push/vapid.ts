import "server-only";

import type { PushErrorCode } from "./errors";

const PUBLIC_KEY_ENV_CANDIDATES = [
  "VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
] as const;

export type VapidConfigStatus = {
  configured: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  hasSubject: boolean;
  /** Env var names that are missing (never values). */
  missing: string[];
  /** Primary missing-related error code for API responses. */
  errorCode: PushErrorCode | null;
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** VAPID public key exposed to clients (safe). */
export function getVapidPublicKey(): string | null {
  for (const name of PUBLIC_KEY_ENV_CANDIDATES) {
    const value = readEnv(name);
    if (value) return value;
  }
  return null;
}

export function getVapidConfigStatus(): VapidConfigStatus {
  const hasPublicKey = Boolean(getVapidPublicKey());
  const hasPrivateKey = Boolean(readEnv("VAPID_PRIVATE_KEY"));
  const hasSubject = Boolean(readEnv("VAPID_SUBJECT"));
  const missing: string[] = [];

  if (!hasPublicKey) {
    missing.push("VAPID_PUBLIC_KEY|NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  }
  if (!hasPrivateKey) missing.push("VAPID_PRIVATE_KEY");
  if (!hasSubject) missing.push("VAPID_SUBJECT");

  let errorCode: PushErrorCode | null = null;
  if (!hasPublicKey) errorCode = "vapid_public_key_missing";
  else if (!hasPrivateKey) errorCode = "vapid_private_key_missing";
  else if (!hasSubject) errorCode = "vapid_subject_missing";

  return {
    configured: hasPublicKey && hasPrivateKey && hasSubject,
    hasPublicKey,
    hasPrivateKey,
    hasSubject,
    missing,
    errorCode,
  };
}

let lastLoggedMissingKey = "";

/** Log missing VAPID env names only (never secret values). Deduped per process. */
export function logVapidConfigIssues(context: string): VapidConfigStatus {
  const status = getVapidConfigStatus();
  if (status.missing.length === 0) return status;

  const key = `${context}:${status.missing.join(",")}`;
  if (key !== lastLoggedMissingKey) {
    lastLoggedMissingKey = key;
    console.warn(
      `[push] Web Push not fully configured (${context}). Missing env: ${status.missing.join(", ")}`,
    );
  }
  return status;
}

export function isWebPushConfigured(): boolean {
  return getVapidConfigStatus().configured;
}

export function getVapidSubject(): string {
  const subject = readEnv("VAPID_SUBJECT");
  if (!subject) {
    throw new Error("VAPID_SUBJECT is not configured");
  }
  return subject.startsWith("mailto:") || subject.startsWith("https://")
    ? subject
    : `mailto:${subject}`;
}

export function getVapidPrivateKey(): string {
  const key = readEnv("VAPID_PRIVATE_KEY");
  if (!key) {
    throw new Error("VAPID_PRIVATE_KEY is not configured");
  }
  return key;
}
