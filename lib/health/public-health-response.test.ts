import { describe, expect, it } from "vitest";

import {
  healthAuthFailedStatus,
  scrubHealthPayload,
  toPublicHealthResponse,
} from "./public-health-response";

describe("public health response sanitizer", () => {
  it("strips migration/SQL/schema fields", () => {
    const publicBody = toPublicHealthResponse({
      ok: false,
      sqlPreview: "create table atlas_x (...)",
      migrationFiles: ["20260805_foo.sql"],
      error: "schema cache does not exist",
      envPresence: { serviceRole: true },
    });
    expect(publicBody).toEqual({
      ok: false,
      status: "unavailable",
      checkedAt: expect.any(String),
    });
    expect(JSON.stringify(publicBody)).not.toMatch(/sql|migration|schema|atlas_/i);
  });

  it("scrubs nested forbidden keys", () => {
    const scrubbed = scrubHealthPayload({
      ok: true,
      stackTrace: "Error: boom\n    at foo",
      nested: { sqlPreview: "SELECT 1", keep: "yes" },
    });
    expect(scrubbed.stackTrace).toBeUndefined();
    expect((scrubbed.nested as Record<string, unknown>).sqlPreview).toBeUndefined();
    expect((scrubbed.nested as Record<string, unknown>).keep).toBe("yes");
  });

  it("maps auth failures to 401/403", () => {
    expect(healthAuthFailedStatus(401)).toBe(401);
    expect(healthAuthFailedStatus(403)).toBe(403);
    expect(healthAuthFailedStatus(503)).toBe(401);
  });
});
