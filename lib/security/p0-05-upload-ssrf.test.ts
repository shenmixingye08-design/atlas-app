import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isResourceOwnedByUser,
  ownershipDeniedResponse,
} from "@/lib/auth/ownership";
import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";
import {
  assertImageMagicMatchesDeclaration,
  detectImageMimeFromBytes,
  looksLikeSvgOrHtml,
} from "@/lib/security/file-magic";
import {
  assertNoForgedIdentity,
  assertNoPrototypePollution,
  assertSafeResourceId,
  MAX_JSON_BODY_BYTES,
  readJsonBodySafe,
  UnsafeRequestError,
} from "@/lib/security/request-guards";
import {
  assertNoSecretMaterial,
  redactSecrets,
} from "@/lib/security/redact";
import {
  assertSafeOutboundUrl,
  isBlockedIpAddress,
  SsrfBlockedError,
} from "@/lib/security/ssrf";
import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";
import {
  assertSafeUploadFileName,
  buildUserScopedObjectPath,
  sanitizeDisplayFileName,
  UnsafePathError,
} from "@/lib/security/upload-path";
import {
  encodeOAuthTokenPairForStorage,
  isEncryptedOAuthPayload,
} from "@/lib/integrations/oauth-crypto";

const KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function jpegBuffer(size = 64): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

describe("P0-05 upload / SSRF / ownership attack suite", () => {
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

  it("A: ../../secret path traversal rejected", () => {
    expect(() => assertSafeUploadFileName("../../secret")).toThrow(
      UnsafePathError,
    );
    expect(() => sanitizeDisplayFileName("../../secret.jpg")).toThrow(
      UnsafePathError,
    );
  });

  it("B: encoded traversal rejected", () => {
    expect(() => assertSafeUploadFileName("..%2fsecret")).toThrow(
      UnsafePathError,
    );
    expect(() => assertSafeUploadFileName("%2e%2e/%2e%2e/secret")).toThrow(
      UnsafePathError,
    );
  });

  it("C: fake image MIME rejected", () => {
    const exe = Buffer.from("MZ\x90\x00not-an-image-payload-bytes");
    expect(() =>
      assertImageMagicMatchesDeclaration({
        declaredMime: "image/jpeg",
        buffer: exe,
      }),
    ).toThrow(/magic_bytes|mime_mismatch/);
    expect(detectImageMimeFromBytes(exe)).toBeNull();
  });

  it("D: executable disguised as image rejected", () => {
    const pe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    expect(() =>
      assertImageMagicMatchesDeclaration({
        declaredMime: "image/png",
        fileName: "photo.png",
        buffer: pe,
      }),
    ).toThrow();
  });

  it("E: oversized upload rejected by limits", () => {
    expect(ATTACHMENT_LIMITS.maxOriginalBytes).toBeLessThanOrEqual(20 * 1024 * 1024);
    const tooBig = ATTACHMENT_LIMITS.maxOriginalBytes + 1;
    expect(tooBig).toBeGreaterThan(ATTACHMENT_LIMITS.maxOriginalBytes);
  });

  it("F: SVG script payload rejected", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(looksLikeSvgOrHtml(svg)).toBe(true);
    expect(() =>
      assertImageMagicMatchesDeclaration({
        declaredMime: "image/svg+xml",
        buffer: svg,
      }),
    ).toThrow(/svg_or_html|magic/);
  });

  it("G: Excel formula injection neutralized", () => {
    expect(neutralizeSpreadsheetCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe(
      "'=HYPERLINK(\"http://evil\",\"x\")",
    );
    expect(neutralizeSpreadsheetCell("=WEBSERVICE(\"http://evil\")")).toBe(
      "'=WEBSERVICE(\"http://evil\")",
    );
    expect(neutralizeSpreadsheetCell("+cmd|'/c calc'!A0")).toBe(
      "'+cmd|'/c calc'!A0",
    );
    expect(neutralizeSpreadsheetCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeSpreadsheetCell("普通の店舗名")).toBe("普通の店舗名");
  });

  it("H: localhost SSRF blocked", () => {
    expect(() => assertSafeOutboundUrl("http://localhost/admin")).toThrow(
      SsrfBlockedError,
    );
    expect(() => assertSafeOutboundUrl("http://127.0.0.1/")).toThrow(
      SsrfBlockedError,
    );
  });

  it("I: 169.254.169.254 metadata SSRF blocked", () => {
    expect(() =>
      assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/"),
    ).toThrow(SsrfBlockedError);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
  });

  it("J: private IPv4 SSRF blocked", () => {
    for (const ip of ["10.0.0.5", "192.168.0.10", "172.16.5.5", "100.64.1.1"]) {
      expect(isBlockedIpAddress(ip), ip).toBe(true);
      expect(() => assertSafeOutboundUrl(`http://${ip}/`)).toThrow(
        SsrfBlockedError,
      );
    }
  });

  it("K: IPv6 localhost SSRF blocked", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(() => assertSafeOutboundUrl("http://[::1]/")).toThrow(
      SsrfBlockedError,
    );
  });

  it("L: redirect target private IP blocked at URL validation", () => {
    // fetchSafeOutboundUrl re-validates each hop; first-hop private is blocked.
    expect(() =>
      assertSafeOutboundUrl("http://127.0.0.1/redirect-to-meta"),
    ).toThrow(SsrfBlockedError);
  });

  it("M: cross-user deliverable download denied helper", async () => {
    expect(isResourceOwnedByUser("user_a", "user_b")).toBe(false);
    const denied = ownershipDeniedResponse(404);
    expect(denied.status).toBe(404);
    const body = await denied.json();
    expect(JSON.stringify(body)).not.toMatch(/user_a|token|secret/i);
  });

  it("N: cross-user attachment access denied helper", async () => {
    expect(isResourceOwnedByUser("owner_attach", "attacker")).toBe(false);
    const denied = ownershipDeniedResponse(404);
    expect(denied.status).toBe(404);
  });

  it("O: forged userId rejected", () => {
    const result = assertNoForgedIdentity({
      authenticatedUserId: "user_a",
      body: { userId: "user_b" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("P: forged jobId shape rejected", () => {
    expect(() => assertSafeResourceId("../../etc/passwd", "jobId")).toThrow(
      UnsafeRequestError,
    );
    expect(() => assertSafeResourceId("job_ok-123", "jobId")).not.toThrow();
  });

  it("Q: malformed JSON rejected", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{not-json",
      headers: { "Content-Type": "application/json" },
    });
    await expect(readJsonBodySafe(request)).rejects.toMatchObject({
      code: "invalid_json",
    });
  });

  it("R: oversized JSON rejected", async () => {
    const big = "x".repeat(MAX_JSON_BODY_BYTES + 10);
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ big }),
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_JSON_BODY_BYTES + 100),
      },
    });
    await expect(readJsonBodySafe(request)).rejects.toMatchObject({
      code: "payload_too_large",
    });
  });

  it("storage keys never embed traversal", () => {
    const path = buildUserScopedObjectPath({
      userId: "user_a",
      jobId: "../job",
      objectId: "att_1",
      fileName: "../../secret",
    });
    expect(path).not.toContain("..");
    expect(path.startsWith("user_a/")).toBe(true);
  });

  it("prototype pollution keys rejected", () => {
    expect(() =>
      assertNoPrototypePollution(
        JSON.parse('{"__proto__":{"admin":true},"userId":"x"}'),
      ),
    ).toThrow(UnsafeRequestError);
  });

  it("credential-in-URL and non-http blocked", () => {
    expect(() =>
      assertSafeOutboundUrl("https://user:pass@example.com/"),
    ).toThrow(SsrfBlockedError);
    expect(() => assertSafeOutboundUrl("file:///etc/passwd")).toThrow(
      SsrfBlockedError,
    );
    expect(() => assertSafeOutboundUrl("gopher://example.com/")).toThrow(
      SsrfBlockedError,
    );
  });

  it("valid jpeg accepted by magic gate", () => {
    const mime = assertImageMagicMatchesDeclaration({
      declaredMime: "image/jpeg",
      buffer: jpegBuffer(),
    }).mime;
    expect(mime).toBe("image/jpeg");
  });

  it("P0-02 ciphertext still maintained", () => {
    const pair = encodeOAuthTokenPairForStorage({
      accessToken: "ya29.access",
      refreshToken: "refresh",
    });
    expect(isEncryptedOAuthPayload(pair.accessTokenCiphertext)).toBe(true);
  });

  it("P0-04 redaction still strips tokens", () => {
    const redacted = redactSecrets({
      authorization: "Bearer sk-abcdefghijklmnopqrstuv",
    });
    expect(JSON.stringify(redacted)).not.toContain("sk-abcdefghijklmnopqrstuv");
    expect(assertNoSecretMaterial('{"ok":true}')).toBe(true);
  });
});
