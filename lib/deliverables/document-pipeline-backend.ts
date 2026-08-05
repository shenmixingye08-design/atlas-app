import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type DocumentPipelineStorageBackend =
  | "supabase"
  | "memory_durable"
  | "local";

/**
 * P0-7: Production document pipeline job SoT is Supabase rows only.
 * memory_durable is test-only.
 */
export function resolveDocumentPipelineStorageBackend(): DocumentPipelineStorageBackend {
  const forced = process.env.ATLAS_DOCUMENT_PIPELINE_STORAGE?.trim().toLowerCase();

  if (forced === "memory_durable") {
    if (isAtlasProduction()) {
      throw new Error(
        "[document-pipeline] P0-7: memory_durable pipeline store is forbidden in Production",
      );
    }
    return "memory_durable";
  }

  if (isAtlasProduction() || process.env.VERCEL_ENV === "production") {
    return "supabase";
  }

  if (forced === "supabase") return "supabase";
  if (forced === "local") return "local";

  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return forced === "supabase" ? "supabase" : "memory_durable";
  }

  return "local";
}

export function assertDocumentPipelineBackendReady(): void {
  const backend = resolveDocumentPipelineStorageBackend();
  if (backend === "memory_durable" || backend === "local") return;
  if (getSupabaseServiceRoleEnv()) return;
  throw new Error(
    "[document-pipeline] P0-7: Production durable pipeline requires Supabase service role — Map fallback disabled",
  );
}

export function isDocumentPipelineDurableRequired(): boolean {
  const backend = resolveDocumentPipelineStorageBackend();
  return backend === "supabase" || backend === "memory_durable";
}
