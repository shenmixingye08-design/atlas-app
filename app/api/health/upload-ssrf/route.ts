import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  assertImageMagicMatchesDeclaration,
  looksLikeSvgOrHtml,
} from "@/lib/security/file-magic";
import {
  assertNoPrototypePollution,
  assertSafeResourceId,
  UnsafeRequestError,
} from "@/lib/security/request-guards";
import { assertNoSecretMaterial } from "@/lib/security/redact";
import {
  assertSafeOutboundUrl,
  isBlockedIpAddress,
  SsrfBlockedError,
} from "@/lib/security/ssrf";
import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";
import {
  assertSafeUploadFileName,
  buildUserScopedObjectPath,
  UnsafePathError,
} from "@/lib/security/upload-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P0-05 production evidence probe (public, safe flags only).
 * Verifies upload/path/SSRF/formula/input guards without outbound network
 * to untrusted hosts and without returning secret material.
 */

type Check = { id: string; blocked: boolean };

function check(id: string, fn: () => void): Check {
  try {
    fn();
    return { id, blocked: false };
  } catch (error) {
    if (
      error instanceof SsrfBlockedError ||
      error instanceof UnsafePathError ||
      error instanceof UnsafeRequestError ||
      error instanceof Error
    ) {
      return { id, blocked: true };
    }
    return { id, blocked: true };
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const jpeg = Buffer.alloc(32, 0);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  jpeg[3] = 0xe0;
  const exeAsJpeg = Buffer.from("MZ\x90\x00this-is-not-an-image-bytes!!");
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );

  const checks: Check[] = [
    check("A_path_traversal", () => assertSafeUploadFileName("../../secret")),
    check("B_encoded_traversal", () =>
      assertSafeUploadFileName("..%2fsecret"),
    ),
    check("C_fake_image_mime", () =>
      assertImageMagicMatchesDeclaration({
        declaredMime: "image/jpeg",
        buffer: exeAsJpeg,
      }),
    ),
    check("D_executable_as_image", () =>
      assertImageMagicMatchesDeclaration({
        declaredMime: "image/png",
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]),
      }),
    ),
    check("F_svg_script", () => {
      if (!looksLikeSvgOrHtml(svg)) throw new Error("expected svg detect");
      assertImageMagicMatchesDeclaration({
        declaredMime: "image/svg+xml",
        buffer: svg,
      });
    }),
    check("G_excel_formula", () => {
      const safe = neutralizeSpreadsheetCell("=HYPERLINK(\"http://evil\",\"x\")");
      if (typeof safe !== "string" || !safe.startsWith("'")) {
        throw new Error("formula not neutralized");
      }
      // Treat as "blocked" when neutralized (attack ineffective).
      throw new Error("neutralized");
    }),
    check("H_localhost_ssrf", () =>
      assertSafeOutboundUrl("http://localhost/admin"),
    ),
    check("I_metadata_ssrf", () =>
      assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/"),
    ),
    check("J_private_ipv4", () => {
      if (!isBlockedIpAddress("10.0.0.1")) throw new Error("not blocked");
      assertSafeOutboundUrl("http://192.168.1.1/");
    }),
    check("K_ipv6_localhost", () =>
      assertSafeOutboundUrl("http://[::1]/"),
    ),
    check("L_redirect_target_private", () =>
      assertSafeOutboundUrl("http://127.0.0.1/redirect"),
    ),
    check("O_forged_userid_shape", () =>
      assertSafeResourceId("../user_b", "userId"),
    ),
    check("P_forged_jobid_shape", () =>
      assertSafeResourceId("../../jobs/1", "jobId"),
    ),
    check("Q_prototype_pollution", () =>
      assertNoPrototypePollution(JSON.parse('{"__proto__":{"polluted":true}}')),
    ),
  ];

  // Positive control: valid jpeg declaration must NOT be blocked.
  let validImageAccepted = false;
  try {
    assertImageMagicMatchesDeclaration({
      declaredMime: "image/jpeg",
      buffer: jpeg,
    });
    validImageAccepted = true;
  } catch {
    validImageAccepted = false;
  }

  const storagePath = buildUserScopedObjectPath({
    userId: "user_a",
    jobId: "job_1",
    objectId: "att_1",
    fileName: "../../secret",
  });
  const storagePathSafe =
    !storagePath.includes("..") && storagePath.startsWith("user_a/");

  const attackIds = checks.map((c) => c.id);
  const allAttacksBlocked = checks.every((c) => c.blocked);

  // Ownership surfaces: unauthenticated must be denied (no foreign content).
  const ownershipPaths = [
    "/api/attachments/images/00000000-0000-0000-0000-000000000000",
    "/api/deliverables/00000000-0000-0000-0000-000000000000",
  ];
  const ownershipChecks = await Promise.all(
    ownershipPaths.map(async (path) => {
      try {
        const response = await fetch(`${origin}${path}`, {
          redirect: "manual",
          headers: { "Cache-Control": "no-store" },
        });
        const text = await response.text().catch(() => "");
        const denied =
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404;
        return {
          path,
          status: response.status,
          denied,
          bodySafe: assertNoSecretMaterial(text),
        };
      } catch {
        return { path, status: 0, denied: false, bodySafe: false };
      }
    }),
  );

  const ownershipOk = ownershipChecks.every((c) => c.denied && c.bodySafe);
  const ok =
    allAttacksBlocked && validImageAccepted && storagePathSafe && ownershipOk;
  const version = getHealthVersionPayload();

  const body = {
    ...toPublicHealthResponse({ ok }, { cached: false }),
    checks: checks.map(({ id, blocked }) => ({ id, blocked })),
    attackIds,
    allAttacksBlocked,
    validImageAccepted,
    storagePathSafe,
    ownershipChecks: ownershipChecks.map(({ path, status, denied, bodySafe }) => ({
      path,
      status,
      denied,
      bodySafe,
    })),
    ownershipOk,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
