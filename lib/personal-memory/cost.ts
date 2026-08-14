import { expandArtifactTypes } from "@/lib/memory-apply/channels";
import { SCOPE_LABELS } from "@/lib/personal-memory/labels";
import type {
  PersonalMemoryRecord,
  PersonalMemorySettings,
  ResolvedMemoryValue,
} from "@/lib/personal-memory/types";

export function estimateTokens(text: string): number {
  // Rough JP/EN mix estimate
  return Math.ceil(text.length / 2);
}

export function selectRelevantMemories(input: {
  memories: PersonalMemoryRecord[];
  allowedScopes?: readonly string[] | null;
  deniedScopes?: readonly string[] | null;
  automationId?: string | null;
  artifactTypes?: readonly string[] | null;
  capabilities?: readonly string[] | null;
  settings: PersonalMemorySettings;
}): PersonalMemoryRecord[] {
  const allowed = input.allowedScopes ? new Set(input.allowedScopes) : null;
  const denied = new Set(input.deniedScopes ?? []);
  const artifacts = expandArtifactTypes(input.artifactTypes);
  const capabilities = new Set(input.capabilities ?? []);

  const filtered = input.memories.filter((memory) => {
    if (memory.status !== "active") return false;
    if (denied.has(memory.scope)) return false;
    if (allowed && !allowed.has(memory.scope)) return false;
    if (!memory.appliesTo.global) {
      if (
        input.automationId &&
        memory.appliesTo.automationIds.length > 0 &&
        !memory.appliesTo.automationIds.includes(input.automationId)
      ) {
        return false;
      }
    }
    if (memory.appliesTo.artifactTypes.length > 0 && !memory.appliesTo.global) {
      if (artifacts.size === 0) return false;
      const memoryArtifacts = expandArtifactTypes(memory.appliesTo.artifactTypes);
      if (![...memoryArtifacts].some((type) => artifacts.has(type))) {
        return false;
      }
    }
    // X retrieval must not pull Word / Excel / household / company memories
    // even when a row was marked global with leftover artifact types.
    if (artifacts.has("x_post") || artifacts.has("sns")) {
      const memoryArtifacts = expandArtifactTypes(memory.appliesTo.artifactTypes);
      const xBlocked = ["word", "docx", "xlsx", "excel", "household", "company"];
      if (
        memoryArtifacts.size > 0 &&
        !memoryArtifacts.has("x_post") &&
        !memoryArtifacts.has("sns") &&
        [...memoryArtifacts].some((type) => xBlocked.includes(type))
      ) {
        return false;
      }
      const hay = `${memory.summary} ${JSON.stringify(memory.value)}`;
      if (
        /家計簿|会社用|社内文書|Excel列順|列順/.test(hay) &&
        !/x_post|sns|ツイート|\bX\b/i.test(hay)
      ) {
        return false;
      }
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

  // Deduplicate by scope+key keeping highest confidence / newest
  const byKey = new Map<string, PersonalMemoryRecord>();
  for (const memory of filtered) {
    const key = `${memory.scope}:${memory.key}:${
      memory.appliesTo.global
        ? "global"
        : [...memory.appliesTo.artifactTypes].sort().join("|") || "local"
    }`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, memory);
      continue;
    }
    const newer =
      memory.confidence > existing.confidence ||
      (memory.confidence === existing.confidence &&
        memory.updatedAt > existing.updatedAt);
    // Prefer automation-specific over global
    const preferLocal =
      !memory.appliesTo.global && existing.appliesTo.global;
    if (preferLocal || newer) byKey.set(key, memory);
  }

  return [...byKey.values()]
    .sort((a, b) => b.confidence - a.confidence)
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
