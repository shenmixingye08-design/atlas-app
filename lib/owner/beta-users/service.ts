import "server-only";

import { buildBetaUserManagementSnapshot } from "./engine";
import {
  addRuntimeBetaUserEmail,
  removeBetaUserEmail,
} from "./emails";
import type {
  BetaUserManagementSnapshot,
  BetaUserPatchAction,
} from "./types";

export function getBetaUserManagementSnapshot(
  now: Date = new Date(),
): BetaUserManagementSnapshot {
  return buildBetaUserManagementSnapshot(now);
}

export function parseBetaUserPatchBody(body: unknown):
  | { action: BetaUserPatchAction; email: string }
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as { action?: unknown; email?: unknown };

  if (record.action !== "add" && record.action !== "remove") {
    return { error: "action must be add or remove" };
  }

  if (typeof record.email !== "string" || !record.email.trim()) {
    return { error: "email is required" };
  }

  return { action: record.action, email: record.email.trim() };
}

export function applyBetaUserPatch(input: {
  action: BetaUserPatchAction;
  email: string;
}): BetaUserManagementSnapshot {
  if (input.action === "add") {
    addRuntimeBetaUserEmail(input.email);
  } else {
    removeBetaUserEmail(input.email);
  }

  return getBetaUserManagementSnapshot();
}
