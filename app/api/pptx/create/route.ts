import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { requireBillingAiUsage } from "@/lib/billing/access/enforce";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import {
  createPptxFromAssignment,
  createPptxFromUpload,
  PPTX_LIMITS,
  userMessageForPptxCode,
} from "@/lib/pptx-secretary";
import { persistSecretaryArtifact } from "@/lib/artifact-platform/persist-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
        if (file.size > PPTX_LIMITS.maxUploadBytes) {
          return Response.json(
            {
              ok: false,
              code: "file_too_large",
              error: userMessageForPptxCode("file_too_large"),
            },
            { status: 413 },
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await createPptxFromUpload({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          buffer,
          assignment: assignment || file.name,
        });
        if (!result.ok || !result.buffer) {
          return Response.json(
            {
              ok: false,
              errors: result.errors,
              code: result.errors[0]?.code ?? "pptx_generation_failed",
            },
            { status: 422 },
          );
        }
        const artifact = await persistSecretaryArtifact({
          userId,
          buffer: result.buffer,
          format: "pptx",
          fileName: result.fileName,
          createdFrom: "pptx-secretary-upload",
        });
        return Response.json({
          ok: true,
          fileName: result.fileName,
          slideCount: result.slideCount,
          preview: result.preview,
          warnings: result.warnings,
          presentation: result.presentation,
          base64: result.buffer.toString("base64"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          artifactId: artifact?.id ?? null,
          downloadUrl: artifact?.downloadUrl ?? null,
        });
      }
    }

    const body = (await request.json()) as {
      assignment?: string;
      contentMarkdown?: string;
      brand?: {
        companyName?: string;
        primaryColor?: string;
        accentColor?: string;
        footer?: string;
        contact?: string;
      };
    };

    const assignment = body.assignment?.trim() ?? "";
    if (!assignment) {
      return Response.json(
        { error: "どのようなプレゼン資料を作るか書いてください。" },
        { status: 400 },
      );
    }

    const result = await createPptxFromAssignment({
      assignment,
      contentMarkdown: body.contentMarkdown,
      brand: body.brand,
    });

    if (!result.ok || !result.buffer) {
      return Response.json(
        {
          ok: false,
          errors: result.errors,
          code: result.errors[0]?.code ?? "pptx_generation_failed",
        },
        { status: 422 },
      );
    }

    after(() => {
      console.info("[pptx-secretary] created", {
        userId,
        fileName: result.fileName,
        slides: result.slideCount,
      });
    });

    const artifact = await persistSecretaryArtifact({
      userId,
      buffer: result.buffer,
      format: "pptx",
      fileName: result.fileName,
      sourceContent: assignment,
      createdFrom: "pptx-secretary",
    });

    return Response.json({
      ok: true,
      fileName: result.fileName,
      slideCount: result.slideCount,
      preview: result.preview,
      warnings: result.warnings,
      presentation: result.presentation,
      base64: result.buffer.toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      artifactId: artifact?.id ?? null,
      downloadUrl: artifact?.downloadUrl ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "pptx_create_failed",
      },
      { status: 500 },
    );
  }
}
