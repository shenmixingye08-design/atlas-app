import { describe, expect, it } from "vitest";

import {
  PRODUCTION_SCHEMA_DEPENDENCIES,
  buildSchemaCompatibilityReport,
  classifySchemaCompatibilityError,
  toPublicSchemaCompatibility,
} from "./schema-compatibility";

describe("schema compatibility classifier", () => {
  it("tracks the Production-required dependencies", () => {
    expect(PRODUCTION_SCHEMA_DEPENDENCIES).toEqual([
      "atlas_deliverable_files",
      "atlas_automation_jobs",
      "atlas_x_autopost_settings",
      "atlas_claim_x_post_jobs",
    ]);
  });

  it("classifies PostgREST / Postgres errors without treating cache as the only cause", () => {
    expect(
      classifySchemaCompatibilityError(
        "Could not find the table 'public.atlas_deliverable_files' in the schema cache",
      ),
    ).toBe("missing_table");
    expect(classifySchemaCompatibilityError("PGRST205")).toBe(
      "schema_cache_error",
    );
    expect(
      classifySchemaCompatibilityError(
        "Could not find the 'verified_at' column of 'atlas_deliverable_files' in the schema cache",
      ),
    ).toBe("missing_column");
    expect(
      classifySchemaCompatibilityError(
        "Could not find the function public.atlas_claim_x_post_jobs",
      ),
    ).toBe("missing_rpc");
    expect(classifySchemaCompatibilityError("42501 permission denied")).toBe(
      "permission_error",
    );
    expect(
      classifySchemaCompatibilityError("supabase_service_role_not_configured"),
    ).toBe("unavailable");
    expect(classifySchemaCompatibilityError(null)).toBe("compatible");
  });

  it("builds a public-safe report without atlas_ table names in HTTP keys", () => {
    const report = buildSchemaCompatibilityReport({
      deliverableFilesError:
        "Could not find the table 'public.atlas_deliverable_files' in the schema cache",
      automationJobsError: null,
      xAutopostSettingsError: null,
      claimXPostJobsError: "Could not find the function public.atlas_claim_x_post_jobs",
      deliverableFilesOk: false,
      automationJobsOk: true,
      xAutopostSettingsOk: true,
      claimXPostJobsOk: false,
      serviceConfigured: true,
    });
    expect(report.status).toBe("incompatible");
    expect(report.objects.atlas_deliverable_files).toBe("missing_table");
    expect(report.objects.atlas_claim_x_post_jobs).toBe("missing_rpc");

    const publicBody = toPublicSchemaCompatibility(report);
    expect(publicBody.dbSchemaCompatibility).toBe("incompatible");
    expect(publicBody.deliverableFilesCompatibility).toBe("missing_table");
    expect(publicBody.claimXPostJobsCompatibility).toBe("missing_rpc");
    expect(JSON.stringify(publicBody)).not.toMatch(/atlas_/);
  });

  it("marks the whole report unavailable when service role is missing", () => {
    const report = buildSchemaCompatibilityReport({
      deliverableFilesError: "supabase_service_role_not_configured",
      automationJobsError: "supabase_service_role_not_configured",
      xAutopostSettingsError: "supabase_service_role_not_configured",
      claimXPostJobsError: "supabase_service_role_not_configured",
      deliverableFilesOk: false,
      automationJobsOk: false,
      xAutopostSettingsOk: false,
      claimXPostJobsOk: false,
      serviceConfigured: false,
    });
    expect(report.status).toBe("unavailable");
    expect(toPublicSchemaCompatibility(report).dbSchemaCompatibility).toBe(
      "unavailable",
    );
  });
});
