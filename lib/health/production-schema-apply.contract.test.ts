import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("production schema apply wiring", () => {
  it("exposes public compatibility enums on the health route", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/health/production-schema/route.ts"),
      "utf8",
    );
    expect(route).toContain("toPublicSchemaCompatibility");
    expect(route).toContain("dbSchemaCompatibility");
    expect(route).toContain("authorizeHealthProbe");
  });

  it("minute scheduler applies production schema before tick", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/minute-scheduler.yml"),
      "utf8",
    );
    expect(workflow).toContain(
      "/api/health/production-schema?force=1&apply=1",
    );
    expect(workflow).toContain('"${BASE_URL}/api/automations/tick"');
    expect(
      workflow.indexOf("/api/health/production-schema?force=1&apply=1"),
    ).toBeLessThan(workflow.indexOf('"${BASE_URL}/api/automations/tick"'));
  });

  it("dedicated apply workflow exists for the ensure migration", () => {
    const workflow = readFileSync(
      join(
        process.cwd(),
        ".github/workflows/apply-production-schema-migration.yml",
      ),
      "utf8",
    );
    expect(workflow).toContain("20260822_prod_automation_schema_ensure.sql");
    expect(workflow).toContain("production-schema?force=1&apply=1");
    expect(workflow).toContain("workflow_dispatch");
  });
});
