import { auth } from "@clerk/nextjs/server";
import { getMemoryDashboardSnapshot } from "@/lib/personal-memory/apply-metrics";
import { listPersonalMemories } from "@/lib/personal-memory/service";
import { confidenceTier, confidenceTierLabel } from "@/lib/personal-memory/confidence";
import { getMemoryUseStats } from "@/lib/personal-memory/apply-metrics";
import { listMemoryVersions } from "@/lib/personal-memory/versioning";
import { SCOPE_LABELS } from "@/lib/personal-memory/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";

  const memories = (await listPersonalMemories(userId, { status: "all" })).filter(
    (memory) => memory.status !== "deleted",
  );
  const filtered = memories.filter((memory) => {
    if (status && memory.status !== status) return false;
    if (category && memory.scope !== category) return false;
    if (!q) return true;
    const hay = `${memory.title} ${memory.summary} ${SCOPE_LABELS[memory.scope]} ${JSON.stringify(memory.value)}`.toLowerCase();
    return hay.includes(q);
  });

  const byCategory: Record<string, number> = {};
  for (const memory of memories) {
    const label = SCOPE_LABELS[memory.scope] ?? memory.scope;
    byCategory[label] = (byCategory[label] ?? 0) + 1;
  }

  const snapshot = getMemoryDashboardSnapshot({ userId, limit: 40 });
  const versions = listMemoryVersions({ userId, limit: 40 });

  return Response.json(
    {
      snapshot,
      counts: {
        total: memories.length,
        active: memories.filter((m) => m.status === "active").length,
        candidate: memories.filter((m) => m.status === "candidate").length,
        formal: memories.filter(
          (m) => m.status === "active" && confidenceTier(m.confidence) === "formal",
        ).length,
      },
      byCategory,
      memories: filtered.slice(0, 100).map((memory) => {
        const tier = confidenceTier(memory.confidence);
        const stats = getMemoryUseStats(memory.id);
        return {
          id: memory.id,
          title: memory.title,
          summary: memory.summary,
          scope: memory.scope,
          scopeLabel: SCOPE_LABELS[memory.scope],
          status: memory.status,
          confidence: memory.confidence,
          tier,
          tierLabel: confidenceTierLabel(tier),
          used: stats.used,
          successRate: stats.successRate,
          updatedAt: memory.updatedAt,
          createdAt: memory.createdAt,
        };
      }),
      versions: versions.map((v) => ({
        id: v.id,
        at: v.at,
        memoryId: v.memoryId,
        action: v.action,
        approvedBy: v.approvedBy,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
