import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

import { ATLAS_IMAGE_ATTACHMENTS_BUCKET } from "./constants";
import { AttachmentStorageError, classifySupabaseError } from "./errors";

export type AttachmentInfrastructureStatus = {
  backend: "supabase" | "local";
  vercelEnv: string | null;
  serviceRoleConfigured: boolean;
  supabaseUrlHost: string | null;
  bucket: string;
  bucketExists: boolean;
  bucketCreatedNow: boolean;
  tableExists: boolean;
  tableProbeError: string | null;
  ready: boolean;
  blockingCode:
    | null
    | "config_missing"
    | "bucket_missing"
    | "table_missing"
    | "probe_failed";
  migrationHint: string | null;
};

function supabaseUrlHost(): string | null {
  const env = getSupabaseServiceRoleEnv();
  if (!env?.url) return null;
  try {
    return new URL(env.url).host;
  } catch {
    return null;
  }
}

async function probeTableExists(): Promise<{
  exists: boolean;
  errorMessage: string | null;
}> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { exists: false, errorMessage: "service_role_missing" };
  }

  const { error } = await client
    .from("atlas_image_attachments")
    .select("id")
    .limit(1);

  if (!error) return { exists: true, errorMessage: null };

  const classified = classifySupabaseError(error, "db.probe");
  if (classified.code === "table_missing") {
    return { exists: false, errorMessage: classified.providerMessage ?? error.message };
  }

  // Other errors (network, RLS unexpected) — treat as unknown, not missing.
  return {
    exists: false,
    errorMessage: error.message,
  };
}

async function listHasBucket(): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;
  const { data, error } = await client.storage.listBuckets();
  if (error) {
    throw classifySupabaseError(error, "storage.listBuckets");
  }
  return Boolean(data?.some((bucket) => bucket.name === ATLAS_IMAGE_ATTACHMENTS_BUCKET));
}

async function createPrivateImageBucket(): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    throw new AttachmentStorageError({
      code: "config_missing",
      stage: "storage.createBucket",
    });
  }

  const { error } = await client.storage.createBucket(ATLAS_IMAGE_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ],
  });

  if (error) {
    const lower = (error.message ?? "").toLowerCase();
    // Race: already exists
    if (lower.includes("already exists") || lower.includes("duplicate")) {
      return;
    }
    throw new AttachmentStorageError({
      code: "bucket_create_failed",
      stage: "storage.createBucket",
      providerCode: error.name,
      providerMessage: error.message,
    });
  }
}

/**
 * Ensure private image bucket exists (create if missing).
 * Table DDL cannot be applied via JS client — report table_missing clearly.
 */
export async function ensureAttachmentInfrastructure(options?: {
  createBucketIfMissing?: boolean;
}): Promise<AttachmentInfrastructureStatus> {
  const createBucketIfMissing = options?.createBucketIfMissing !== false;
  const vercelEnv = process.env.VERCEL_ENV?.trim() || null;
  const serviceRoleConfigured = Boolean(getSupabaseServiceRoleEnv());
  const host = supabaseUrlHost();

  const status: AttachmentInfrastructureStatus = {
    backend: "supabase",
    vercelEnv,
    serviceRoleConfigured,
    supabaseUrlHost: host,
    bucket: ATLAS_IMAGE_ATTACHMENTS_BUCKET,
    bucketExists: false,
    bucketCreatedNow: false,
    tableExists: false,
    tableProbeError: null,
    ready: false,
    blockingCode: null,
    migrationHint: null,
  };

  if (!serviceRoleConfigured) {
    status.blockingCode = "config_missing";
    status.migrationHint =
      "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY on Vercel Production.";
    return status;
  }

  try {
    status.bucketExists = await listHasBucket();
    if (!status.bucketExists && createBucketIfMissing) {
      await createPrivateImageBucket();
      status.bucketCreatedNow = true;
      status.bucketExists = await listHasBucket();
    }
  } catch (error) {
    if (error instanceof AttachmentStorageError && error.code === "bucket_missing") {
      status.blockingCode = "bucket_missing";
      return status;
    }
    status.blockingCode = "probe_failed";
    status.tableProbeError =
      error instanceof Error ? error.message.slice(0, 200) : "bucket_probe_failed";
    return status;
  }

  if (!status.bucketExists) {
    status.blockingCode = "bucket_missing";
    status.migrationHint =
      "Create private Storage bucket atlas-image-attachments (or re-run ensure).";
    return status;
  }

  const table = await probeTableExists();
  status.tableExists = table.exists;
  status.tableProbeError = table.errorMessage;

  if (!table.exists) {
    // Distinguish true missing vs other probe failures.
    const missing =
      table.errorMessage?.includes("does not exist") ||
      table.errorMessage?.includes("Could not find the table") ||
      table.errorMessage?.includes("42P01") ||
      table.errorMessage?.includes("PGRST205");
    status.blockingCode = missing || table.errorMessage === "service_role_missing"
      ? "table_missing"
      : table.errorMessage
        ? "probe_failed"
        : "table_missing";
    status.migrationHint =
      "Apply supabase/migrations/20260726_atlas_image_attachments.sql in the Supabase SQL editor.";
    return status;
  }

  status.ready = true;
  status.blockingCode = null;
  return status;
}

/** Throw a typed error when infrastructure is not ready for uploads. */
export async function assertAttachmentInfrastructureReady(): Promise<AttachmentInfrastructureStatus> {
  const status = await ensureAttachmentInfrastructure({ createBucketIfMissing: true });
  if (status.ready) return status;

  if (status.blockingCode === "config_missing") {
    throw new AttachmentStorageError({
      code: "config_missing",
      stage: "ensure.config",
    });
  }
  if (status.blockingCode === "bucket_missing") {
    throw new AttachmentStorageError({
      code: "bucket_missing",
      stage: "ensure.bucket",
    });
  }
  if (status.blockingCode === "table_missing") {
    throw new AttachmentStorageError({
      code: "table_missing",
      stage: "ensure.table",
      providerMessage: status.tableProbeError ?? undefined,
    });
  }
  throw new AttachmentStorageError({
    code: "upload_failed",
    stage: "ensure.probe",
    providerMessage: status.tableProbeError ?? undefined,
  });
}
