import {
  bandLabel,
  computeAutomationScore,
  scoreToBand,
  scoreToStars,
} from "@/lib/executive-assistant/scoring";
import { buildExecutiveMemoryChains } from "@/lib/executive-assistant/executive-memory";
import type {
  ExecutiveAssistantInput,
  ExecutiveProposal,
} from "@/lib/executive-assistant/types";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function assignmentText(auto: ExecutiveAssistantInput["automations"][number]): string {
  return `${auto.name} ${auto.workflow?.assignment ?? ""}`;
}

function detectCadence(
  auto: ExecutiveAssistantInput["automations"][number],
): "daily" | "weekly" | "monthly" | "ad_hoc" {
  const type = auto.schedule?.preset?.type;
  if (type === "daily" || type === "weekly" || type === "monthly") return type;
  return "ad_hoc";
}

function scheduleHint(
  auto: ExecutiveAssistantInput["automations"][number],
): string | undefined {
  const preset = auto.schedule?.preset;
  if (!preset?.type) return auto.schedule?.label;
  const hm = `${String(preset.hour ?? 9).padStart(2, "0")}:${String(preset.minute ?? 0).padStart(2, "0")}`;
  if (preset.type === "daily") return `毎日 ${hm}`;
  if (preset.type === "weekly") {
    const d = WEEKDAY_JA[preset.dayOfWeek ?? 5] ?? "金";
    return `毎週${d}曜日 ${hm}`;
  }
  if (preset.type === "monthly") {
    return `毎月${preset.dayOfMonth ?? 1}日 ${hm}`;
  }
  return auto.schedule?.label;
}

/** Discover recurring automations / habits worth proposing. */
export function discoverRecurringWork(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const out: ExecutiveProposal[] = [];

  for (const auto of input.automations) {
    if (auto.enabled === false) continue;
    const cadence = detectCadence(auto);
    if (cadence === "ad_hoc") continue;

    const last = auto.lastRun ? new Date(auto.lastRun) : null;
    const daysSinceLast = last ? daysBetween(now, last) : null;
    const score = computeAutomationScore({
      occurrenceCount: cadence === "daily" ? 10 : cadence === "weekly" ? 6 : 4,
      cadence,
      daysSinceLast,
    });
    const stars = scoreToStars({ score, cadence });
    const band = scoreToBand(score);
    const hint = scheduleHint(auto) ?? "定期";
    const text = assignmentText(auto);

    out.push({
      id: `recurring:${auto.id}`,
      kind: "recurring_work",
      title: `${hint}の仕事があります`,
      message: `「${auto.name}」を${hint}に実行しています。このまま自動化を続けますか？`,
      reason: `スケジュール設定（${cadence}）と実行履歴から検出`,
      automationScore: score,
      scoreBand: band,
      stars,
      actionLabel: "自動化を確認",
      actionHref: `/automations?id=${encodeURIComponent(auto.id)}`,
      dismissible: true,
      category: text.slice(0, 40),
      scheduleHint: hint,
      generatedAt: now.toISOString(),
      dedupeKey: `recurring:${auto.id}`,
    });
  }

  for (const job of input.jobUsage ?? []) {
    if (job.count < 3) continue;
    const cadence = job.frequency ?? (job.count >= 8 ? "weekly" : "ad_hoc");
    const last = job.lastUsedAt ? new Date(job.lastUsedAt) : null;
    const score = computeAutomationScore({
      occurrenceCount: job.count,
      cadence: cadence === "daily" || cadence === "weekly" || cadence === "monthly" ? cadence : "ad_hoc",
      daysSinceLast: last ? daysBetween(now, last) : null,
    });
    if (score < 60) continue;
    const stars = scoreToStars({ score, cadence: cadence as "weekly" });
    out.push({
      id: `usage:${job.jobCategory}`,
      kind: "automation_candidate",
      title: `「${job.label}」をよく依頼しています`,
      message:
        score >= 95
          ? `今すぐ自動化推奨（Automation Score ${score}%）。自動化しますか？`
          : `Automation Score ${score}%（${bandLabel(scoreToBand(score))}）。自動化候補にしますか？`,
      reason: `同じカテゴリの依頼が${job.count}回`,
      automationScore: score,
      scoreBand: scoreToBand(score),
      stars,
      actionLabel: "自動化する",
      actionHref: `/automations/new?seed=${encodeURIComponent(job.label)}`,
      dismissible: true,
      category: job.jobCategory,
      generatedAt: now.toISOString(),
      dedupeKey: `usage:${job.jobCategory}:${job.frequency ?? "x"}`,
    });
  }

  return out;
}

/** PDF / PowerPoint / Dropbox / mail / X habit patterns from text + profile. */
export function discoverFileAndDeliveryHabits(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const out: ExecutiveProposal[] = [];
  const blob = [
    ...input.automations.map((a) => assignmentText(a)),
    ...input.projects.map((p) => `${p.title ?? ""} ${p.workRequest ?? ""}`),
    ...(input.jobUsage ?? []).map((j) => `${j.label} ${j.preferredFormat ?? ""}`),
    ...(input.workMemories ?? []).map((m) => `${m.title} ${m.summary} ${m.tags.join(" ")}`),
  ]
    .join("\n")
    .toLowerCase();

  const checks: Array<{
    key: string;
    test: RegExp;
    title: string;
    message: string;
    href: string;
    kind: ExecutiveProposal["kind"];
  }> = [
    {
      key: "pdf",
      test: /pdf|ｐｄｆ/,
      title: "毎回PDFを作っています",
      message: "今後は自動でPDF生成しますか？",
      href: "/automations/new?seed=" + encodeURIComponent("PDF自動生成"),
      kind: "habit_file",
    },
    {
      key: "pptx",
      test: /powerpoint|pptx|スライド|資料/,
      title: "毎回PowerPoint / 営業資料を作っています",
      message: "営業資料の標準フローを自動化しますか？",
      href: "/automations/new?seed=" + encodeURIComponent("営業資料 自動化"),
      kind: "habit_file",
    },
    {
      key: "dropbox",
      test: /dropbox|ドロップボックス/,
      title: "毎回Dropboxへ保存しています",
      message: "成果物の保存先を自動化しますか？",
      href: "/connections",
      kind: "habit_delivery",
    },
    {
      key: "mail",
      test: /gmail|メール送信|メールを送/,
      title: "毎回メール送信しています",
      message: "送信フローを自動化しますか？（承認付き推奨）",
      href: "/automations/new?seed=" + encodeURIComponent("メール送信 自動化"),
      kind: "habit_delivery",
    },
    {
      key: "x",
      test: /\bx\b|twitter|ツイート|sns投稿/,
      title: "毎回X投稿しています",
      message: "投稿を自動化しますか？（承認必須）",
      href: "/settings/x",
      kind: "habit_delivery",
    },
  ];

  for (const check of checks) {
    if (!check.test.test(blob)) continue;
    const usageBoost = (input.jobUsage ?? []).some((j) =>
      check.test.test(`${j.label} ${j.preferredFormat ?? ""}`.toLowerCase()),
    )
      ? 8
      : 0;
    const score = Math.min(98, 72 + usageBoost);
    out.push({
      id: `habit:${check.key}`,
      kind: check.kind,
      title: check.title,
      message: check.message,
      reason: "履歴・依頼文・Memoryの繰り返しパターン",
      automationScore: score,
      scoreBand: scoreToBand(score),
      stars: scoreToStars({ score, cadence: "weekly" }),
      actionLabel: "自動化しますか？",
      actionHref: check.href,
      dismissible: true,
      generatedAt: now.toISOString(),
      dedupeKey: `habit:${check.key}`,
    });
  }

  return out;
}

/** Repeated corrections → standard settings proposal. */
export function discoverRepeatedCorrections(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const corrections = (input.workMemories ?? []).filter(
    (m) => m.type === "correction" || m.tags.includes("correction"),
  );
  if (corrections.length < 2) return [];

  const byTitle = new Map<string, typeof corrections>();
  for (const c of corrections) {
    const key = c.title.slice(0, 40);
    const list = byTitle.get(key) ?? [];
    list.push(c);
    byTitle.set(key, list);
  }

  const out: ExecutiveProposal[] = [];
  for (const [title, list] of byTitle) {
    if (list.length < 2 && list.reduce((s, x) => s + x.usageCount, 0) < 3) {
      continue;
    }
    const repeats = Math.max(list.length, list.reduce((s, x) => s + x.usageCount, 0));
    const score = computeAutomationScore({
      occurrenceCount: repeats,
      cadence: "ad_hoc",
      correctionRepeats: repeats,
      userConfirmedMemory: list.some((x) => x.isUserConfirmed),
    });
    out.push({
      id: `correction:${title}`,
      kind: "repeated_correction",
      title: `毎回「${title}」を直しています`,
      message: "標準設定へ登録しますか？",
      reason: `修正が${repeats}回繰り返されています`,
      automationScore: score,
      scoreBand: scoreToBand(score),
      stars: scoreToStars({ score, correctionRepeats: repeats }),
      actionLabel: "標準設定に登録",
      actionHref: "/settings/work-memory",
      dismissible: true,
      memoryChain: list[0]?.tags.slice(0, 5),
      generatedAt: now.toISOString(),
      dedupeKey: `correction:${title}`,
    });
  }
  return out;
}

/** High-confidence Executive Memory chains → register as standard. */
export function discoverMemoryStandards(
  input: ExecutiveAssistantInput,
): ExecutiveProposal[] {
  const now = input.now ?? new Date();
  const chains = buildExecutiveMemoryChains(input).filter(
    (c) => c.confidence >= 0.7 && c.steps.length >= 3 && c.usageCount >= 3,
  );

  return chains.slice(0, 3).map((chain) => {
    const score = computeAutomationScore({
      occurrenceCount: chain.usageCount,
      cadence: "weekly",
      userConfirmedMemory: chain.confidence >= 0.85,
    });
    return {
      id: `memory-std:${chain.id}`,
      kind: "memory_standard" as const,
      title: `「${chain.jobLabel}」の流れを標準設定にしますか？`,
      message: `${chain.steps.join(" → ")} を覚えて次回から省略します。`,
      reason: `Executive Memory confidence ${Math.round(chain.confidence * 100)}%`,
      automationScore: score,
      scoreBand: scoreToBand(score),
      stars: scoreToStars({ score, cadence: "weekly" }),
      actionLabel: "標準設定へ登録",
      actionHref: "/settings/work-memory",
      dismissible: true,
      memoryChain: chain.steps,
      category: chain.category,
      generatedAt: now.toISOString(),
      dedupeKey: `memory-std:${chain.id}`,
    };
  });
}
