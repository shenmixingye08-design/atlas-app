import "server-only";

import { randomUUID } from "node:crypto";

import { classifyAcquisitionChannel } from "./channel-classify";
import { buildChannelRows } from "./channels";
import { ACQUISITION_CAMPAIGN_ID, ACQUISITION_CHANNELS, type AcquisitionChannel } from "./constants";
import { buildContentCalendar } from "./calendar";
import { buildDiagnosisResult, containsPersonalFields, isDiagnosisAnswers } from "./diagnosis";
import { ensureAcquisitionHydrated, persistAcquisition } from "./durable";
import { listEvidenceFacts, setEvidenceStatus } from "./evidence";
import { buildMediaPack, markManualPublished, type MediaPack } from "./packs";
import {
  claimReferral,
  createReferralLink,
  detectReferralAbuse,
  referralLandingPath,
  referralRewardLabel,
} from "./referral";
import {
  findSessionByUser,
  findSessionByVisitor,
  getDiagnosisSession,
  getLastPack,
  listAcquisitionEvents,
  listAllStoriesForOwner,
  listPublishedPackItems,
  recordAcquisitionEvent,
  saveLastPack,
  savePublishedPackItem,
  setChannelSpend,
  skipCalendarIdea,
  upsertDiagnosisSession,
} from "./store";
import { canAskForStory, recordStory } from "./stories";
import type {
  DiagnosisAnswers,
  DiagnosisEventName,
  DiagnosisSession,
  EvidenceStatus,
  StoryConsent,
  UseCaseSlug,
} from "./types";
import { listUseCasePages, setUseCaseStatus } from "./usecases";
import { buildVerdictSuggestion, resolveCampaignVerdict } from "./verdicts";

function channelFromParams(source: string | null, medium: string | null): AcquisitionChannel {
  return classifyAcquisitionChannel(source, medium);
}

function sessionTracking(session: DiagnosisSession | null) {
  return {
    campaignId: session?.campaignId ?? null,
    contentId: session?.contentId ?? null,
    channel: session?.channel ?? null,
  };
}

export async function recordDiagnosisEvent(input: {
  eventName: DiagnosisEventName;
  visitorId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  campaignId?: string | null;
  contentId?: string | null;
  source?: string | null;
  medium?: string | null;
}): Promise<{ inserted: boolean }> {
  await ensureAcquisitionHydrated();
  const session =
    (input.sessionId ? getDiagnosisSession(input.sessionId) : null) ??
    (input.userId ? findSessionByUser(input.userId) : null) ??
    (input.visitorId ? findSessionByVisitor(input.visitorId) : null);
  const inherited = sessionTracking(session);
  const channel = input.source || input.medium
    ? channelFromParams(input.source ?? null, input.medium ?? null)
    : session?.channel ?? channelFromParams(input.source ?? null, input.medium ?? null);
  const campaignId = input.campaignId ?? inherited.campaignId ?? ACQUISITION_CAMPAIGN_ID;
  const contentId = input.contentId ?? inherited.contentId ?? null;
  const keyUser = input.userId ?? input.visitorId ?? input.sessionId ?? "anon";
  const result = recordAcquisitionEvent({
    eventName: input.eventName,
    dedupeKey: `${input.eventName}:${keyUser}:${contentId ?? "none"}`,
    visitorId: input.visitorId,
    userId: input.userId,
    campaignId,
    contentId,
    channel,
  });
  await persistAcquisition();
  return result;
}

export async function startDiagnosis(input: {
  visitorId: string | null;
  campaignId: string | null;
  contentId: string | null;
  source: string | null;
  medium: string | null;
  referralId?: string | null;
}): Promise<DiagnosisSession> {
  await ensureAcquisitionHydrated();
  const existing = input.visitorId ? findSessionByVisitor(input.visitorId) : null;
  const session =
    existing ??
    ({
      sessionId: `dg_${randomUUID()}`,
      visitorId: input.visitorId,
      userId: null,
      answers: null,
      result: null,
      campaignId: input.campaignId,
      contentId: input.contentId,
      referralId: input.referralId ?? null,
      channel: channelFromParams(input.source, input.medium),
      startedAt: new Date().toISOString(),
      completedAt: null,
      signupClickedAt: null,
      boundUserId: null,
    } satisfies DiagnosisSession);
  if (!session.startedAt) session.startedAt = new Date().toISOString();
  if (!session.campaignId && input.campaignId) session.campaignId = input.campaignId;
  if (!session.contentId && input.contentId) session.contentId = input.contentId;
  if (!session.referralId && input.referralId) session.referralId = input.referralId;
  upsertDiagnosisSession(session);
  await recordDiagnosisEvent({
    eventName: "diagnosis_started",
    visitorId: input.visitorId,
    sessionId: session.sessionId,
    campaignId: session.campaignId,
    contentId: session.contentId,
    source: input.source,
    medium: input.medium,
  });
  return session;
}

export async function completeDiagnosis(input: {
  visitorId: string | null;
  sessionId: string;
  answers: unknown;
  extra: Record<string, unknown>;
  campaignId: string | null;
  contentId: string | null;
  source: string | null;
  medium: string | null;
}): Promise<{ ok: true; session: DiagnosisSession } | { ok: false; error: string; status: number }> {
  if (containsPersonalFields(input.extra)) {
    return { ok: false, error: "個人情報は送信しないでください", status: 400 };
  }
  if (!isDiagnosisAnswers(input.answers)) {
    return { ok: false, error: "選択肢の回答が不足しています", status: 400 };
  }
  await ensureAcquisitionHydrated();
  const result = buildDiagnosisResult(input.answers as DiagnosisAnswers);
  const previous = getDiagnosisSession(input.sessionId);
  const session: DiagnosisSession = {
    sessionId: input.sessionId,
    visitorId: input.visitorId ?? previous?.visitorId ?? null,
    userId: previous?.userId ?? null,
    answers: input.answers,
    result,
    campaignId: input.campaignId ?? previous?.campaignId ?? null,
    contentId: input.contentId ?? previous?.contentId ?? null,
    referralId: previous?.referralId ?? null,
    channel: channelFromParams(input.source, input.medium) !== "direct" || !previous
      ? channelFromParams(input.source, input.medium)
      : previous.channel,
    startedAt: previous?.startedAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    signupClickedAt: previous?.signupClickedAt ?? null,
    boundUserId: previous?.boundUserId ?? null,
  };
  upsertDiagnosisSession(session);
  await recordDiagnosisEvent({
    eventName: "diagnosis_completed",
    visitorId: session.visitorId,
    sessionId: session.sessionId,
    campaignId: session.campaignId,
    contentId: session.contentId,
    source: input.source,
    medium: input.medium,
  });
  await recordDiagnosisEvent({
    eventName: "diagnosis_result_viewed",
    visitorId: session.visitorId,
    sessionId: session.sessionId,
    campaignId: session.campaignId,
    contentId: session.contentId,
    source: input.source,
    medium: input.medium,
  });
  return { ok: true, session };
}

export async function bindDiagnosisToUser(input: {
  userId: string;
  visitorId: string | null;
  sessionId?: string | null;
}): Promise<DiagnosisSession | null> {
  await ensureAcquisitionHydrated();
  const session =
    (input.sessionId ? getDiagnosisSession(input.sessionId) : null) ??
    (input.visitorId ? findSessionByVisitor(input.visitorId) : null) ??
    findSessionByUser(input.userId);
  if (!session?.result) return null;
  if (session.referralId) {
    const claimed = claimReferral(session.referralId, input.userId);
    if (!claimed.ok) {
      session.referralId = null;
      if (session.channel === "referral") session.channel = "direct";
    }
  }
  session.userId = input.userId;
  session.boundUserId = input.userId;
  upsertDiagnosisSession(session);
  await recordDiagnosisEvent({
    eventName: "diagnosis_signup_completed",
    userId: input.userId,
    visitorId: input.visitorId,
    sessionId: session.sessionId,
    campaignId: session.campaignId,
    contentId: session.contentId,
  });
  await persistAcquisition();
  return session;
}

export async function getBoundDiagnosis(userId: string, visitorId: string | null) {
  await ensureAcquisitionHydrated();
  return findSessionByUser(userId) ?? (visitorId ? findSessionByVisitor(visitorId) : null);
}

export async function recordDiagnosisFirstValueIfBound(userId: string): Promise<{ inserted: boolean; skipped?: boolean }> {
  await ensureAcquisitionHydrated();
  const session = findSessionByUser(userId);
  if (!session?.result) return { inserted: false, skipped: true };
  return recordDiagnosisEvent({
    eventName: "diagnosis_first_value_completed",
    userId,
    sessionId: session.sessionId,
    campaignId: session.campaignId,
    contentId: session.contentId,
  });
}

export async function recordDiagnosisPaidIfBound(userId: string): Promise<{ inserted: boolean; skipped?: boolean }> {
  await ensureAcquisitionHydrated();
  const session = findSessionByUser(userId);
  if (!session?.result) return { inserted: false, skipped: true };
  return recordDiagnosisEvent({
    eventName: "diagnosis_paid_conversion",
    userId,
    sessionId: session.sessionId,
    campaignId: session.campaignId,
    contentId: session.contentId,
  });
}

export async function issueReferral(userId: string, firstSuccessAt: string | null) {
  if (!firstSuccessAt) {
    return { ok: false as const, error: "初回成功後に発行できます" };
  }
  await ensureAcquisitionHydrated();
  const record = createReferralLink(userId);
  await persistAcquisition();
  return {
    ok: true as const,
    record,
    url: referralLandingPath(record),
    reward: referralRewardLabel(),
  };
}

export function checkReferral(referralId: string, visitorUserId: string | null) {
  return detectReferralAbuse({ referralId, visitorUserId });
}

export async function getOwnerAcquisitionSnapshot() {
  await ensureAcquisitionHydrated();
  const rows = buildChannelRows();
  const events = listAcquisitionEvents();
  const measured = `診断開始${events.filter((e) => e.eventName === "diagnosis_started").length} / 完了${events.filter((e) => e.eventName === "diagnosis_completed").length}`;
  const verdict = resolveCampaignVerdict({
    days: 0,
    uniqueClicks: null,
    signups: null,
    firstSuccess: null,
    paid: null,
    cashYen: null,
  });
  let lastPack = getLastPack() as MediaPack | null;
  if (!lastPack) {
    lastPack = buildMediaPack("general");
    saveLastPack(lastPack);
    await persistAcquisition();
  }
  return {
    campaignId: ACQUISITION_CAMPAIGN_ID,
    evidence: listEvidenceFacts(),
    useCases: listUseCasePages(),
    calendar: buildContentCalendar(),
    channels: rows,
    pack: lastPack,
    publishedItems: listPublishedPackItems(),
    stories: listAllStoriesForOwner(),
    verdict,
    suggestion: buildVerdictSuggestion({ verdict, measured }),
    reward: referralRewardLabel(),
  };
}

export async function handleOwnerAcquisitionAction(body: Record<string, unknown>) {
  await ensureAcquisitionHydrated();
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "evidence_status") {
    const id = String(body.id ?? "");
    const status = body.status as EvidenceStatus;
    const fact = setEvidenceStatus(id, status);
    if (!fact) return { ok: false as const, error: "事実が見つかりません" };
    await persistAcquisition();
    return { ok: true as const };
  }
  if (action === "usecase_status") {
    const page = setUseCaseStatus(String(body.slug) as UseCaseSlug, body.status as "draft" | "approved" | "rejected");
    if (!page) return { ok: false as const, error: "ページが見つかりません" };
    await persistAcquisition();
    return { ok: true as const };
  }
  if (action === "generate_pack") {
    const pack = buildMediaPack("general");
    saveLastPack(pack);
    await persistAcquisition();
    return { ok: true as const, pack };
  }
  if (action === "calendar_skip") {
    const date = String(body.date ?? "");
    const category = String(body.category ?? "");
    if (!date || !category) return { ok: false as const, error: "日付とカテゴリが必要です" };
    skipCalendarIdea(`${date}:${category}`);
    await persistAcquisition();
    return { ok: true as const };
  }
  if (action === "set_spend") {
    const channel = String(body.channel ?? "") as AcquisitionChannel;
    if (!ACQUISITION_CHANNELS.includes(channel)) {
      return { ok: false as const, error: "未知の媒体です" };
    }
    const kind = body.kind === "vendor" ? "vendor" : "ad";
    const yen = typeof body.yen === "number" && Number.isFinite(body.yen) ? body.yen : null;
    setChannelSpend(kind, channel, yen);
    await persistAcquisition();
    return { ok: true as const };
  }
  if (action === "manual_publish") {
    const contentId = String(body.contentId ?? "");
    const postUrl = String(body.postUrl ?? "");
    const pack = getLastPack() as MediaPack | null;
    const item = pack?.items.find((row) => row.contentId === contentId);
    if (!item) return { ok: false as const, error: "素材が見つかりません" };
    const check = markManualPublished({
      postUrl,
      status: item.status,
      autoPublish: item.autoPublish,
      mediaLinked: false,
    });
    if (!check.ok) {
      return { ok: false as const, error: check.reason ?? "投稿成功として記録しません" };
    }
    savePublishedPackItem({
      contentId,
      postUrl: postUrl.trim(),
      publishedAt: new Date().toISOString(),
    });
    await persistAcquisition();
    return { ok: true as const };
  }
  return { ok: false as const, error: "未知の操作です" };
}

export async function submitStory(input: {
  userId: string;
  usedFor: string;
  helpful: string;
  improve: string;
  consent: StoryConsent;
  firstSuccessAt: string | null;
  state: Parameters<typeof canAskForStory>[0];
}) {
  if (!canAskForStory(input.state)) {
    return { ok: false as const, error: "事例の依頼条件を満たしていません" };
  }
  const result = recordStory(input);
  if (result.ok) await persistAcquisition();
  return result;
}

export { canAskForStory };
