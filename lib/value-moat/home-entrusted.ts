/**
 * Home "MINERVOTに任せた仕事" — real user data only. No fake demo history.
 */

export type EntrustedWorkKind =
  | "automation"
  | "remembered_format"
  | "recent_completed";

export type EntrustedWorkCard = {
  id: string;
  kind: EntrustedWorkKind;
  title: string;
  detail: string;
  href: string;
};

export type EntrustedWorkInput = {
  automations: readonly {
    id: string;
    name: string;
    enabled: boolean;
    nextRun?: string | null;
    scheduleLabel?: string | null;
  }[];
  rememberedFormats?: readonly {
    format: string;
    label: string;
    assignmentHint?: string | null;
  }[];
  recentCompleted?: readonly {
    id: string;
    title: string;
    completedAt?: string | null;
    href?: string | null;
  }[];
};

export function buildEntrustedWorkCards(
  input: EntrustedWorkInput,
): EntrustedWorkCard[] {
  const cards: EntrustedWorkCard[] = [];

  for (const automation of input.automations) {
    if (!automation.enabled) continue;
    const when =
      automation.scheduleLabel?.trim() ||
      (automation.nextRun ? `次回 ${automation.nextRun}` : "");
    cards.push({
      id: `auto:${automation.id}`,
      kind: "automation",
      title: automation.name,
      detail: when || "次回から同じ指示は不要です",
      href: `/automations?id=${encodeURIComponent(automation.id)}`,
    });
  }

  for (const remembered of input.rememberedFormats ?? []) {
    if (!remembered.format || !remembered.label) continue;
    cards.push({
      id: `format:${remembered.format}`,
      kind: "remembered_format",
      title: remembered.assignmentHint?.trim() || remembered.label,
      detail: `前回の形式を記憶済み（${remembered.label}）`,
      href: "/workspace",
    });
  }

  for (const item of (input.recentCompleted ?? []).slice(0, 3)) {
    if (!item.id || !item.title.trim()) continue;
    cards.push({
      id: `done:${item.id}`,
      kind: "recent_completed",
      title: item.title,
      detail: item.completedAt ? `最近完了 ${item.completedAt}` : "最近完了した仕事",
      href: item.href ?? "/history",
    });
  }

  return cards;
}

export function isReturningHomeUser(input: {
  entrusted: readonly EntrustedWorkCard[];
  attentionCount?: number;
}): boolean {
  return input.entrusted.length > 0 || (input.attentionCount ?? 0) > 0;
}
