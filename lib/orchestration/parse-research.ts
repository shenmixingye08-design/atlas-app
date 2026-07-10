import type { ResearchAssessment, ResearchCategory, ResearchReport } from "./types";

const VALID_CATEGORIES: readonly ResearchCategory[] = [
  "web_research",
  "market_research",
  "competitor_research",
  "technical_documentation",
  "statistics",
  "legal_references",
];

function extractJsonBlock(output: string): unknown | null {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? output.trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCategories(value: unknown): ResearchCategory[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is ResearchCategory =>
    typeof item === "string" && VALID_CATEGORIES.includes(item as ResearchCategory),
  );
}

export function parseResearchAssessmentOutput(output: string): ResearchAssessment {
  const parsed = extractJsonBlock(output) as
    | {
        required?: boolean;
        categories?: unknown;
        rationale?: string;
      }
    | null;

  if (!parsed) {
    return {
      required: false,
      categories: [],
      rationale: "Could not parse research assessment; proceeding without external research.",
    };
  }

  const categories = normalizeCategories(parsed.categories);

  return {
    required: Boolean(parsed.required) && categories.length > 0,
    categories: parsed.required ? categories : [],
    rationale:
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : parsed.required
          ? "External research recommended."
          : "No external research required.",
  };
}

function extractSection(output: string, heading: string): string {
  const pattern = new RegExp(
    `##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i",
  );
  const match = output.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function extractBulletList(section: string): string[] {
  if (!section) return [];

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

function extractConfidenceScore(output: string): number {
  const explicit = output.match(/CONFIDENCE:\s*(\d{1,3})/i);
  if (explicit?.[1]) {
    const value = Number.parseInt(explicit[1], 10);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  }

  const section = extractSection(output, "Confidence Score");
  const fromSection = section.match(/(\d{1,3})/);
  if (fromSection?.[1]) {
    const value = Number.parseInt(fromSection[1], 10);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  }

  return 70;
}

export function parseResearchReportOutput(output: string): ResearchReport {
  const trimmed = output.trim();

  return {
    executiveSummary: extractSection(trimmed, "Executive Summary"),
    keyFindings: extractBulletList(extractSection(trimmed, "Key Findings")),
    supportingEvidence: extractBulletList(
      extractSection(trimmed, "Supporting Evidence"),
    ),
    risks: extractBulletList(extractSection(trimmed, "Risks")),
    sources: extractBulletList(extractSection(trimmed, "Sources")),
    confidenceScore: extractConfidenceScore(trimmed),
    fullText: trimmed,
  };
}

export function formatResearchReportForContext(report: ResearchReport): string {
  const sections = [
    "## Research Report (Atlas Research Department)",
    "",
    "### Executive Summary",
    report.executiveSummary || "(none)",
    "",
    "### Key Findings",
    ...report.keyFindings.map((item) => `- ${item}`),
    "",
    "### Supporting Evidence",
    ...report.supportingEvidence.map((item) => `- ${item}`),
    "",
    "### Risks",
    ...report.risks.map((item) => `- ${item}`),
    "",
    "### Sources",
    ...report.sources.map((item) => `- ${item}`),
    "",
    `Confidence: ${report.confidenceScore}/100`,
  ];

  return sections.join("\n");
}
