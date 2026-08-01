import { auth } from "@clerk/nextjs/server";

import { requireBillingAiUsage } from "@/lib/billing/access/enforce";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import {
  convertArtifact,
  createArtifactRevision,
  listSupportedConversions,
  normalizeArtifactFormat,
} from "@/lib/artifact-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(): Promise<Response> {
  return Response.json({
    conversions: listSupportedConversions(),
  });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const rateLimited = enforceAiRateLimit(userId);
  if (rateLimited) return rateLimited;
  const billingDenied = await requireBillingAiUsage(userId);
  if (billingDenied) return billingDenied;

  const body = (await request.json()) as {
    sourceArtifactId?: string;
    targetFormat?: string;
    options?: {
      revisionReason?: string;
      title?: string;
      idempotencyKey?: string;
      requestId?: string;
      jobId?: string;
    };
    /** Same-format revision with new bytes (base64). */
    revisionBase64?: string;
  };

  if (!body.sourceArtifactId) {
    return Response.json(
      { error: "sourceArtifactId が必要です。" },
      { status: 400 }
    );
  }

  if (body.revisionBase64) {
    const result = await createArtifactRevision({
      sourceArtifactId: body.sourceArtifactId,
      userId,
      buffer: Buffer.from(body.revisionBase64, "base64"),
      changeReason: body.options?.revisionReason,
      jobId: body.options?.jobId,
      idempotencyKey: body.options?.idempotencyKey,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  const targetFormat = normalizeArtifactFormat(body.targetFormat);
  if (!targetFormat) {
    return Response.json(
      { error: "targetFormat が正しくありません。" },
      { status: 400 }
    );
  }

  const result = await convertArtifact({
    sourceArtifactId: body.sourceArtifactId,
    targetFormat,
    userId,
    options: body.options,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
