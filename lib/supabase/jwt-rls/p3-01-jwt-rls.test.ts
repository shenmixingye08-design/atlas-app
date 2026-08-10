/**
 * P3-01 JWT連携RLS — unit contracts.
 * Live PostgREST RLS is proven by Production `/api/health/jwt-rls`.
 */

import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeJwtPayloadUnsafe,
  mintClerkSupabaseJwt,
} from "./mint-clerk-jwt";
import { ATLAS_JWT_RLS_MIGRATION_SQL } from "./migration-sql";
import { clearJwtSecretCacheForTests } from "./resolve-jwt-secret";

describe("P3-01 JWT連携RLS", () => {
  afterEach(() => {
    clearJwtSecretCacheForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("happy path: mints JWT with Clerk userId as sub + authenticated role", () => {
    const token = mintClerkSupabaseJwt({
      userId: "user_clerk_abc",
      secret: "test-secret-at-least-16",
      expiresInSec: 60,
    });
    const payload = decodeJwtPayloadUnsafe(token);
    expect(payload).toMatchObject({
      sub: "user_clerk_abc",
      role: "authenticated",
      aud: "authenticated",
      iss: "supabase",
    });
    expect(typeof payload?.exp).toBe("number");
    expect(typeof payload?.iat).toBe("number");
  });

  it("failure path: empty userId / secret throws fail-closed", () => {
    expect(() =>
      mintClerkSupabaseJwt({ userId: "", secret: "test-secret-at-least-16" }),
    ).toThrow(/clerk_user_id_required/);
    expect(() =>
      mintClerkSupabaseJwt({ userId: "user_x", secret: "" }),
    ).toThrow(/supabase_jwt_secret_required/);
  });

  it("different users mint different sub claims (ownership isolation basis)", () => {
    const secret = "test-secret-at-least-16";
    const a = decodeJwtPayloadUnsafe(
      mintClerkSupabaseJwt({ userId: "user_a", secret }),
    );
    const b = decodeJwtPayloadUnsafe(
      mintClerkSupabaseJwt({ userId: "user_b", secret }),
    );
    expect(a?.sub).toBe("user_a");
    expect(b?.sub).toBe("user_b");
    expect(a?.sub).not.toBe(b?.sub);
  });

  it("retrySafe: reminting with same claims yields valid HS256 signature", () => {
    const secret = "test-secret-at-least-16";
    const t1 = mintClerkSupabaseJwt({ userId: "user_retry", secret });
    const t2 = mintClerkSupabaseJwt({ userId: "user_retry", secret });
    for (const token of [t1, t2]) {
      const [h, p, s] = token.split(".");
      const expected = createHmac("sha256", secret)
        .update(`${h}.${p}`)
        .digest("base64url");
      expect(s).toBe(expected);
    }
    expect(decodeJwtPayloadUnsafe(t1)?.sub).toBe("user_retry");
    expect(decodeJwtPayloadUnsafe(t2)?.sub).toBe("user_retry");
  });

  it("migration SQL wires auth.jwt() sub match (not memory SoT)", () => {
    expect(ATLAS_JWT_RLS_MIGRATION_SQL).toContain("atlas_jwt_rls_subjects");
    expect(ATLAS_JWT_RLS_MIGRATION_SQL).toContain("auth.jwt() ->> 'sub'");
    expect(ATLAS_JWT_RLS_MIGRATION_SQL).toContain("to authenticated");
    expect(ATLAS_JWT_RLS_MIGRATION_SQL).toContain("to anon");
    expect(ATLAS_JWT_RLS_MIGRATION_SQL).toContain("projects_jwt_select_own");
    expect(ATLAS_JWT_RLS_MIGRATION_SQL).not.toMatch(/globalThis|new Map/);
  });

  it("resolveSupabaseJwtSecret fail-closed when env/management absent", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    vi.stubEnv("SUPABASE_JWT_SECRET_KEY", "");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("SUPABASE_ACCESS_TOKEN", "");
    vi.stubEnv("SUPABASE_MANAGEMENT_TOKEN", "");
    vi.stubEnv("SUPABASE_PROJECT_REF", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { resolveSupabaseJwtSecret } = await import("./resolve-jwt-secret");
    clearJwtSecretCacheForTests();
    const result = await resolveSupabaseJwtSecret({ forceRefresh: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.source).toBe("none");
      expect(result.error).toBeTruthy();
    }
  });

  it("resolveSupabaseJwtSecret uses env when present", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "env-secret-value-16chars");
    const { resolveSupabaseJwtSecret } = await import("./resolve-jwt-secret");
    clearJwtSecretCacheForTests();
    const result = await resolveSupabaseJwtSecret({ forceRefresh: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("env");
      expect(result.secret).toBe("env-secret-value-16chars");
    }
  });

  it("strips surrounding quotes from Vercel-pasted JWT secret", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", '"quoted-secret-16chars"');
    const { resolveSupabaseJwtSecret } = await import("./resolve-jwt-secret");
    clearJwtSecretCacheForTests();
    const result = await resolveSupabaseJwtSecret({ forceRefresh: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.secret).toBe("quoted-secret-16chars");
      expect(result.source).toBe("env");
    }
  });

  it("duplicate/forged signature path: wrong secret does not match", () => {
    const good = mintClerkSupabaseJwt({
      userId: "user_x",
      secret: "correct-secret-16ch",
    });
    const [h, p] = good.split(".");
    const badSig = createHmac("sha256", "wrong-secret-xxxxx")
      .update(`${h}.${p}`)
      .digest("base64url");
    const forged = `${h}.${p}.${badSig}`;
    const goodSig = good.split(".")[2];
    expect(forged).not.toBe(good);
    expect(badSig).not.toBe(goodSig);
  });
});
