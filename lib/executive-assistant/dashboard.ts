import {
  discoverFileAndDeliveryHabits,
  discoverMemoryStandards,
  discoverRecurringWork,
  discoverRepeatedCorrections,
} from "@/lib/executive-assistant/discovery";
import { buildExecutiveMemoryChains } from "@/lib/executive-assistant/executive-memory";
import {
  detectDeadlines,
  detectReplyMiss,
  predictNextWork,
} from "@/lib/executive-assistant/prediction";
import { applySecretaryModeCopy } from "@/lib/executive-assistant/secretary-mode";
import type {
  ExecutiveAssistantInput,
  ExecutiveDashboard,
  ExecutiveProposal,
  SecretaryMode,
  WorkStyleTrait,
} from "@/lib/executive-assistant/types";

const DEFAULT_MAX = 6;
/** Anti-spam: hard cap per day when mode is suggest_only */
const DAILY_SOFT_CAP = 5;

function isVisible(
  p: ExecutiveProposal,
  input: ExecutiveAssistantInput,
  now: Date,
): boolean {
  if (input.dismissedKeys?.includes(p.dedupeKey)) return false;
  const snooze = input.snoozedUntil?.[p.dedupeKey];
  if (snooze && Date.parse(snooze) > now.getTime()) return false;
  return true;
}

function rankScore(p: ExecutiveProposal): number {
  const kindBoost: Record<ExecutiveProposal["kind"], number> = {
    deadline: 1000,
    reply_miss: 900,
    work_prediction: 700,
    recurring_work: 650,
    repeated_correction: 600,
    habit_file: 550,
    habit_delivery: 540,
    automation_candidate: 500,
    memory_standard: 480,
  };
  return kindBoost[p.kind] + p.automationScore + p.stars * 10;
}

/**
 * Infer work style from timestamps and confirmation patterns (no LLM).
 */
export function inferWorkStyle(
  input: ExecutiveAssistantInput,
): WorkStyleTrait[] {
  const traits = new Set<WorkStyleTrait>(input.workStyle ?? []);
  const hours: number[] = [];

  for (const job of input.jobUsage ?? []) {
    if (typeof job.preferredHour === "number") hours.push(job.preferredHour);
  }
  for (const auto of input.automations) {
    const h = auto.schedule?.preset?.hour;
    if (typeof h === "number") hours.push(h);
  }

  if (hours.length >= 2) {
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    if (avg <= 11) traits.add("morning");
    if (avg >= 18) traits.add("evening");
  }

  const likesConfirm = input.automations.some((a) =>
    /approve|確認|review/i.test(JSON.stringify(a)),
  );
  // Prefer existing traits; add soft defaults from notification volume
  const unreadConfirms = (input.notifications ?? []).filter((n) =>
    /承認|確認/.test(`${n.title ?? ""} ${n.message ?? ""}`),
  ).length;
  if (unreadConfirms >= 3) traits.add("likes_confirm");
  if ((input.workStyle ?? []).includes("dislikes_notify")) {
    traits.add("dislikes_notify");
  }
  if (likesConfirm) traits.add("likes_confirm");

  // Deadline crunch: many near-deadline projects historically
  const crunch = input.projects.filter((p) =>
    /【期限】/.test(p.workRequest ?? ""),
  ).length;
  if (crunch >= 3) traits.add("deadline_crunch");

  return [...traits].slice(0, 6);
}

function applyWorkStyleFilter(
  proposals: ExecutiveProposal[],
  style: WorkStyleTrait[],
): ExecutiveProposal[] {
  if (style.includes("dislikes_notify")) {
    // Keep only high urgency
    return proposals.filter(
      (p) =>
        p.kind === "deadline" ||
        p.kind === "reply_miss" ||
        p.automationScore >= 95,
    );
  }
  return proposals;
}

function modeMax(mode: SecretaryMode, requested?: number): number {
  if (mode === "off") return 0;
  if (mode === "full_auto") return requested ?? DEFAULT_MAX;
  if (mode === "semi_auto") return requested ?? DEFAULT_MAX;
  return Math.min(requested ?? DEFAULT_MAX, DAILY_SOFT_CAP);
}

/**
 * Build the AI Executive dashboard — discovery + prediction + throttle.
 * Never auto-executes external side effects here (proposals only).
 */
export function buildExecutiveDashboard(
  input: ExecutiveAssistantInput,
): ExecutiveDashboard {
  const now = input.now ?? new Date();
  const mode = input.secretaryMode ?? "suggest_only";
  const workStyle = inferWorkStyle(input);

  if (mode === "off") {
    return {
      generatedAt: now.toISOString(),
      secretaryMode: mode,
      proposals: [],
      predictions: [],
      improvements: [],
      automationCandidates: [],
      recentMemory: buildExecutiveMemoryChains(input),
      workStyle,
      shownCount: 0,
      suppressedCount: 0,
    };
  }

  const raw: ExecutiveProposal[] = [
    ...detectDeadlines(input),
    ...detectReplyMiss(input),
    ...predictNextWork(input),
    ...discoverRecurringWork(input),
    ...discoverFileAndDeliveryHabits(input),
    ...discoverRepeatedCorrections(input),
    ...discoverMemoryStandards(input),
  ];

  const deduped = new Map<string, ExecutiveProposal>();
  for (const p of raw) {
    if (!isVisible(p, input, now)) continue;
    const prev = deduped.get(p.dedupeKey);
    if (!prev || rankScore(p) > rankScore(prev)) {
      deduped.set(p.dedupeKey, p);
    }
  }

  let ranked = [...deduped.values()].sort((a, b) => rankScore(b) - rankScore(a));
  ranked = applyWorkStyleFilter(ranked, workStyle);

  const max = modeMax(mode, input.maxProposals);
  const shownRaw = ranked.slice(0, max);
  const shown = shownRaw.map((p) => applySecretaryModeCopy(p, mode));
  const suppressed = Math.max(0, ranked.length - shown.length);

  const predictions = shown.filter((p) => p.kind === "work_prediction");
  const improvements = shown.filter(
    (p) =>
      p.kind === "repeated_correction" ||
      p.kind === "habit_file" ||
      p.kind === "habit_delivery" ||
      p.kind === "memory_standard",
  );
  const automationCandidates = shown.filter(
    (p) =>
      p.kind === "automation_candidate" ||
      p.kind === "recurring_work" ||
      p.stars >= 4,
  );

  return {
    generatedAt: now.toISOString(),
    secretaryMode: mode,
    proposals: shown,
    predictions,
    improvements,
    automationCandidates,
    recentMemory: buildExecutiveMemoryChains(input),
    workStyle,
    shownCount: shown.length,
    suppressedCount: suppressed,
  };
}
