import "server-only";

import { randomUUID } from "crypto";

import type { CapabilityId } from "./types";
import { decidePublishScope } from "./publish-scope";

/**
 * Operator-controlled capability flags (separate from integration feature flags).
 * Default follows publish-scope: paused/hidden ⇒ disabled for non-owners.
 */

export type CapabilityFlagState = "on" | "off" | "beta" | "invite";

export type CapabilityFlagRecord = {
  id: CapabilityId;
  state: CapabilityFlagState;
  updatedAt: string;
  updatedBy: string | null;
  reason: string | null;
};

export type CapabilityFlagAudit = {
  id: string;
  at: string;
  capabilityId: CapabilityId;
  state: CapabilityFlagState;
  actor: string | null;
  reason: string | null;
};

type Bucket = {
  flags: Map<CapabilityId, CapabilityFlagRecord>;
  audit: CapabilityFlagAudit[];
};

function defaultStateFor(id: CapabilityId): CapabilityFlagState {
  const scope = decidePublishScope().find((d) => d.id === id)?.scope;
  switch (scope) {
    case "GA公開":
      return "on";
    case "β公開":
      return "beta";
    case "招待制":
    case "管理者のみ":
      return "invite";
    case "一時停止":
    case "非表示":
    case "未公開":
    default:
      return "off";
  }
}

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasCapabilityFlags?: Bucket;
  };
  if (!scope.__atlasCapabilityFlags) {
    const flags = new Map<CapabilityId, CapabilityFlagRecord>();
    for (const d of decidePublishScope()) {
      flags.set(d.id, {
        id: d.id,
        state: defaultStateFor(d.id),
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
        reason: d.reason,
      });
    }
    scope.__atlasCapabilityFlags = { flags, audit: [] };
  }
  return scope.__atlasCapabilityFlags;
}

export function listCapabilityFlags(): CapabilityFlagRecord[] {
  return [...getBucket().flags.values()];
}

export function getCapabilityFlagState(id: CapabilityId): CapabilityFlagState {
  return getBucket().flags.get(id)?.state ?? "off";
}

export function setCapabilityFlag(input: {
  id: CapabilityId;
  state: CapabilityFlagState;
  actor?: string | null;
  reason?: string | null;
}): CapabilityFlagRecord {
  const bucket = getBucket();
  const next: CapabilityFlagRecord = {
    id: input.id,
    state: input.state,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actor ?? null,
    reason: input.reason?.trim() || null,
  };
  bucket.flags.set(input.id, next);
  bucket.audit.unshift({
    id: `cfa_${randomUUID().slice(0, 10)}`,
    at: next.updatedAt,
    capabilityId: input.id,
    state: next.state,
    actor: next.updatedBy,
    reason: next.reason,
  });
  if (bucket.audit.length > 500) bucket.audit.length = 500;
  return next;
}

export function isCapabilityAllowed(input: {
  id: CapabilityId;
  isOwner: boolean;
  isBetaUser: boolean;
  isInviteUser: boolean;
}): boolean {
  if (input.isOwner) return true; // kill switches still apply separately
  const state = getCapabilityFlagState(input.id);
  switch (state) {
    case "on":
      return true;
    case "beta":
      return input.isBetaUser;
    case "invite":
      return input.isInviteUser || input.isBetaUser;
    case "off":
    default:
      return false;
  }
}

/** Owner bypass for capability flags — kill switches still apply separately. */
export function isCapabilityAllowedForUser(input: {
  id: CapabilityId;
  isOwner: boolean;
  isBetaUser: boolean;
  isInviteUser?: boolean;
}): boolean {
  if (input.isOwner) return true;
  return isCapabilityAllowed({
    id: input.id,
    isOwner: false,
    isBetaUser: input.isBetaUser,
    isInviteUser: Boolean(input.isInviteUser),
  });
}

export function capabilityDenialResponse(id: CapabilityId): Response {
  return Response.json(
    {
      error: "capability_disabled",
      code: "capability_flag",
      capabilityId: id,
      message:
        "この機能は現在ご利用いただけません。公開準備中か、一時停止中です。",
    },
    { status: 403 }
  );
}

export function listCapabilityFlagAudit(limit = 100): CapabilityFlagAudit[] {
  return getBucket().audit.slice(0, limit);
}

export function resetCapabilityFlagsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasCapabilityFlags?: Bucket;
  };
  delete scope.__atlasCapabilityFlags;
}
