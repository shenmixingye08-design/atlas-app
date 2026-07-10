import type { ResearchCategory } from "@/lib/orchestration/types";
import { RESEARCH_EXCELLENCE } from "@/lib/prompts/excellence/output-standards";

const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  web_research: "Web research",
  market_research: "Market research",
  competitor_research: "Competitor research",
  technical_documentation: "Technical documentation",
  statistics: "Statistics / data",
  legal_references: "Legal references",
};

/** Research step: decide whether external research is required before planning. */
export const RESEARCH_TASKS = {
  assessNeed: `${RESEARCH_EXCELLENCE}

Analyze the user's assignment and CEO analysis. Determine whether external research is required BEFORE planning begins.

Evaluate these research categories:
- web_research — current events, general web facts, product/service lookups
- market_research — market size, trends, customer segments, industry landscape
- competitor_research — competitors, positioning, pricing, feature comparison
- technical_documentation — APIs, specs, frameworks, implementation references
- statistics — quantitative data, benchmarks, surveys, metrics
- legal_references — regulations, compliance, contracts, legal precedents

Respond with ONLY a JSON object (no markdown fences):
{
  "required": boolean,
  "categories": ["web_research" | "market_research" | "competitor_research" | "technical_documentation" | "statistics" | "legal_references"],
  "rationale": "1-3 sentence explanation prioritizing what evidence matters most"
}

Set required=true when ANY category needs fresh external evidence to produce a credible, client-ready deliverable.
Set required=false only when the task is purely creative, internal, or fully answerable from the assignment alone.`,
} as const;

export function buildResearchReportTaskPrompt(
  categories: readonly ResearchCategory[],
): string {
  const categoryList = categories
    .map((category) => `- ${CATEGORY_LABELS[category] ?? category}`)
    .join("\n");

  return `${RESEARCH_EXCELLENCE}

Conduct structured research for the user's assignment using the CEO analysis as strategic context.

Focus areas (prioritize by business impact):
${categoryList}

Produce a Research Report with EXACTLY these markdown sections:

## Executive Summary
(3-5 sentences: top insight, why it matters, recommended direction)

## Key Findings
- (3-8 bullets, ordered by priority — highest business impact first)
- (each finding must be distinct — no duplicates or rephrased ideas)
- (each finding must be actionable for downstream planning)

## Supporting Evidence
- (facts, data points, or documented observations backing the findings above)
- (group related evidence; avoid repeating the same fact)

## Risks & Uncertainties
- (gaps, conflicting data, assumptions, or caveats that could affect decisions)

## Recommended Actions
- (3-6 prioritized next steps the Planner should reflect in the execution plan)

## Sources
- (URLs, document titles, or named references; mark inferred items as "[inference]")

## Confidence Score
CONFIDENCE: <integer 0-100>

Guidelines:
- Synthesize across sources — do not dump raw notes
- Distinguish verified facts from reasonable inference
- Remove duplicate ideas before finalizing
- Respond in the same language as the user's assignment (default: Japanese)
- Downstream Planner and Workers will rely on this report — make every section decision-ready`;
}
