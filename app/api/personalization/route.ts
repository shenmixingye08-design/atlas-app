import { auth } from "@clerk/nextjs/server";

import {
  approveMemory,
  deleteOwnerMemory,
  disableOwnerMemory,
  exportOwnerMemories,
  getOwnerQualityMetrics,
  listOwnerGenerations,
  listOwnerMemories,
  listOwnerPredictions,
  rejectMemory,
  resolvePersonalization,
  setOwnerSessionMemoryDisabled,
} from "@/lib/personalization/service";
import type { MemoryCandidateStatus } from "@/lib/personalization/types";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "memories";
  const status = url.searchParams.get("status") as MemoryCandidateStatus | "all" | null;

  if (view === "metrics") {
    const metrics = await getOwnerQualityMetrics(userId);
    return Response.json({ metrics, kind: "measured" });
  }
  if (view === "generations") {
    const generations = await listOwnerGenerations(userId);
    return Response.json({ generations });
  }
  if (view === "predictions") {
    const predictions = await listOwnerPredictions(userId);
    return Response.json({ predictions });
  }
  if (view === "export") {
    return Response.json({ memories: exportOwnerMemories(userId) });
  }
  if (view === "preview") {
    const resolved = await resolvePersonalization({
      ownerId: userId,
      category: url.searchParams.get("category"),
      artifactType: url.searchParams.get("artifactType"),
      automationId: url.searchParams.get("automationId"),
      companyId: url.searchParams.get("companyId"),
      templateId: url.searchParams.get("templateId"),
    });
    return Response.json({
      previewLines: resolved.context.previewLines,
      appliedMemoryIds: resolved.context.appliedMemoryIds,
      conflicts: resolved.context.conflicts,
      requiresConfirmation: resolved.context.requiresConfirmation,
      label: "今回適用する好み",
    });
  }

  const memories = await listOwnerMemories(userId);
  const filtered =
    !status || status === "all"
      ? memories
      : memories.filter((m) => m.candidateStatus === status);

  return Response.json({
    memories: filtered,
    recentApplied: memories
      .filter((m) => m.lastAppliedAt)
      .sort((a, b) =>
        (b.lastAppliedAt ?? "").localeCompare(a.lastAppliedAt ?? ""),
      )
      .slice(0, 10),
    recentRejected: memories
      .filter((m) => m.candidateStatus === "rejected")
      .slice(0, 10),
  });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: string;
    memoryId?: string;
    sessionDisabled?: boolean;
  };

  try {
    if (body.action === "session_disable") {
      setOwnerSessionMemoryDisabled(userId, body.sessionDisabled === true);
      return Response.json({ ok: true, sessionDisabled: body.sessionDisabled === true });
    }
    if (!body.memoryId) {
      return Response.json({ error: "memoryId_required" }, { status: 400 });
    }
    if (body.action === "approve") {
      return Response.json({ memory: await approveMemory(userId, body.memoryId) });
    }
    if (body.action === "reject") {
      return Response.json({ memory: await rejectMemory(userId, body.memoryId) });
    }
    if (body.action === "disable") {
      return Response.json({
        memory: await disableOwnerMemory(userId, body.memoryId),
      });
    }
    if (body.action === "delete") {
      return Response.json({
        memory: await deleteOwnerMemory(userId, body.memoryId),
      });
    }
    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
