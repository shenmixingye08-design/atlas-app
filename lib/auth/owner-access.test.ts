import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decideOwnerAccess, ownerAccessJsonResponse } from "./owner-access";

describe("decideOwnerAccess", () => {
  beforeEach(() => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows Owner", () => {
    expect(
      decideOwnerAccess({
        userId: "user_owner",
        email: "owner@atlas.test",
      }),
    ).toEqual({ status: "ok", email: "owner@atlas.test" });
  });

  it("rejects unauthenticated callers", () => {
    expect(decideOwnerAccess({ userId: null, email: null })).toEqual({
      status: "unauthenticated",
    });
  });

  it("rejects non-Owner users", () => {
    expect(
      decideOwnerAccess({
        userId: "user_regular",
        email: "user@example.com",
      }),
    ).toEqual({ status: "forbidden" });
  });
});

describe("ownerAccessJsonResponse", () => {
  it("returns 401 for unauthenticated", async () => {
    const response = ownerAccessJsonResponse({ status: "unauthenticated" });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for non-Owner", async () => {
    const response = ownerAccessJsonResponse({ status: "forbidden" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
