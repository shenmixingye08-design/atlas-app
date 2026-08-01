import { NextResponse } from "next/server";

import {
  assertVisionEvalCaseCounts,
  VISION_EVAL_CASES,
} from "@/lib/vision-eval/cases";
import { generateVisionEvalImages } from "@/lib/vision-eval/generate-images";
import { runLiveVisionCase } from "@/lib/vision-eval/run-live-case";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Internal Vision eval runner (uses server OPENAI_API_KEY).
 * Auth: Authorization: Bearer $CRON_SECRET
 * Never returns image bytes / secrets.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (process.env.ATLAS_MOCK_LLM === "true") {
    return NextResponse.json(
      { ok: false, error: "ATLAS_MOCK_LLM=true" },
      { status: 400 }
    );
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY missing on server" },
      { status: 503 }
    );
  }

  let body: { caseId?: string; generateArtifact?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  assertVisionEvalCaseCounts();
  const c = VISION_EVAL_CASES.find((x) => x.caseId === body.caseId);
  if (!c) {
    return NextResponse.json(
      {
        ok: false,
        error: "unknown_caseId",
        hint: "Pass caseId from vision-eval set (e.g. vr_receipt_01)",
      },
      { status: 400 }
    );
  }

  const fixtureDir = mkdtempSync(join(tmpdir(), "vision-eval-api-"));
  await generateVisionEvalImages([c], fixtureDir);
  const result = await runLiveVisionCase(c, {
    fixtureDir,
    generateArtifact: body.generateArtifact === true,
    environment: "production-http",
  });

  return NextResponse.json({
    ok: result.ok,
    ocrOk: result.ocrOk,
    caseId: result.caseId,
    requestId: result.requestId,
    jobId: result.jobId,
    diagnosticId: result.diagnosticId,
    openAiRequestId: result.openAiRequestId,
    httpStatus: result.httpStatus,
    totalMs: result.totalMs,
    visionMs: result.visionMs,
    retryCount: result.retryCount,
    finalStatus: result.finalStatus,
    failedStage: result.failedStage,
    developerCode: result.developerCode,
    timedOut: result.timedOut,
    failureClass: result.failureClass,
    score: result.score,
    analysis: result.analysis,
    artifactGenerated: result.artifactGenerated,
    artifactFormats: result.artifactFormats,
    log: result.log,
  });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    cases: VISION_EVAL_CASES.length,
    auth: "Authorization: Bearer $CRON_SECRET",
    note: "POST { caseId } to run one live Vision measurement on this deployment",
  });
}
