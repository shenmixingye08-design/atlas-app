import { extractDeadlineFromWorkRequest } from "@/lib/home/secretary-proactive";
import {
  computeAutomationScore,
  scoreToBand,
  scoreToStars,
} from "@/lib/executive-assistant/scoring";
import type {
  ExecutiveAssistantInput,
  ExecutiveProposal,
} from "@/lib/executive-assistant/types";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** Predict next needed work from schedule + weekday patterns. */
export function predictNextWork(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const out: ExecutiveProposal[] = [];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeekday = (now.getDay() + 1) % 7;

  for (const auto of input.automations) {
    if (!auto.nextRun) continue;
    const next = new Date(auto.nextRun);
    if (Number.isNaN(next.getTime())) continue;
    const hours = (next.getTime() - now.getTime()) / 3_600_000;
    if (hours < 0 || hours > 7 * 24) continue;

    const when =
      hours < 24
        ? "まもなく"
        : hours < 48
          ? "明日"
          : `来週${WEEKDAY_JA[next.getDay()] ?? ""}曜日`;

    out.push({
      id: `predict:${auto.id}`,
      kind: "work_prediction",
      title: `${when}「${auto.name}」の予定があります`,
      message: `${when}の仕事を先に準備しますか？`,
      reason: `次回実行 ${next.toLocaleString("ja-JP")}`,
      automationScore: 82,
      scoreBand: "candidate",
      stars: 4,
      actionLabel: "準備する",
      actionHref: `/automations?id=${encodeURIComponent(auto.id)}`,
      dismissible: true,
      scheduleHint: auto.schedule?.label,
      generatedAt: now.toISOString(),
      dedupeKey: `predict:${auto.id}:${auto.nextRun}`,
    });
  }

  // Profile: preferred weekday sales materials
  for (const job of input.jobUsage ?? []) {
    if (job.count < 4) continue;
    if (job.frequency !== "weekly") continue;
    const hour = job.preferredHour ?? 9;
    out.push({
      id: `predict-usage:${job.jobCategory}`,
      kind: "work_prediction",
      title: `来週${WEEKDAY_JA[nextWeekday]}曜日あたりに「${job.label}」が必要そうです`,
      message: `いつも使っている仕事です。作成しますか？（目安 ${hour}時台）`,
      reason: `利用${job.count}回・週次パターン`,
      automationScore: computeAutomationScore({
        occurrenceCount: job.count,
        cadence: "weekly",
      }),
      scoreBand: scoreToBand(80),
      stars: 4,
      actionLabel: "作成する",
      actionHref: `/workspace?assignment=${encodeURIComponent(job.label)}`,
      dismissible: true,
      category: job.jobCategory,
      generatedAt: now.toISOString(),
      dedupeKey: `predict-usage:${job.jobCategory}:${tomorrow.toISOString().slice(0, 10)}`,
    });
  }

  return out;
}

/** Near-deadline projects without deliverable progress. */
export function detectDeadlines(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const out: ExecutiveProposal[] = [];

  for (const project of input.projects) {
    const request = project.workRequest ?? "";
    const deadline = extractDeadlineFromWorkRequest(request);
    if (!deadline) continue;
    const ms = deadline.getTime() - now.getTime();
    if (ms < -86_400_000 || ms > 72 * 3_600_000) continue;

    const status = (project.status ?? "").toLowerCase();
    if (status === "completed" || status === "done" || status === "archived") {
      continue;
    }

    const hours = Math.round(ms / 3_600_000);
    const when =
      hours <= 24 ? "明日までです" : hours <= 48 ? "あと2日です" : "締切が近いです";

    out.push({
      id: `deadline:${project.id}`,
      kind: "deadline",
      title: `${when}「${project.title || "仕事"}」`,
      message: "資料はまだ完了していません。作成しますか？",
      reason: `期限 ${deadline.toLocaleString("ja-JP")}`,
      automationScore: 90,
      scoreBand: "automate_now",
      stars: 5,
      actionLabel: "作成する",
      actionHref: `/projects/${encodeURIComponent(project.id)}`,
      dismissible: true,
      generatedAt: now.toISOString(),
      dedupeKey: `deadline:${project.id}`,
    });
  }

  return out;
}

/** Reply / approval / comment waiting signals. */
export function detectReplyMiss(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const out: ExecutiveProposal[] = [];

  for (const signal of input.replyMissSignals ?? []) {
    if (signal.ageHours < 24) continue;
    out.push({
      id: `reply:${signal.id}`,
      kind: "reply_miss",
      title: "返信待ちのメールがあります",
      message: `「${signal.subject}」から約${Math.round(signal.ageHours)}時間経過しています。確認しますか？`,
      reason: "未返信シグナル",
      automationScore: 78,
      scoreBand: "candidate",
      stars: 3,
      actionLabel: "確認する",
      actionHref: signal.href ?? "/workspace/mail",
      dismissible: true,
      generatedAt: now.toISOString(),
      dedupeKey: `reply:${signal.id}`,
    });
  }

  for (const n of input.notifications ?? []) {
    const type = (n.type ?? "").toLowerCase();
    const title = `${n.title ?? ""} ${n.message ?? ""}`;
    const isWait =
      type.includes("awaiting") ||
      type.includes("review") ||
      /承認|返信|コメント|確認/.test(title);
    if (!isWait || n.readAt) continue;
    const created = n.createdAt ? new Date(n.createdAt) : null;
    const ageH = created
      ? (now.getTime() - created.getTime()) / 3_600_000
      : 48;
    if (ageH < 6) continue;

    out.push({
      id: `notify-wait:${n.id}`,
      kind: "reply_miss",
      title: "承認・返信待ちがあります",
      message: n.title || n.message || "確認が必要な通知があります。",
      reason: "未読の確認待ち通知",
      automationScore: 75,
      scoreBand: "candidate",
      stars: scoreToStars({ score: 75 }),
      actionLabel: "確認する",
      actionHref: n.actionUrl || "/notifications",
      dismissible: true,
      generatedAt: now.toISOString(),
      dedupeKey: `notify-wait:${n.id}`,
    });
  }

  return out;
}
