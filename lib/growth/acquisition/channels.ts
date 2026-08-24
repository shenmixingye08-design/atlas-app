import { listRevenueEvents, listRevenueItems } from "@/lib/owner/revenue-agent/store";

import { classifyAcquisitionChannel } from "./channel-classify";
import { ACQUISITION_CHANNELS, type AcquisitionChannel } from "./constants";
import {
  getChannelSpend,
  getLastPack,
  listAcquisitionEvents,
  listPublishedPackItems,
} from "./store";
import type { MediaPack } from "./packs";

export type ChannelRow = {
  channel: AcquisitionChannel;
  posts: number | null;
  produced: number | null;
  published: number | null;
  uniqueClicks: number | null;
  diagnosisStarted: number | null;
  diagnosisCompleted: number | null;
  signups: number | null;
  firstSuccess: number | null;
  paid: number | null;
  cashYen: number | null;
  aiCostUsd: number | null;
  vendorYen: number | null;
  adYen: number | null;
  costPerSignup: number | null;
  costPerPaid: number | null;
  roas: number | null;
};

function classify(source: string | null, medium: string | null): AcquisitionChannel {
  return classifyAcquisitionChannel(source, medium);
}

function rate(n: number | null, d: number | null): number | null {
  if (n == null || d == null || d <= 0) return null;
  return n / d;
}

function measuredOrNull(hasSource: boolean, value: number): number | null {
  return hasSource ? value : null;
}

export function buildChannelRows(): ChannelRow[] {
  const spend = getChannelSpend();
  const items = listRevenueItems();
  const events = listRevenueEvents();
  const diagnosis = listAcquisitionEvents();
  const lastPack = getLastPack() as MediaPack | null;
  const publishedPacks = listPublishedPackItems();

  return ACQUISITION_CHANNELS.map((channel) => {
    const producedRa = items.filter((item) => classify(item.platform, item.kind) === channel).length;
    const producedPack = lastPack?.items.filter((item) => item.channel === channel).length ?? 0;
    const publishedRa = items.filter(
      (item) => item.status === "published" && classify(item.platform, item.kind) === channel,
    ).length;
    const publishedPack = publishedPacks.filter((item) =>
      lastPack?.items.some((row) => row.contentId === item.contentId && row.channel === channel),
    ).length;
    const channelEvents = events.filter((event) => classify(event.source, event.medium) === channel);
    const diagnosisChannel = diagnosis.filter((event) => event.channel === channel);
    const clickVisitors = new Set(
      [
        ...channelEvents
          .filter((event) => event.eventName === "link_clicked")
          .map((event) => event.anonymousVisitorId),
        ...diagnosisChannel
          .filter((event) => event.eventName === "diagnosis_viewed")
          .map((event) => event.visitorId),
      ].filter((value): value is string => Boolean(value)),
    );
    const signupUsers = new Set(
      [
        ...channelEvents.filter((event) => event.eventName === "signup_completed").map((event) => event.userId),
        ...diagnosisChannel
          .filter((event) => event.eventName === "diagnosis_signup_completed")
          .map((event) => event.userId),
      ].filter((value): value is string => Boolean(value)),
    );
    const firstUsers = new Set(
      [
        ...channelEvents
          .filter(
            (event) =>
              event.eventName === "first_job_completed" || event.eventName === "first_automation_completed",
          )
          .map((event) => event.userId),
        ...diagnosisChannel
          .filter((event) => event.eventName === "diagnosis_first_value_completed")
          .map((event) => event.userId),
      ].filter((value): value is string => Boolean(value)),
    );
    const paidUsers = new Set(
      [
        ...channelEvents.filter((event) => event.eventName === "subscription_started").map((event) => event.userId),
        ...diagnosisChannel
          .filter((event) => event.eventName === "diagnosis_paid_conversion")
          .map((event) => event.userId),
      ].filter((value): value is string => Boolean(value)),
    );
    const cashValues = channelEvents
      .filter((event) => event.eventName === "invoice_paid")
      .map((event) => event.metadata.amountYen)
      .filter((value): value is number => typeof value === "number");
    const diagnosisStarted = diagnosisChannel.filter((event) => event.eventName === "diagnosis_started").length;
    const diagnosisCompleted = diagnosisChannel.filter(
      (event) => event.eventName === "diagnosis_completed",
    ).length;
    const ad = spend.ad[channel];
    const vendor = spend.vendor[channel];
    const cashYen = cashValues.length > 0 ? cashValues.reduce((sum, value) => sum + value, 0) : null;
    const hasRa = producedRa > 0 || publishedRa > 0 || channelEvents.length > 0;
    const hasDiagnosis = diagnosisChannel.length > 0;
    const hasPack = producedPack > 0 || publishedPack > 0;
    const signups = signupUsers.size;
    const paid = paidUsers.size;

    return {
      channel,
      posts: measuredOrNull(hasRa || hasPack, publishedRa + publishedPack),
      produced: measuredOrNull(hasRa || hasPack, producedRa + producedPack),
      published: measuredOrNull(hasRa || hasPack, publishedRa + publishedPack),
      uniqueClicks: measuredOrNull(hasRa || hasDiagnosis, clickVisitors.size),
      diagnosisStarted: measuredOrNull(diagnosis.length > 0, diagnosisStarted),
      diagnosisCompleted: measuredOrNull(diagnosis.length > 0, diagnosisCompleted),
      signups: measuredOrNull(hasRa || hasDiagnosis, signups),
      firstSuccess: measuredOrNull(hasRa || hasDiagnosis, firstUsers.size),
      paid: measuredOrNull(hasRa || hasDiagnosis, paid),
      cashYen,
      aiCostUsd: null,
      vendorYen: vendor === undefined ? null : vendor,
      adYen: ad === undefined ? null : ad,
      costPerSignup: rate(ad ?? null, signups || null),
      costPerPaid: rate(ad ?? null, paid || null),
      roas: ad && ad > 0 && cashYen != null ? cashYen / ad : null,
    };
  });
}
