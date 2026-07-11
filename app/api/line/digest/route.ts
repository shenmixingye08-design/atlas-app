import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { claimDailyDigest } from "@/lib/integrations/line/digest-dedupe";
import { isLineEventEnabled } from "@/lib/integrations/line/service";
import { getGoogleCalendarEventsForUser } from "@/lib/integrations/google/calendar/service";
import { getGmailMessagesForUser } from "@/lib/integrations/google/gmail/service";
import {
  notifyMailReceived,
  notifyMorningBriefing,
  notifyTodaysSchedule,
} from "@/lib/notifications/emitters";

/**
 * Sends once-per-day LINE digests: morning briefing, today's schedule, mail received.
 */
export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveFeatureAccessContext();
  const sent: string[] = [];
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  let scheduleSummary = "予定情報を取得できませんでした";
  let scheduleCount = 0;
  let mailSummary = "メール情報を取得できませんでした";
  let unreadCount = 0;

  try {
    const calendar = await getGoogleCalendarEventsForUser({
      userId,
      context,
      range: "today",
    });
    if (calendar.status === "ready") {
      scheduleCount = calendar.snapshot.events.length;
      scheduleSummary =
        scheduleCount === 0
          ? "本日の予定はありません"
          : calendar.snapshot.events
              .slice(0, 3)
              .map((event) => event.title)
              .join("、");
    }
  } catch (error) {
    console.warn("[LINE digest calendar]", error);
  }

  try {
    const mail = await getGmailMessagesForUser({
      userId,
      context,
      filter: "today",
    });
    if (mail.status === "ready") {
      const unread = mail.snapshot.messages.filter((message) => message.isUnread);
      unreadCount = unread.length;
      mailSummary =
        unreadCount === 0
          ? "未読メールはありません"
          : `未読メール ${unreadCount}件（例: ${unread[0]?.subject ?? ""}）`;
    }
  } catch (error) {
    console.warn("[LINE digest mail]", error);
  }

  if (
    isLineEventEnabled(userId, "morning_briefing") &&
    (await claimDailyDigest(userId, "morning_briefing"))
  ) {
    notifyMorningBriefing(userId, {
      summary: [
        dateLabel,
        "おはようございます。今日のブリーフィングです。",
        `予定: ${scheduleSummary}`,
        `メール: ${mailSummary}`,
      ].join("\n"),
    });
    sent.push("morning_briefing");
  }

  if (
    isLineEventEnabled(userId, "todays_schedule") &&
    (await claimDailyDigest(userId, "todays_schedule"))
  ) {
    notifyTodaysSchedule(userId, {
      eventCount: scheduleCount,
      summary: scheduleSummary,
    });
    sent.push("todays_schedule");
  }

  if (
    unreadCount > 0 &&
    isLineEventEnabled(userId, "mail_received") &&
    (await claimDailyDigest(userId, "mail_received"))
  ) {
    try {
      const mail = await getGmailMessagesForUser({
        userId,
        context,
        filter: "today",
      });
      if (mail.status === "ready") {
        const unread = mail.snapshot.messages.filter((m) => m.isUnread);
        if (unread[0]) {
          notifyMailReceived(userId, {
            subject: unread[0].subject,
            sender: unread[0].sender,
            count: unread.length,
          });
          sent.push("mail_received");
        }
      }
    } catch (error) {
      console.warn("[LINE digest mail notify]", error);
    }
  }

  return Response.json({ status: "ready", sent });
}
