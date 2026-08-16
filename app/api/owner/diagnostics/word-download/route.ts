import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { buildWordDiagnosticsOverview } from "@/lib/deliverables/word-diagnostics";
import {
  getStoredDeliverableForUser,
  recoverDeliverableBinary,
} from "@/lib/deliverables/store";
import { hasPkHeader, sha256Hex } from "@/lib/deliverables/integrity";
import { mimeTypeForFormat } from "@/lib/deliverables/binary-guards";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only Word download diagnostics.
 * Never returns cookies, tokens, API keys, or full document bodies.
 */
export async function GET(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const { userId } = await auth();
  const url = new URL(request.url);
  const deliverableId = url.searchParams.get("deliverableId")?.trim() || null;
  const probe = url.searchParams.get("probe") === "1";

  const overview = await buildWordDiagnosticsOverview({ userId });

  let downloadProbe: {
    deliverableId: string;
    downloadUrl: string;
    httpStatus: number | null;
    contentType: string | null;
    contentDisposition: string | null;
    contentLength: string | null;
    hasPkHeader: boolean | null;
    sizeBytes: number | null;
    sha256: string | null;
    sha256MatchesStored: boolean | null;
    durationMs: number | null;
    stages: string[];
    ok: boolean;
    error: string | null;
  } | null = null;

  if (probe && deliverableId && userId) {
    const stages: string[] = [];
    const started = Date.now();
    try {
      stages.push("lookup");
      let stored = await getStoredDeliverableForUser(deliverableId, userId);
      if (!stored) {
        stages.push("recover");
        stored = await recoverDeliverableBinary(deliverableId, userId);
      }
      if (!stored) {
        downloadProbe = {
          deliverableId,
          downloadUrl: `/api/deliverables/${deliverableId}`,
          httpStatus: 404,
          contentType: null,
          contentDisposition: null,
          contentLength: null,
          hasPkHeader: null,
          sizeBytes: null,
          sha256: null,
          sha256MatchesStored: null,
          durationMs: Date.now() - started,
          stages,
          ok: false,
          error: "not_found",
        };
      } else {
        stages.push("integrity");
        const contentType = mimeTypeForFormat(stored.format);
        const sha = sha256Hex(stored.buffer);
        const pk = hasPkHeader(stored.buffer);
        stages.push("ready");
        downloadProbe = {
          deliverableId,
          downloadUrl: `/api/deliverables/${deliverableId}`,
          httpStatus: 200,
          contentType,
          contentDisposition: `attachment; filename="${stored.fileName}"`,
          contentLength: String(stored.buffer.byteLength),
          hasPkHeader: pk,
          sizeBytes: stored.buffer.byteLength,
          sha256: sha,
          sha256MatchesStored:
            !stored.contentSha256 || stored.contentSha256 === sha,
          durationMs: Date.now() - started,
          stages,
          ok: pk && stored.buffer.byteLength > 0,
          error: null,
        };
      }
    } catch (error) {
      downloadProbe = {
        deliverableId,
        downloadUrl: `/api/deliverables/${deliverableId}`,
        httpStatus: 500,
        contentType: null,
        contentDisposition: null,
        contentLength: null,
        hasPkHeader: null,
        sizeBytes: null,
        sha256: null,
        sha256MatchesStored: null,
        durationMs: Date.now() - started,
        stages,
        ok: false,
        error: clientSafeMessage(error, "probe_failed"),
      };
    }
  }

  return Response.json({
    ...overview,
    origin: url.origin,
    protocol: url.protocol.replace(":", ""),
    userAgent: request.headers.get("user-agent"),
    authState: userId ? "authenticated" : "anonymous",
    // Never echo secrets
    downloadProbe,
    note: "Android実機タップ確認は自動実行できません。下記手順で確認してください。",
  });
}
