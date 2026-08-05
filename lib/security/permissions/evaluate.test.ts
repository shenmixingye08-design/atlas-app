import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    email === "owner@atlas.test",
}));

import { buildPrincipal, evaluatePermission } from "./evaluate";

describe("evaluatePermission", () => {
  it("denies unauthenticated", () => {
    const result = evaluatePermission({
      principal: buildPrincipal({ userId: null }),
      resource: "artifact",
      action: "read",
      resourceOwnerUserId: "u1",
    });
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("deny_unauthenticated");
  });

  it("denies cross-tenant artifact access", () => {
    const result = evaluatePermission({
      principal: buildPrincipal({ userId: "u1", email: "a@b.c" }),
      resource: "artifact",
      action: "download",
      resourceOwnerUserId: "u2",
    });
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("deny_cross_tenant");
  });

  it("allows owner on admin", () => {
    const result = evaluatePermission({
      principal: buildPrincipal({
        userId: "owner",
        email: "owner@atlas.test",
      }),
      resource: "admin",
      action: "admin",
    });
    expect(result.allowed).toBe(true);
  });

  it("denies artifact share", () => {
    const result = evaluatePermission({
      principal: buildPrincipal({ userId: "u1", email: "a@b.c" }),
      resource: "artifact",
      action: "share",
      resourceOwnerUserId: "u1",
    });
    expect(result.allowed).toBe(false);
  });
});
