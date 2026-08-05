import { describe, expect, it } from "vitest";

import {
  buildAutomationDiagnosticId,
  isSupabaseRelationMissingError,
} from "./supabase-error";

describe("isSupabaseRelationMissingError", () => {
  it("detects Postgres undefined_table", () => {
    expect(
      isSupabaseRelationMissingError({
        code: "42P01",
        message: 'relation "public.atlas_automation_definitions" does not exist',
      }),
    ).toBe(true);
  });

  it("detects PostgREST schema cache miss", () => {
    expect(
      isSupabaseRelationMissingError({
        code: "PGRST205",
        message:
          "Could not find the table 'public.atlas_automation_definitions' in the schema cache",
      }),
    ).toBe(true);
  });

  it("does not treat transient network errors as schema missing", () => {
    expect(
      isSupabaseRelationMissingError({
        code: "PGRST301",
        message: "JWT expired",
      }),
    ).toBe(false);
  });
});

describe("buildAutomationDiagnosticId", () => {
  it("prefixes scope", () => {
    expect(buildAutomationDiagnosticId("list")).toMatch(/^auto_list_/);
  });
});
