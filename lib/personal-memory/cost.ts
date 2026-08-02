import type {
  PersonalMemoryRecord,
  PersonalMemorySettings,
  ResolvedMemoryValue,
} from "@/lib/personal-memory/types";
import { SCOPE_LABELS } from "@/lib/personal-memory/labels";

export function estimateTokens(text: string): number {
  // Rough JP/EN mix estimate
  return Math.ceil(text.length / 2);
}

function specificityScore(memory: PersonalMemoryRecord): number {
  let score = 0;
  if (memory.appliesTo.automationIds.length > 0) score += 40;
  if (memory.appliesTo.workCategories.length > 0) score += 30;
  if (memory.appliesTo.companyIds.length > 0) score += 20;
  if (memory.appliesTo.templateIds.length > 0) score += 15;
  if (memory.appliesTo.artifactTypes.length > 0) score += 10;
  if (memory.appliesTo.global) score += 1;
  return score;
}

export function selectRelevantMemories(input: {
  memories: PersonalMemoryRecord[];
  allowedScopes?: readonly string[] | null;
  deniedScopes?: readonly string[] | null;
  automationId?: string | null;
  artifactTypes?: readonly string[] | null;
  capabilities?: readonly string[] | null;
  workCategory?: string | null;
  companyId?: string | null;
  templateId?: string | null;
  /** Memory ids disabled for this run only */
  sessionDisabledIds?: readonly string[] | null;
  settings: PersonalMemorySettings;
}): PersonalMemoryRecord[] {
  const allowed = input.allowedScopes ? new Set(input.allowedScopes) : null;
  const denied = new Set(input.deniedScopes ?? []);
  const artifacts = new Set(input.artifactTypes ?? []);
  const capabilities = new Set(input.capabilities ?? []);
  const sessionDisabled = new Set(input.sessionDisabledIds ?? []);

  const filtered = input.memories.filter((memory) => {
    if (memory.status !== "active") return false;
    if (sessionDisabled.has(memory.id)) return false;
    if (denied.has(memory.scope)) return false;
    if (allowed && !allowed.has(memory.scope)) return false;

    if (
      memory.appliesTo.automationIds.length > 0 &&
      (!input.automationId ||
        !memory.appliesTo.automationIds.includes(input.automationId))
    ) {
      return false;
    }
    if (
      memory.appliesTo.workCategories.length > 0 &&
      (!input.workCategory ||
        !memory.appliesTo.workCategories.includes(input.workCategory))
    ) {
      return false;
    }
    if (
      memory.appliesTo.companyIds.length > 0 &&
      (!input.companyId ||
        !memory.appliesTo.companyIds.includes(input.companyId))
    ) {
      return false;
    }
    if (
      memory.appliesTo.templateIds.length > 0 &&
      (!input.templateId ||
        !memory.appliesTo.templateIds.includes(input.templateId))
    ) {
      return false;
    }
    if (
      memory.appliesTo.artifactTypes.length > 0 &&
      artifacts.size > 0 &&
      !memory.appliesTo.artifactTypes.some((t) => artifacts.has(t))
    ) {
      return false;
    }
    if (
      memory.appliesTo.capabilities.length > 0 &&
      capabilities.size > 0 &&
      !memory.appliesTo.capabilities.some((c) => capabilities.has(c))
    ) {
      return false;
    }
    return true;
  });

  // Deduplicate by scope+key keeping highest specificity then confidence
  const byKey = new Map<string, PersonalMemoryRecord>();
  for (const memory of filtered) {
    const key = `${memory.scope}:${memory.key}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, memory);
      continue;
    }
    const spec = specificityScore(memory) - specificityScore(existing);
    if (spec > 0) {
      byKey.set(key, memory);
      continue;
    }
    if (spec < 0) continue;
    const newer =
      memory.confidence > existing.confidence ||
      (memory.confidence === existing.confidence &&
        memory.updatedAt > existing.updatedAt);
    if (newer) byKey.set(key, memory);
  }

  return [...byKey.values()]
    .sort(
      (a, b) =>
        specificityScore(b) - specificityScore(a) ||
        b.confidence - a.confidence,
    )
    .slice(0, input.settings.maxMemoriesInjectedPerRun);
}

export function buildInjectionText(
  values: ResolvedMemoryValue[],
  maxChars: number,
): { text: string; truncated: boolean; tokenEstimate: number } {
  const lines = values.map((value) => {
    const label = SCOPE_LABELS[value.scope] ?? value.scope;
    const body =
      typeof value.value.text === "string"
        ? value.value.text
        : typeof value.value.summary === "string"
          ? value.value.summary
          : value.summary;
    return `- ${label}: ${body}`;
  });
  let text = lines.join("\n");
  let truncated = false;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 1)}…`;
    truncated = true;
  }
  return { text, truncated, tokenEstimate: estimateTokens(text) };
}
