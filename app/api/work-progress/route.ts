import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  buildUserProgressSnapshot,
  completeUserProgressSession,
  getUserProgressSession,
  markUserProgressFileGenerating,
  resolveUserProgressKind,
  startUserProgressSession,
} from "@/lib/workspace/user-progress";

export const dynamic = "force-dynamic";

/** Start or read a user-facing progress session. */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    sessionId?: unknown;
    assignment?: unknown;
    metadata?: unknown;
  } | null;

  if (!body || typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const sessionId = body.sessionId.trim();
  const assignment =
    typeof body.assignment === "string" ? body.assignment : "";
  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : {};

  const existing = getUserProgressSession(userId, sessionId);
  if (existing) {
    return NextResponse.json(buildUserProgressSnapshot(existing));
  }

  const kind = resolveUserProgressKind({ assignment, metadata });
  const session = startUserProgressSession({ userId, sessionId, kind });
  return NextResponse.json(buildUserProgressSnapshot(session));
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = getUserProgressSession(userId, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(buildUserProgressSnapshot(session));
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    sessionId?: unknown;
    action?: unknown;
  } | null;

  if (!body || typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (typeof body.action !== "string") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const sessionId = body.sessionId.trim();
  let session = getUserProgressSession(userId, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "file_generating") {
    session = markUserProgressFileGenerating({
      userId,
      sessionId,
      fileGenerating: true,
    });
  } else if (body.action === "file_done") {
    session = markUserProgressFileGenerating({
      userId,
      sessionId,
      fileGenerating: false,
    });
    session = completeUserProgressSession({ userId, sessionId, failed: false });
  } else if (body.action === "failed") {
    session = completeUserProgressSession({ userId, sessionId, failed: true });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(buildUserProgressSnapshot(session));
}
