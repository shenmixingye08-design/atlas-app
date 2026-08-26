import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifySchemaCompatibilityError,
} from "./schema-compatibility";
import {
  DB_SCHEMA_COMPATIBILITY_OBJECTS,
} from "./db-schema-compatibility";

describe("DB_SCHEMA_COMPATIBILITY diagnostic", () => {
  it("covers required tables and RPCs", () => {
    expect(DB_SCHEMA_COMPATIBILITY_OBJECTS).toEqual(
      expect.arrayContaining([
        "atlas_user_state",
        "atlas_user_notifications",
        "atlas_billing_usage_counters",
        "atlas_increment_usage_counter_once",
        "atlas_deliverable_files",
        "atlas_automation_jobs",
        "atlas_claim_x_post_jobs",
      ]),
    );
  });

  it("detects missing table, missing RPC, and permission errors", () => {
    expect(
      classifySchemaCompatibilityError(
        "Could not find the table 'public.atlas_user_state' in the schema cache",
      ),
    ).toBe("missing_table");
    expect(
      classifySchemaCompatibilityError(
        "Could not find the function public.atlas_increment_usage_counter_once",
      ),
    ).toBe("missing_rpc");
    expect(classifySchemaCompatibilityError("42501 permission denied")).toBe(
      "permission_error",
    );
  });

  it("reports unavailable when service role is missing", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/service-role", () => ({
      createServiceRoleClientIfConfigured: () => null,
    }));
    const { probeDbSchemaCompatibility } = await import(
      "./db-schema-compatibility"
    );
    const result = await probeDbSchemaCompatibility();
    expect(result.diagnostic).toBe("DB_SCHEMA_COMPATIBILITY");
    expect(result.status).toBe("unavailable");
    expect(result.ok).toBe(false);
    expect(result.objects.every((row) => row.status === "unavailable")).toBe(
      true,
    );
  });
});
