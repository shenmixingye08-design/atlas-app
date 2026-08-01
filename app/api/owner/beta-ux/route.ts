import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { defaultBetaFindings } from "@/lib/beta-ux/findings";
import {
  computeBetaMetrics,
  evaluateGateTargets,
} from "@/lib/beta-ux/metrics";
import {
  listBetaFeedback,
  listBetaFindings,
  listBetaSessions,
  searchBetaByIds,
  setBetaFindings,
} from "@/lib/beta-ux/store";
import { BETA_FLOWS, NO_INSTRUCTION_BRIEF } from "@/lib/beta-ux/protocol";
import { listFunnelEvents, summarizeFunnel } from "@/lib/product-funnel/events";
import { getBetaUserManagementSnapshot } from "@/lib/owner/beta-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();

  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId") ?? undefined;
  const jobId = url.searchParams.get("jobId") ?? undefined;
  const artifactId = url.searchParams.get("artifactId") ?? undefined;

  const sessions = listBetaSessions(1000);
  const feedback = listBetaFeedback(500);
  const metrics = computeBetaMetrics(sessions, feedback);
  const findings = defaultBetaFindings({
    realTesterCount: metrics.testerCount,
    productionE2e: Boolean(process.env.PRODUCTION_E2E_BASE_URL?.trim()),
  });
  setBetaFindings(findings);
  const gates = evaluateGateTargets(metrics);
  const betaUsers = getBetaUserManagementSnapshot();

  const idHits =
    requestId || jobId || artifactId
      ? searchBetaByIds({ requestId, jobId, artifactId })
      : [];

  return Response.json({
    protocolBrief: NO_INSTRUCTION_BRIEF,
    flows: BETA_FLOWS,
    betaUsers,
    metrics,
    gates,
    findings: listBetaFindings(),
    feedback: feedback.map((f) => ({
      id: f.id,
      at: f.at,
      anonymousUserId: f.anonymousUserId,
      mostConfused: f.mostConfused,
      mostUseful: f.mostUseful,
      payIntent980: f.payIntent980,
      wouldReuse: f.wouldReuse,
      whyNotChatgpt: f.whyNotChatgpt,
    })),
    recentSessions: sessions.slice(0, 50).map((s) => ({
      sessionId: s.sessionId,
      anonymousUserId: s.anonymousUserId,
      flowId: s.flowId,
      deviceType: s.deviceType,
      completed: s.completed,
      downloaded: s.downloaded,
      stuckScreen: s.stuckScreen,
      dropoutReason: s.dropoutReason,
      durationMs: s.durationMs,
      requestId: s.requestId,
      jobId: s.jobId,
      artifactId: s.artifactId,
    })),
    idSearch: idHits,
    funnel: summarizeFunnel(listFunnelEvents(2000)),
    generatedAt: new Date().toISOString(),
  });
}
