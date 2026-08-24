import { auth } from "@clerk/nextjs/server";

import { DELIVERABLE_BATCH_RATE_LIMIT } from "@/lib/deliverable-batch/config";
import { evaluateDeliverableBatchEntitlement } from "@/lib/deliverable-batch/entitlement";
import {
  createDeliverableBatch,
  listUserDeliverableBatches,
} from "@/lib/deliverable-batch/service";
import { DELIVERABLE_BATCH_LIVE_FORMATS } from "@/lib/deliverable-batch/types";
import type { CreateDeliverableBatchInput } from "@/lib/deliverable-batch/types";
import { consumeDistributedRateLimit } from "@/lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const batches = await listUserDeliverableBatches(userId);
  const entitlement = evaluateDeliverableBatchEntitlement({
    userId,
    requestedCount: 3,
    format: "txt",
  });
  return Response.json({
    batches,
    entitlement: {
      maxItems: entitlement.maxItems,
      remainingAiRuns: entitlement.remainingAiRuns,
      aiLimit: entitlement.aiLimit,
      zipAllowed: entitlement.zipAllowed,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const limited = await consumeDistributedRateLimit(
    `deliverable-batch:${userId}`,
    DELIVERABLE_BATCH_RATE_LIMIT,
  );
  if (!limited.allowed) {
    return Response.json(
      { error: "作成の間隔を少し空けてください。" },
      { status: 429 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "内容を確認できませんでした。" }, { status: 400 });
  }

  delete body.userId;
  delete body.user_id;

  if (JSON.stringify(body).length > 80_000) {
    return Response.json({ error: "入力が長すぎます。" }, { status: 413 });
  }

  const format = body.format;
  if (
    typeof format !== "string" ||
    !(DELIVERABLE_BATCH_LIVE_FORMATS as readonly string[]).includes(format)
  ) {
    return Response.json({ error: "この形式は現在お使いいただけません。" }, { status: 400 });
  }

  const input: CreateDeliverableBatchInput = {
    name: typeof body.name === "string" ? body.name.slice(0, 80) : undefined,
    inputType:
      body.inputType === "line_list" ||
      body.inputType === "spreadsheet" ||
      body.inputType === "attachments" ||
      body.inputType === "ai_themes"
        ? body.inputType
        : "ai_themes",
    common:
      body.common && typeof body.common === "object"
        ? (body.common as CreateDeliverableBatchInput["common"])
        : {
            purpose: "",
            audience: "",
            tone: "",
            length: "",
            structure: "",
            template: "",
            mustInclude: "",
            forbidden: "",
            fileNameRule: "",
          },
    format: format as CreateDeliverableBatchInput["format"],
    requestedCount:
      typeof body.requestedCount === "number" ? body.requestedCount : Number(body.requestedCount),
    sharedInstruction:
      typeof body.sharedInstruction === "string"
        ? body.sharedInstruction.slice(0, 2_000)
        : "",
    lines: Array.isArray(body.lines)
      ? body.lines
          .filter((line): line is string => typeof line === "string")
          .slice(0, 40)
      : undefined,
    spreadsheetRows: Array.isArray(body.spreadsheetRows)
      ? (body.spreadsheetRows as CreateDeliverableBatchInput["spreadsheetRows"])?.slice(
          0,
          20,
        )
      : undefined,
    columnMap:
      body.columnMap && typeof body.columnMap === "object"
        ? (body.columnMap as Record<string, string>)
        : undefined,
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as CreateDeliverableBatchInput["attachments"])?.slice(0, 12)
      : undefined,
  };

  const result = await createDeliverableBatch(userId, input);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ view: result.view }, { status: 201 });
}
