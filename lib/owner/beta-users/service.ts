import "server-only";

import {
  getOwnerRuntimePersistMode,
  ownerRuntimeMutationBlockedMessage,
} from "@/lib/owner/runtime-config/persist-mode";

import {
  didBetaRuntimeHydrateFail,
  ensureBetaRuntimeHydrated,
  persistBetaRuntimeNow,
} from "./durable";
import { buildBetaUserManagementSnapshot } from "./engine";
import {
  addRuntimeBetaUserEmail,
  removeBetaUserEmail,
  snapshotRuntimeBetaStore,
  replaceRuntimeBetaStore,
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

export async function getBetaUserManagementSnapshotForOwner(
  now: Date = new Date(),
): Promise<BetaUserManagementSnapshot> {
  await ensureBetaRuntimeHydrated();
  return getBetaUserManagementSnapshot(now);
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

export async function applyBetaUserPatchForOwner(input: {
  action: BetaUserPatchAction;
  email: string;
}): Promise<
  { snapshot: BetaUserManagementSnapshot } | { error: string; status: number }
> {
  const persistMode = getOwnerRuntimePersistMode();
  if (persistMode === "blocked") {
    return { error: ownerRuntimeMutationBlockedMessage(), status: 503 };
  }

  const hydrated = await ensureBetaRuntimeHydrated();
  if (!hydrated || didBetaRuntimeHydrateFail()) {
    return {
      error: "設定の読み込みに失敗したため、変更を保存できません。",
      status: 503,
    };
  }

  const previous = snapshotRuntimeBetaStore();
  const snapshot = applyBetaUserPatch(input);

  if (persistMode === "durable") {
    const saved = await persistBetaRuntimeNow();
    if (!saved) {
      replaceRuntimeBetaStore(previous);
      return {
        error: "保存に失敗したため、変更は反映していません。",
        status: 503,
      };
    }
  }

  return { snapshot };
}
