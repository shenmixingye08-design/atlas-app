import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isResourceOwnedByUser,
  ownershipDeniedResponse,
} from "@/lib/auth/ownership";
import {
  encodeOAuthTokenPairForStorage,
  isEncryptedOAuthPayload,
  redactOAuthSecrets,
} from "@/lib/integrations/oauth-crypto";
import {
  assertNoSecretMaterial,
  clientSafeMessage,
  publicErrorBody,
  redactSecrets,
  safeLog,
  toPublicErrorResponse,
} from "@/lib/security";

const KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("P0-04 secrets / token / PII leakage", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "1");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1", KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("A: OAuth token redaction", () => {
    const redacted = redactOAuthSecrets({
      access_token: "ya29.access-secret-value",
      refresh_token: "1//refresh-secret-value",
      nested: { authorization: "Bearer abc.def.ghi" },
    }) as Record<string, unknown>;
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("ya29.access-secret-value");
    expect(json).not.toContain("1//refresh-secret-value");
    expect(redacted.access_token).toBe("[redacted]");
    expect(redacted.refresh_token).toBe("[redacted]");
  });

  it("B: Authorization header redaction", () => {
    const redacted = redactSecrets({
      headers: { Authorization: "Bearer sk-proj-super-secret-key" },
    });
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("sk-proj-super-secret-key");
    expect(json).toContain("[redacted]");
  });

  it("C: Cookie/session redaction", () => {
    const redacted = redactSecrets({
      cookie: "__session=eyJhbGciOiJIUzI1NiJ9.aaa.bbb",
      "set-cookie": "session=abc; HttpOnly",
      session: "sess_live_secret",
    });
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("sess_live_secret");
    expect(json).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(json).toContain("[redacted]");
  });

  it("D: OpenAI key non-exposure in public error / redactor", () => {
    const body = publicErrorBody({
      error: "OpenAI rejected key sk-abcdefghijklmnopqrstuvwxyz",
      code: "openai_failed",
      diagnosticId: "diag_1",
    });
    const json = JSON.stringify(body);
    expect(json).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(body.diagnosticId).toBe("diag_1");
    expect(assertNoSecretMaterial(json)).toBe(true);
  });

  it("E: Supabase service-role non-exposure", () => {
    const redacted = redactSecrets({
      SUPABASE_SERVICE_ROLE_KEY: "service_role_super_secret",
      database_url: "postgres://user:pass@host:5432/db",
    });
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("service_role_super_secret");
    expect(json).not.toContain("postgres://user:pass");
    expect(json).toMatch(/\[redacted/);
  });

  it("F: Stripe secret non-exposure", () => {
    const redacted = redactSecrets({
      stripe_secret: "sk_live_abcdefghijklmnopqrstuv",
      webhook_secret: "whsec_abcdefghijklmnopqrstuv",
      note: "key sk_test_abcdefghijklmnopqrstuv",
    });
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("sk_live_abcdefghijklmnopqrstuv");
    expect(json).not.toContain("whsec_abcdefghijklmnopqrstuv");
    expect(json).not.toContain("sk_test_abcdefghijklmnopqrstuv");
  });

  it("G: production error stack non-exposure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const error = new Error("boom with sk_live_should_not_leak_zzzz");
    error.stack = "Error: boom\n    at /app/lib/secret.ts:1:1";
    const response = toPublicErrorResponse(error, {
      status: 500,
      code: "internal_error",
      diagnosticId: "diag_prod",
      logLabel: "[p0-04 test]",
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    const json = JSON.stringify(body);
    expect(json).not.toContain("sk_live_should_not_leak");
    expect(json).not.toContain("/app/lib/secret.ts");
    expect(json).not.toContain("stack");
    expect(body.error).toBe("Internal server error");
    expect(body.diagnosticId).toBe("diag_prod");
  });

  it("H: client bundle secret non-exposure (source invariants)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = process.cwd();

    const clientFiles: string[] = [];
    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === ".git"
        ) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.(tsx|ts|jsx|js)$/.test(entry.name)) continue;
        const text = await fs.readFile(full, "utf8");
        if (text.includes('"use client"') || text.includes("'use client'")) {
          clientFiles.push(full);
        }
      }
    }
    await walk(path.join(root, "app"));
    await walk(path.join(root, "components"));

    const forbidden =
      /process\.env\.(OPENAI_API_KEY|STRIPE_SECRET_KEY|CLERK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY)/;

    for (const file of clientFiles) {
      const text = await fs.readFile(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
      expect(text, file).not.toMatch(/sk_live_[A-Za-z0-9]{20,}/);
      expect(text, file).not.toMatch(/whsec_[A-Za-z0-9]{20,}/);
    }
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it("I: API error secret non-exposure via clientSafeMessage", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const message = clientSafeMessage(
      new Error("provider failed Authorization: Bearer ya29.leak"),
      "処理に失敗しました",
    );
    expect(message).toBe("処理に失敗しました");
    expect(message).not.toContain("ya29");
  });

  it("J: logging sanitizer", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    safeLog("error", "[p0-04]", {
      access_token: "ya29.should-not-print",
      email: "user@example.com",
      prompt: "secret user prompt body",
    });
    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).not.toContain("ya29.should-not-print");
    expect(logged).not.toContain("user@example.com");
    expect(logged).not.toContain("secret user prompt body");
    spy.mockRestore();
  });

  it("K: P0-02 ciphertext maintained", () => {
    const pair = encodeOAuthTokenPairForStorage({
      accessToken: "ya29.access-plain",
      refreshToken: "refresh-plain-value",
    });
    expect(isEncryptedOAuthPayload(pair.accessTokenCiphertext)).toBe(true);
    expect(isEncryptedOAuthPayload(pair.refreshTokenCiphertext)).toBe(true);
    expect(pair.accessTokenCiphertext).not.toContain("ya29.access-plain");
    expect(pair.refreshTokenCiphertext).not.toContain("refresh-plain-value");
    expect(pair.accessTokenCiphertext.startsWith("enc:v")).toBe(true);
  });

  it("L: P0-03 ownership maintained", async () => {
    expect(isResourceOwnedByUser("user_a", "user_a")).toBe(true);
    expect(isResourceOwnedByUser("user_a", "user_b")).toBe(false);
    const denied = ownershipDeniedResponse(404);
    expect(denied.status).toBe(404);
    const body = (await denied.json()) as Record<string, unknown>;
    expect(body.error).toBe("Not found");
    expect(JSON.stringify(body)).not.toMatch(/token|secret|user_a/i);
  });

  it("assertNoSecretMaterial rejects tokenish public bodies", () => {
    expect(
      assertNoSecretMaterial('{"error":"Bearer ya29.abcdefg"}'),
    ).toBe(false);
    expect(assertNoSecretMaterial('{"ok":true,"status":"ok"}')).toBe(true);
  });
});
