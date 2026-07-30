import "server-only";

import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

import type { AttachmentStorageBackend } from "./constants";

/**
 * Resolve where image bytes are persisted.
 * - Vercel Production / Preview: always Supabase Storage (required).
 * - Local development: in-memory local store unless ATLAS_ATTACHMENT_STORAGE=supabase.
 */
export function resolveAttachmentStorageBackend(): AttachmentStorageBackend {
  const forced = process.env.ATLAS_ATTACHMENT_STORAGE?.trim().toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();

  if (vercelEnv === "production" || vercelEnv === "preview") {
    return "supabase";
  }

  if (forced === "supabase") return "supabase";
  if (forced === "local") return "local";

  return "local";
}

export function assertAttachmentBackendReady(
  backend: AttachmentStorageBackend = resolveAttachmentStorageBackend(),
): void {
  if (backend !== "supabase") return;
  if (getSupabaseServiceRoleEnv()) return;

  const vercelEnv = process.env.VERCEL_ENV?.trim() || "local";
  throw new Error(
    `Image storage requires Supabase on ${vercelEnv}. ` +
      "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

export function getAttachmentStorageBackendLabel(): AttachmentStorageBackend {
  return resolveAttachmentStorageBackend();
}
