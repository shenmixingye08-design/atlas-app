import { auth } from "@clerk/nextjs/server";

import { listWorkMemories } from "@/lib/work-memory/service";
import { buildExecutiveDashboard } from "@/lib/executive-assistant/dashboard";
import type {
  ExecutiveAssistantInput,
  SecretaryMode,
} from "@/lib/executive-assistant/types";

/**
 * GET /api/executive-assistant
 * Optional query: mode, max
 * Body not required — client may POST richer snapshots later.
 */
export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode") as SecretaryMode | null;
  const max = Number(url.searchParams.get("max") ?? "6");

  let workMemories: ExecutiveAssistantInput["workMemories"] = [];
  try {
    const listed = listWorkMemories(userId);
    workMemories = listed.memories.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      summary: m.summary,
      tags: m.tags,
      usageCount: m.usageCount,
      lastUsedAt: m.lastUsedAt,
      structuredData: m.structuredData,
      isUserConfirmed: m.isUserConfirmed,
    }));
  } catch {
    workMemories = [];
  }

  // Automations/projects are primarily client-supplied for V1 habits;
  // server returns memory-enriched empty shell when client merges.
  const dashboard = buildExecutiveDashboard({
    automations: [],
    projects: [],
    workMemories,
    secretaryMode:
      modeParam === "off" ||
      modeParam === "suggest_only" ||
      modeParam === "semi_auto" ||
      modeParam === "full_auto"
        ? modeParam
        : "suggest_only",
    maxProposals: Number.isFinite(max) ? max : 6,
  });

  return Response.json({ dashboard, userId });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | Partial<ExecutiveAssistantInput>
    | null;
  if (!body) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  let workMemories = body.workMemories ?? [];
  if (!workMemories.length) {
    try {
      const listed = listWorkMemories(userId);
      workMemories = listed.memories.map((m) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        summary: m.summary,
        tags: m.tags,
        usageCount: m.usageCount,
        lastUsedAt: m.lastUsedAt,
        structuredData: m.structuredData,
        isUserConfirmed: m.isUserConfirmed,
      }));
    } catch {
      workMemories = [];
    }
  }

  const dashboard = buildExecutiveDashboard({
    automations: body.automations ?? [],
    projects: body.projects ?? [],
    jobUsage: body.jobUsage ?? [],
    workMemories,
    notifications: body.notifications ?? [],
    replyMissSignals: body.replyMissSignals ?? [],
    secretaryMode: body.secretaryMode ?? "suggest_only",
    workStyle: body.workStyle ?? [],
    dismissedKeys: body.dismissedKeys ?? [],
    snoozedUntil: body.snoozedUntil ?? {},
    maxProposals: body.maxProposals ?? 6,
  });

  return Response.json({ dashboard });
}
