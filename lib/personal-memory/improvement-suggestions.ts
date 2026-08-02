import { createHash } from "crypto";

import type {
  MemoryImprovementSuggestion,
  PersonalMemoryRecord,
} from "@/lib/personal-memory/types";
import { analyzeDeliverableDiff } from "@/lib/personal-memory/diff-learning";
import { sanitizeUserFacingMemoryText } from "@/lib/personal-memory/security";

type CorrectionEvidence = {
  before?: string | null;
  after?: string | null;
  text?: string | null;
  scopeHint?: string | null;
};

/**
 * Analyze recent correction-like evidence (~10) and propose improvements.
 * Pure / deterministic — no LLM.
 */
export function buildImprovementSuggestions(input: {
  memories: PersonalMemoryRecord[];
  recentCorrections?: CorrectionEvidence[];
  limit?: number;
}): MemoryImprovementSuggestion[] {
  const limit = input.limit ?? 5;
  const corrections = (input.recentCorrections ?? []).slice(0, 10);
  const tally = new Map<
    string,
    {
      scope: MemoryImprovementSuggestion["scope"];
      key: string;
      title: string;
      summary: string;
      value: Record<string, unknown>;
      count: number;
    }
  >();

  for (const row of corrections) {
    if (row.before && row.after) {
      const signals = analyzeDeliverableDiff({
        before: row.before,
        after: row.after,
      });
      for (const signal of signals) {
        const id = `${signal.scope}:${signal.key}:${JSON.stringify(signal.value)}`;
        const existing = tally.get(id);
        if (existing) {
          existing.count += 1;
        } else {
          tally.set(id, {
            scope: signal.scope,
            key: signal.key,
            title: signal.title,
            summary: signal.summary,
            value: signal.value,
            count: 1,
          });
        }
      }
      continue;
    }
    if (row.text) {
      const text = row.text;
      if (/短く|簡潔/.test(text)) {
        const id = "writing_style:length:short";
        const existing = tally.get(id);
        if (existing) existing.count += 1;
        else {
          tally.set(id, {
            scope: "writing_style",
            key: "length",
            title: "文章の長さ",
            summary: "短めで生成する",
            value: { length: "short", text: "短めで生成する" },
            count: 1,
          });
        }
      }
      if (/PDF|pdf/.test(text)) {
        const id = "preferred_formats:formats:pdf";
        const existing = tally.get(id);
        if (existing) existing.count += 1;
        else {
          tally.set(id, {
            scope: "preferred_formats",
            key: "formats",
            title: "成果物の形式",
            summary: "PDFも自動生成する",
            value: { formats: ["pdf"], text: "PDFも自動生成する" },
            count: 1,
          });
        }
      }
    }
  }

  // Also scan candidate memories with repeated correction evidence
  for (const memory of input.memories) {
    if (memory.status !== "candidate" && memory.status !== "active") continue;
    const correctionEvidence = memory.evidence.filter((e) => e.kind === "correction");
    if (correctionEvidence.length < 2) continue;
    const id = `${memory.scope}:${memory.key}:mem`;
    if (tally.has(id)) continue;
    tally.set(id, {
      scope: memory.scope,
      key: memory.key,
      title: memory.title,
      summary: memory.summary,
      value: memory.value,
      count: correctionEvidence.length,
    });
  }

  return [...tally.values()]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((row) => {
      const hash = createHash("sha256")
        .update(`${row.scope}:${row.key}:${row.summary}`)
        .digest("hex")
        .slice(0, 12);
      const confidence = Math.min(0.84, 0.45 + row.count * 0.1);
      return {
        id: `suggest_${hash}`,
        title: sanitizeUserFacingMemoryText(
          `毎回「${row.title}」を直しています`,
        ).slice(0, 80),
        description: sanitizeUserFacingMemoryText(
          `過去${row.count}回の修正から、「${row.summary}」を標準にしますか？`,
        ).slice(0, 200),
        scope: row.scope,
        key: row.key,
        proposedValue: row.value,
        evidenceCount: row.count,
        confidence,
      };
    });
}
