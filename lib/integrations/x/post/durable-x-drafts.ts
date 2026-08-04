import "server-only";

import { randomUUID } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  assertXPostBackendReady,
  resolveXPostStorageBackend,
} from "./x-post-backend";
import {
  hashXPostContent,
  XPostStoreUnavailableError,
} from "./durable-x-post-jobs";
import type { XDraftPost } from "./types";

export type DurableXDraft = {
  draftId: string;
  ownerId: string;
  organizationId: string | null;
  content: string;
  contentHash: string;
  mediaIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type MemoryBucket = Map<string, DurableXDraft>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDurableXDrafts?: MemoryBucket;
  };
  if (!scope.__atlasDurableXDrafts) {
    scope.__atlasDurableXDrafts = new Map();
  }
  return scope.__atlasDurableXDrafts;
}

export function resetDurableXDraftsForTests(): void {
  getMemoryBucket().clear();
}

function draftToLegacy(d: DurableXDraft): XDraftPost {
  return {
    id: d.draftId,
    userId: d.ownerId,
    text: d.content,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function dbToDraft(data: Record<string, unknown>): DurableXDraft {
  return {
    draftId: String(data.draft_id),
    ownerId: String(data.owner_id),
    organizationId: (data.organization_id as string | null) ?? null,
    content: String(data.content),
    contentHash: String(data.content_hash),
    mediaIds: Array.isArray(data.media_ids)
      ? (data.media_ids as string[])
      : [],
    version: Number(data.version ?? 1),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    deletedAt: (data.deleted_at as string | null) ?? null,
  };
}

export async function upsertDurableXDraft(input: {
  ownerId: string;
  content: string;
  draftId?: string;
  expectedVersion?: number;
  organizationId?: string | null;
}): Promise<XDraftPost> {
  if (!input.ownerId.trim()) {
    throw new XPostStoreUnavailableError(
      "[x-post] P0-5: ownerId required for durable draft",
    );
  }
  assertXPostBackendReady();

  const content = input.content.trim();
  const contentHash = hashXPostContent(content);
  const now = new Date().toISOString();
  const backend = resolveXPostStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: draft upsert requires Supabase — Map fallback disabled",
      );
    }

    if (input.draftId) {
      const existing = await client
        .from("atlas_x_post_drafts")
        .select("*")
        .eq("draft_id", input.draftId)
        .eq("owner_id", input.ownerId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!existing.data) {
        throw new XPostStoreUnavailableError(
          "[x-post] P0-5: draft not found for owner",
        );
      }
      const row = dbToDraft(existing.data as Record<string, unknown>);
      if (
        input.expectedVersion != null &&
        row.version !== input.expectedVersion
      ) {
        throw new XPostStoreUnavailableError(
          "[x-post] P0-5: stale draft version — update rejected",
        );
      }
      const { data, error } = await client
        .from("atlas_x_post_drafts")
        .update({
          content,
          content_hash: contentHash,
          version: row.version + 1,
          updated_at: now,
        } as never)
        .eq("draft_id", input.draftId)
        .eq("owner_id", input.ownerId)
        .eq("version", row.version)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throw new XPostStoreUnavailableError(error.message);
      if (!data) {
        throw new XPostStoreUnavailableError(
          "[x-post] P0-5: stale draft version — update rejected",
        );
      }
      return draftToLegacy(dbToDraft(data as Record<string, unknown>));
    }

    const draftId = `xdr_${randomUUID()}`;
    const { data, error } = await client
      .from("atlas_x_post_drafts")
      .insert({
        draft_id: draftId,
        owner_id: input.ownerId,
        organization_id: input.organizationId ?? null,
        content,
        content_hash: contentHash,
        media_ids: [],
        version: 1,
        created_at: now,
        updated_at: now,
      } as never)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new XPostStoreUnavailableError(
        `[x-post] P0-5: draft insert failed — memory fallback disabled (${error.message})`,
      );
    }
    if (!data) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: draft insert returned empty",
      );
    }
    return draftToLegacy(dbToDraft(data as Record<string, unknown>));
  }

  const bucket = getMemoryBucket();
  if (input.draftId) {
    const existing = bucket.get(input.draftId);
    if (!existing || existing.ownerId !== input.ownerId || existing.deletedAt) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: draft not found for owner",
      );
    }
    if (
      input.expectedVersion != null &&
      existing.version !== input.expectedVersion
    ) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: stale draft version — update rejected",
      );
    }
    const updated: DurableXDraft = {
      ...existing,
      content,
      contentHash,
      version: existing.version + 1,
      updatedAt: now,
    };
    bucket.set(updated.draftId, updated);
    return draftToLegacy(updated);
  }

  const created: DurableXDraft = {
    draftId: `xdr_${randomUUID()}`,
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    content,
    contentHash,
    mediaIds: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  bucket.set(created.draftId, created);
  return draftToLegacy(created);
}

export async function listDurableXDrafts(ownerId: string): Promise<XDraftPost[]> {
  if (!ownerId.trim()) return [];
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: draft list requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_drafts")
      .select("*")
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new XPostStoreUnavailableError(error.message);
    return (data ?? []).map((row) =>
      draftToLegacy(dbToDraft(row as Record<string, unknown>)),
    );
  }

  return [...getMemoryBucket().values()]
    .filter((d) => d.ownerId === ownerId && !d.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(draftToLegacy);
}

export async function getDurableXDraft(input: {
  ownerId: string;
  draftId: string;
}): Promise<XDraftPost | null> {
  if (!input.ownerId.trim()) return null;
  const list = await listDurableXDrafts(input.ownerId);
  return list.find((d) => d.id === input.draftId) ?? null;
}

export async function softDeleteDurableXDraft(input: {
  ownerId: string;
  draftId: string;
}): Promise<boolean> {
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  const now = new Date().toISOString();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: draft delete requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_drafts")
      .update({ deleted_at: now, updated_at: now } as never)
      .eq("draft_id", input.draftId)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .select("draft_id")
      .maybeSingle();
    if (error) throw new XPostStoreUnavailableError(error.message);
    return Boolean(data);
  }

  const draft = getMemoryBucket().get(input.draftId);
  if (!draft || draft.ownerId !== input.ownerId || draft.deletedAt) return false;
  draft.deletedAt = now;
  draft.updatedAt = now;
  getMemoryBucket().set(draft.draftId, draft);
  return true;
}
