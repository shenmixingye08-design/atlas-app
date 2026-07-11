import type { Automation } from "@/lib/automations/types";
import { getTodaysAutomations } from "@/lib/automations/today";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import type { Project } from "@/lib/projects/types";

export type SecretaryVoiceBrief = {
  greeting: string;
  paragraphs: string[];
  closing: string;
};

function trimLabel(value: string, max = 36): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function projectLabel(project: Project): string {
  return trimLabel(project.title || project.workRequest);
}

function greetingForHour(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return "おはようございます。";
  if (hour >= 11 && hour < 17) return "こんにちは。";
  return "こんばんは。";
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

function isYesterday(iso: string, now: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameLocalDay(date, yesterday);
}

function formatScheduleClock(automation: Automation): string | null {
  if (automation.schedule.kind !== "schedule") return null;
  const { hour, minute } = automation.schedule.preset;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

/**
 * Build a short secretary voice brief from existing work data only.
 * Allowed endings: 〜ですね。 / 〜できます。 / 〜がおすすめです。 / 〜しましょう。
 */
export function buildSecretaryVoiceBrief(input: {
  projects: Project[];
  automations: Automation[];
  now?: Date;
}): SecretaryVoiceBrief {
  const now = input.now ?? new Date();
  const projects = normalizeProjects(input.projects);
  const automations = normalizeAutomations(input.automations);
  const paragraphs: string[] = [];

  const incomplete = projects
    .filter(
      (project) =>
        project.status === "pending" ||
        project.status === "running" ||
        project.status === "review",
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  const yesterdayIncomplete = incomplete.find((project) =>
    isYesterday(project.updatedAt, now),
  );
  const latestIncomplete = incomplete[0] ?? null;

  if (yesterdayIncomplete) {
    const label = projectLabel(yesterdayIncomplete);
    if (label) {
      paragraphs.push(
        yesterdayIncomplete.status === "review"
          ? `昨日の「${label}」ですが、確認できます。`
          : `昨日の「${label}」ですが、続きを作成できます。`,
      );
    }
  } else if (latestIncomplete) {
    const label = projectLabel(latestIncomplete);
    if (label) {
      paragraphs.push(
        latestIncomplete.status === "review"
          ? `「${label}」は確認待ちですね。`
          : `「${label}」ですが、続きを作成できます。`,
      );
    }
  } else {
    const recentCompleted = projects
      .filter((project) => project.status === "completed")
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
    if (recentCompleted && isYesterday(recentCompleted.updatedAt, now)) {
      const label = projectLabel(recentCompleted);
      if (label) {
        paragraphs.push(`昨日の「${label}」ですね。同じ依頼を再度作成できます。`);
      }
    }
  }

  const todayHabits = getTodaysAutomations(automations, now)
    .map(({ automation }) => automation)
    .filter((automation) => automation.enabled);

  if (todayHabits.length > 0) {
    const first = todayHabits[0]!;
    const name = trimLabel(first.name);
    const clock = formatScheduleClock(first);
    if (name && clock) {
      paragraphs.push(
        `今日の予定では、「${name}」を${clock}前後に進めることがおすすめです。`,
      );
    } else if (name) {
      paragraphs.push(`今日の予定では、「${name}」から進めることがおすすめです。`);
    } else if (todayHabits.length >= 2) {
      paragraphs.push(
        `今日の予定が${todayHabits.length}件ありますので、上から進めましょう。`,
      );
    }
  }

  return {
    greeting: greetingForHour(now),
    paragraphs: paragraphs.slice(0, 2),
    closing: "今日は何から始めますか？",
  };
}
