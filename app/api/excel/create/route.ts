import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { requireBillingAiUsage } from "@/lib/billing/access/enforce";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import {
  createExcelFromAssignment,
  createExcelFromUpload,
} from "@/lib/excel-secretary";
import { EXCEL_LIMITS } from "@/lib/excel-secretary/limits";
import { userMessageForExcelCode } from "@/lib/excel-secretary/job-phase";
import { persistSecretaryArtifact } from "@/lib/artifact-platform/persist-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Create Excel from natural language and/or uploaded file.
 * Returns binary xlsx + preview JSON for the deliverable UI.
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = enforceAiRateLimit(userId);
  if (rateLimited) return rateLimited;
  const billingDenied = await requireBillingAiUsage(userId);
  if (billingDenied) return billingDenied;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const assignment = String(form.get("assignment") ?? "");
      const file = form.get("file");
      if (file instanceof File) {
        if (file.size > EXCEL_LIMITS.maxUploadBytes) {
          return Response.json(
            {
              ok: false,
              code: "file_too_large",
              error: userMessageForExcelCode("file_too_large"),
              stage: "intent",
            },
            { status: 413 },
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await createExcelFromUpload({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          buffer,
          title: assignment || file.name,
        });
        if (!result.ok || !result.buffer) {
          return Response.json(
            {
              ok: false,
              errors: result.errors,
              stage: result.errors[0]?.stage ?? "excel_build",
              code: result.errors[0]?.code ?? "excel_generation_failed",
            },
            { status: 422 },
          );
        }
        const artifact = await persistSecretaryArtifact({
          userId,
          buffer: result.buffer,
          format: "xlsx",
          fileName: result.fileName,
          createdFrom: "excel-secretary-upload",
        });
        return Response.json({
          ok: true,
          fileName: result.fileName,
          preview: result.preview,
          warnings: result.warnings,
          base64: result.buffer.toString("base64"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          artifactId: artifact?.id ?? null,
          downloadUrl: artifact?.downloadUrl ?? null,
        });
      }
    }

    const body = (await request.json()) as {
      assignment?: string;
      contentMarkdown?: string;
    };
    const assignment = body.assignment?.trim() ?? "";
    if (!assignment) {
      return Response.json(
        { error: "何のExcelを作るか書いてください。", stage: "intent" },
        { status: 400 },
      );
    }

    const result = await createExcelFromAssignment({
      assignment,
      contentMarkdown: body.contentMarkdown,
    });
    if (!result.ok || !result.buffer) {
      return Response.json(
        {
          ok: false,
          errors: result.errors,
          stage: result.errors[0]?.stage ?? "excel_build",
        },
        { status: 422 },
      );
    }

    // Persist async breadcrumb without blocking response.
    after(() => {
      console.info("[excel-secretary] created", {
        userId,
        fileName: result.fileName,
        sheets: result.preview?.sheets.length ?? 0,
      });
    });

    const artifact = await persistSecretaryArtifact({
      userId,
      buffer: result.buffer,
      format: "xlsx",
      fileName: result.fileName,
      sourceContent: assignment,
      createdFrom: "excel-secretary",
    });

    return Response.json({
      ok: true,
      fileName: result.fileName,
      preview: result.preview,
      warnings: result.warnings,
      base64: result.buffer.toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      artifactId: artifact?.id ?? null,
      downloadUrl: artifact?.downloadUrl ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        stage: "excel_build",
        error: error instanceof Error ? error.message : "excel_create_failed",
      },
      { status: 500 },
    );
  }
}
