import { randomUUID } from "crypto";

import { auth } from "@clerk/nextjs/server";

import { addBetaFeedback } from "@/lib/beta-ux/store";
import type { PayIntent } from "@/lib/beta-ux/types";
import { trackFunnelEvent } from "@/lib/product-funnel/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAY: readonly PayIntent[] = [
  "definitely",
  "probably",
  "neutral",
  "probably_not",
  "no",
];

function clip(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

/** βフィードバック — 依頼本文・ファイルは受け取らない。 */
export async function POST(request: Request): Promise<Response> {
  await auth();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const anonymousUserId =
    clip(body.anonymousUserId, 40) ?? `anon_${randomUUID().slice(0, 8)}`;
  const payIntent980 =
    typeof body.payIntent980 === "string" &&
    PAY.includes(body.payIntent980 as PayIntent)
      ? (body.payIntent980 as PayIntent)
      : null;

  const row = addBetaFeedback({
    id: `bfb_${randomUUID().slice(0, 10)}`,
    sessionId: clip(body.sessionId, 40),
    anonymousUserId,
    at: new Date().toISOString(),
    firstImpression: clip(body.firstImpression),
    thoughtCouldAsk: clip(body.thoughtCouldAsk),
    mostConfused: clip(body.mostConfused),
    mostUseful: clip(body.mostUseful),
    mostWorried: clip(body.mostWorried),
    resultMatchedExpectation: bool(body.resultMatchedExpectation),
    payIntent980,
    monthlyUseCase: clip(body.monthlyUseCase),
    whyNotChatgpt: clip(body.whyNotChatgpt),
    wouldReuse: bool(body.wouldReuse),
    freeWouldUse: bool(body.freeWouldUse),
    pay500: bool(body.pay500),
    pay980: bool(body.pay980),
    pay1500: bool(body.pay1500),
    payForWhat: clip(body.payForWhat),
    breakEvenUses:
      typeof body.breakEvenUses === "number" &&
      Number.isFinite(body.breakEvenUses)
        ? Math.max(0, Math.floor(body.breakEvenUses))
        : null,
    freeText: clip(body.freeText, 800),
  });

  trackFunnelEvent("feedback_submitted", {
    sessionId: row.sessionId,
    anonymousUserId,
    meta: { payIntent980 },
  });

  return Response.json({ ok: true, id: row.id });
}
