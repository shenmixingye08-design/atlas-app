import { auth } from "@clerk/nextjs/server";

import {
  buildUnderstandingLog,
  buildUnderstandingPublicView,
} from "@/lib/request-understanding/diagnostics";
import { applyRequestOverrides, routeRequest } from "@/lib/request-understanding/route";
import type { AttachmentMeta, OutputFormat } from "@/lib/request-understanding/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/request/understand
 * Preview or correct request understanding before / during job start.
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const body = (await request.json()) as {
      assignment?: string;
      preferredFormat?: string | null;
      attachments?: AttachmentMeta[];
      idempotencyKey?: string | null;
      overrides?: {
        requested_outputs?: Array<{
          format: OutputFormat;
          purpose: string;
          required: boolean;
          confidence: number;
        }>;
        execution_mode?:
          | "answer"
          | "artifact"
          | "conversion"
          | "analysis"
          | "external_action"
          | "automation"
          | "mixed";
        skip_external?: boolean;
        skip_automation?: boolean;
        assumptions?: string[];
      };
    };

    const assignment = body.assignment?.trim() ?? "";
    if (!assignment && !(body.attachments?.length)) {
      return Response.json(
        { error: "依頼内容または添付が必要です" },
        { status: 400 },
      );
    }

    const decision = body.overrides
      ? applyRequestOverrides(
          {
            assignment,
            userId,
            preferredFormat: body.preferredFormat,
            attachments: body.attachments,
            idempotencyKey: body.idempotencyKey,
          },
          body.overrides,
        )
      : routeRequest({
          assignment,
          userId,
          preferredFormat: body.preferredFormat,
          attachments: body.attachments,
          idempotencyKey: body.idempotencyKey,
        });

    console.info(
      "[request-understanding/api]",
      buildUnderstandingLog({
        userId,
        rawInputLength: assignment.length,
        attachmentCount: body.attachments?.length ?? 0,
        decision,
        durationMs: Date.now() - started,
      }),
    );

    return Response.json({
      ok: true,
      decision: {
        target: decision.target,
        shouldStartJob: decision.shouldStartJob,
        shouldConfirm: decision.shouldConfirm,
        formats: decision.formats,
        userMessage: decision.userMessage,
        developerCode: decision.developerCode,
      },
      understanding: buildUnderstandingPublicView(decision.parsed),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "request_parse_failed",
        code: "request_parse_failed",
      },
      { status: 500 },
    );
  }
}
