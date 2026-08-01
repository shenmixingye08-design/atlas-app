import { auth } from "@clerk/nextjs/server";

import {
  listUnifiedArtifacts,
  normalizeArtifactFormat,
  registerArtifact,
  suggestArtifactFormats,
  ArtifactPlatformError,
} from "@/lib/artifact-platform";
import type { ArtifactFormat } from "@/lib/artifact-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const url = new URL(request.url);
  const formats = (url.searchParams.get("formats") ?? "")
    .split(",")
    .map((f) => normalizeArtifactFormat(f))
    .filter(Boolean) as ArtifactFormat[];
  const sort = (url.searchParams.get("sort") ?? "newest") as
    | "newest"
    | "oldest"
    | "fileName"
    | "format"
    | "size"
    | "updated";
  const latestOnly = url.searchParams.get("latestOnly") === "1";
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const result = await listUnifiedArtifacts({
    userId,
    formats: formats.length ? formats : undefined,
    latestOnly,
    includeDeleted,
    sort,
    q,
    limit,
    offset,
  });

  return Response.json(result);
}

/** Register a binary artifact (base64) — used by secretaries / imports. */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      format?: string;
      title?: string;
      fileName?: string;
      contentBase64?: string;
      sourceContent?: string;
      sourceArtifactId?: string;
      asRevision?: boolean;
      changeReason?: string;
      suggestOnly?: boolean;
      requestText?: string;
    };

    if (body.suggestOnly && body.requestText) {
      return Response.json({
        suggestion: suggestArtifactFormats(body.requestText),
      });
    }

    const format = normalizeArtifactFormat(body.format);
    if (!format || !body.contentBase64) {
      return Response.json(
        { error: "format と contentBase64 が必要です。" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(body.contentBase64, "base64");
    const artifact = await registerArtifact({
      userId,
      buffer,
      format,
      title: body.title,
      fileName: body.fileName,
      sourceContent: body.sourceContent,
      sourceArtifactId: body.sourceArtifactId,
      asRevision: body.asRevision,
      changeReason: body.changeReason,
      createdFrom: "api_register",
    });

    return Response.json({ ok: true, artifact });
  } catch (error) {
    if (error instanceof ArtifactPlatformError) {
      return Response.json(error.toClientJson(), { status: 400 });
    }
    return Response.json(
      { error: "成果物の登録に失敗しました。" },
      { status: 500 }
    );
  }
}
