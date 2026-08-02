import type {
  ExecutiveAssistantInput,
  ExecutiveMemoryChain,
} from "@/lib/executive-assistant/types";

/**
 * Executive Memory — expand beyond single deliverable to job chains.
 * Example: 営業 → 営業資料 → PDF → Dropbox → 共有
 */
export function buildExecutiveMemoryChains(
  input: ExecutiveAssistantInput,
): ExecutiveMemoryChain[] {
  const chains: ExecutiveMemoryChain[] = [];

  for (const memory of input.workMemories ?? []) {
    const structured = memory.structuredData ?? {};
    const stepsFromData = Array.isArray(structured.steps)
      ? structured.steps.map((s) => String(s)).filter(Boolean)
      : [];
    const stepsFromTags = memory.tags.filter((t) => t.length > 0);
    const inferred = inferChainFromText(
      `${memory.title} ${memory.summary} ${memory.tags.join(" ")}`,
    );
    const steps =
      stepsFromData.length >= 2
        ? stepsFromData
        : inferred.length >= 2
          ? inferred
          : stepsFromTags.length >= 2
            ? stepsFromTags
            : inferred;

    if (steps.length < 2 && memory.type !== "workflow" && memory.type !== "habit") {
      continue;
    }

    chains.push({
      id: memory.id,
      jobLabel: memory.title,
      category: memory.tags[0] ?? memory.type,
      steps: steps.length >= 2 ? steps : ["依頼", memory.title, "成果物"],
      usageCount: memory.usageCount,
      lastUsedAt: memory.lastUsedAt,
      confidence: Math.min(
        1,
        0.4 + memory.usageCount * 0.08 + (memory.isUserConfirmed ? 0.2 : 0),
      ),
    });
  }

  // Profile-based default sales chain
  for (const job of input.jobUsage ?? []) {
    if (job.count < 3) continue;
    if (!/営業|sales|資料/.test(job.label) && job.jobCategory !== "sales_material") {
      continue;
    }
    const format = job.preferredFormat ?? "pptx";
    const steps = ["営業", "営業資料", format.toUpperCase()];
    if (/pdf/i.test(format)) steps.push("PDF");
    steps.push("保存");
    chains.push({
      id: `profile-chain:${job.jobCategory}`,
      jobLabel: job.label,
      category: job.jobCategory,
      steps,
      usageCount: job.count,
      lastUsedAt: job.lastUsedAt,
      confidence: Math.min(1, 0.5 + job.count * 0.05),
    });
  }

  // Habit chains from automation assignment text
  for (const auto of input.automations) {
    const text = `${auto.name} ${auto.workflow?.assignment ?? ""}`;
    const steps = inferChainFromText(text);
    if (steps.length < 3) continue;
    chains.push({
      id: `auto-chain:${auto.id}`,
      jobLabel: auto.name,
      category: steps[0] ?? "仕事",
      steps,
      usageCount: 3,
      lastUsedAt: auto.lastRun ?? null,
      confidence: 0.65,
    });
  }

  return chains
    .sort((a, b) => b.usageCount - a.usageCount || b.confidence - a.confidence)
    .slice(0, 8);
}

function inferChainFromText(text: string): string[] {
  const steps: string[] = [];
  const lower = text.toLowerCase();
  if (/営業|sales/.test(lower)) steps.push("営業");
  if (/資料|スライド|powerpoint|pptx/.test(lower)) steps.push("営業資料");
  if (/word|docx|文書/.test(lower)) steps.push("Word");
  if (/excel|xlsx/.test(lower)) steps.push("Excel");
  if (/pdf/.test(lower)) steps.push("PDF");
  if (/dropbox|drive|保存/.test(lower)) steps.push("保存");
  if (/slack|共有|share/.test(lower)) steps.push("共有");
  if (/gmail|メール/.test(lower)) steps.push("メール");
  if (/\bx\b|twitter|sns/.test(lower)) steps.push("X投稿");
  return [...new Set(steps)];
}
