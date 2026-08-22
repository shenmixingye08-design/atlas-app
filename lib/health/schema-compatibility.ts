/**
 * Read-only classification of Production schema probe errors.
 * Never logs secrets. Public health may expose these enums only.
 */

export const PRODUCTION_SCHEMA_DEPENDENCIES = [
  "atlas_deliverable_files",
  "atlas_automation_jobs",
  "atlas_x_autopost_settings",
  "atlas_claim_x_post_jobs",
] as const;

export type ProductionSchemaDependency =
  (typeof PRODUCTION_SCHEMA_DEPENDENCIES)[number];

export type SchemaCompatibilityCode =
  | "compatible"
  | "missing_table"
  | "missing_column"
  | "missing_rpc"
  | "permission_error"
  | "schema_cache_error"
  | "unavailable";

export type SchemaCompatibilityReport = {
  status: "compatible" | "incompatible" | "unavailable";
  objects: Record<ProductionSchemaDependency, SchemaCompatibilityCode>;
};

export function classifySchemaCompatibilityError(
  error: string | null | undefined,
): SchemaCompatibilityCode {
  const msg = error?.trim() ?? "";
  if (!msg) return "compatible";
  if (/supabase_service_role_not_configured|not configured/i.test(msg)) {
    return "unavailable";
  }
  if (/42501|permission denied|not authorized|RLS/i.test(msg)) {
    return "permission_error";
  }
  if (
    /function .* does not exist|PGRST202|Could not find the function/i.test(msg)
  ) {
    return "missing_rpc";
  }
  if (
    /Could not find the ['"][^'"]+['"] column|column .* does not exist|PGRST204/i.test(
      msg,
    )
  ) {
    return "missing_column";
  }
  if (
    /42P01|relation .* does not exist|Could not find the table/i.test(msg)
  ) {
    return "missing_table";
  }
  if (/schema cache|PGRST205/i.test(msg)) {
    return "schema_cache_error";
  }
  return "unavailable";
}

export function buildSchemaCompatibilityReport(input: {
  deliverableFilesError: string | null;
  automationJobsError: string | null;
  xAutopostSettingsError: string | null;
  claimXPostJobsError: string | null;
  deliverableFilesOk: boolean;
  automationJobsOk: boolean;
  xAutopostSettingsOk: boolean;
  claimXPostJobsOk: boolean;
  serviceConfigured: boolean;
}): SchemaCompatibilityReport {
  if (!input.serviceConfigured) {
    return {
      status: "unavailable",
      objects: {
        atlas_deliverable_files: "unavailable",
        atlas_automation_jobs: "unavailable",
        atlas_x_autopost_settings: "unavailable",
        atlas_claim_x_post_jobs: "unavailable",
      },
    };
  }

  const objects: SchemaCompatibilityReport["objects"] = {
    atlas_deliverable_files: input.deliverableFilesOk
      ? "compatible"
      : classifySchemaCompatibilityError(input.deliverableFilesError),
    atlas_automation_jobs: input.automationJobsOk
      ? "compatible"
      : classifySchemaCompatibilityError(input.automationJobsError),
    atlas_x_autopost_settings: input.xAutopostSettingsOk
      ? "compatible"
      : classifySchemaCompatibilityError(input.xAutopostSettingsError),
    atlas_claim_x_post_jobs: input.claimXPostJobsOk
      ? "compatible"
      : classifySchemaCompatibilityError(input.claimXPostJobsError),
  };

  const values = Object.values(objects);
  const status = values.every((code) => code === "compatible")
    ? "compatible"
    : values.every((code) => code === "unavailable")
      ? "unavailable"
      : "incompatible";

  return { status, objects };
}

/** Public-safe keys — no atlas_ table names in the HTTP payload. */
export function toPublicSchemaCompatibility(report: SchemaCompatibilityReport): {
  dbSchemaCompatibility: SchemaCompatibilityReport["status"];
  deliverableFilesCompatibility: SchemaCompatibilityCode;
  automationJobsCompatibility: SchemaCompatibilityCode;
  xAutopostSettingsCompatibility: SchemaCompatibilityCode;
  claimXPostJobsCompatibility: SchemaCompatibilityCode;
} {
  return {
    dbSchemaCompatibility: report.status,
    deliverableFilesCompatibility: report.objects.atlas_deliverable_files,
    automationJobsCompatibility: report.objects.atlas_automation_jobs,
    xAutopostSettingsCompatibility: report.objects.atlas_x_autopost_settings,
    claimXPostJobsCompatibility: report.objects.atlas_claim_x_post_jobs,
  };
}
