import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { DIAGNOSIS_COOKIE } from "@/lib/growth/acquisition/constants";
import {
  bindDiagnosisToUser,
  completeDiagnosis,
  getBoundDiagnosis,
  recordDiagnosisEvent,
  recordDiagnosisFirstValueIfBound,
  recordDiagnosisPaidIfBound,
  startDiagnosis,
} from "@/lib/growth/acquisition/service";
import { rateLimitGrowthIngest } from "@/lib/owner/revenue-agent/public-ingest";
import { ensureVisitorIdCookie, visitorCookieOptions } from "@/lib/owner/revenue-agent/visitor-cookie";

export const dynamic = "force-dynamic";

function readTracking(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const pick = (key: string) => {
    const fromBody = typeof body?.[key] === "string" ? String(body[key]) : null;
    return fromBody ?? url.searchParams.get(key);
  };
  return {
    campaignId: pick("campaignId") ?? pick("utm_campaign"),
    contentId: pick("contentId") ?? pick("utm_content"),
    source: pick("source") ?? pick("utm_source"),
    medium: pick("medium") ?? pick("utm_medium"),
    referralId: pick("referralId"),
  };
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  const visitorId = await ensureVisitorIdCookie();
  if (!userId) {
    return Response.json({ session: null, visitorId });
  }
  const store = await cookies();
  let sessionId: string | null = null;
  try {
    const raw = store.get(DIAGNOSIS_COOKIE)?.value;
    sessionId = raw ? (JSON.parse(raw) as { sessionId?: string }).sessionId ?? null : null;
  } catch {
    sessionId = null;
  }
  if (sessionId) {
    await bindDiagnosisToUser({ userId, visitorId, sessionId });
  }
  const session = await getBoundDiagnosis(userId, visitorId);
  return Response.json({ session, visitorId });
}

export async function POST(request: Request): Promise<Response> {
  const limited = await rateLimitGrowthIngest(request);
  if (!limited.allowed) {
    return Response.json({ error: "Too Many Requests" }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const visitorId = await ensureVisitorIdCookie();
  const tracking = readTracking(request, body);
  const action = typeof body.action === "string" ? body.action : "";
  const { userId } = await auth();

  if (action === "view") {
    await recordDiagnosisEvent({
      eventName: "diagnosis_viewed",
      visitorId,
      ...tracking,
    });
    return Response.json({ ok: true, visitorId });
  }

  if (action === "start") {
    const session = await startDiagnosis({ visitorId, ...tracking });
    return Response.json({ ok: true, session });
  }

  if (action === "complete") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return Response.json({ error: "sessionId が必要です" }, { status: 400 });
    }
    const result = await completeDiagnosis({
      visitorId,
      sessionId,
      answers: body.answers,
      extra: body,
      ...tracking,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    const store = await cookies();
    store.set(
      DIAGNOSIS_COOKIE,
      JSON.stringify({
        sessionId: result.session.sessionId,
        firstJob: result.session.result?.firstJob ?? null,
        pain: result.session.result?.pain ?? null,
      }),
      visitorCookieOptions(),
    );
    return Response.json({ ok: true, session: result.session });
  }

  if (action === "signup_clicked") {
    await recordDiagnosisEvent({
      eventName: "diagnosis_signup_clicked",
      visitorId,
      userId,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      ...tracking,
    });
    return Response.json({ ok: true });
  }

  if (action === "first_value" && userId) {
    const result = await recordDiagnosisFirstValueIfBound(userId);
    return Response.json({ ok: true, ...result });
  }

  if (action === "paid" && userId) {
    const result = await recordDiagnosisPaidIfBound(userId);
    return Response.json({ ok: true, ...result });
  }

  if (action === "bind" && userId) {
    const session = await bindDiagnosisToUser({
      userId,
      visitorId,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    });
    return Response.json({ ok: true, session });
  }

  return Response.json({ error: "未知の操作です" }, { status: 400 });
}
