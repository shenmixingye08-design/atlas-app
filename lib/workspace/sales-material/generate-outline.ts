import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";

import {
  buildFallbackSalesOutline,
  formatOutlineForWorker,
} from "./outline-template";
import type { SalesCostMode, SalesMaterialOutline } from "./types";

export { buildFallbackSalesOutline, formatOutlineForWorker } from "./outline-template";

import { wrapCompactInstructions } from "@/lib/atlas-personality";

const OUTLINE_INSTRUCTIONS = wrapCompactInstructions(`Sales material planning assistant.
Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "purpose": "string — why this deck exists",
  "targetAudience": "string — who will read it",
  "structure": ["string — top-level flow items"],
  "sections": [
    {
      "heading": "slide or chapter title",
      "keyMessage": "one core message",
      "visualCandidates": ["diagram or image ideas"]
    }
  ],
  "notes": "optional production notes"
}
Learn from client materials when provided. Match client's structure and phrasing.
Keep sections concise. For low-cost mode use 5-7 sections; standard 8-10; high quality up to 12.`);

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in outline response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeOutline(raw: unknown, fallback: SalesMaterialOutline): SalesMaterialOutline {
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as Record<string, unknown>;

  const sectionsRaw = Array.isArray(record.sections) ? record.sections : [];
  const sections = sectionsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const section = item as Record<string, unknown>;
      const heading = typeof section.heading === "string" ? section.heading.trim() : "";
      if (!heading) return null;
      return {
        heading,
        keyMessage:
          typeof section.keyMessage === "string"
            ? section.keyMessage.trim()
            : "",
        visualCandidates: Array.isArray(section.visualCandidates)
          ? section.visualCandidates.filter((v): v is string => typeof v === "string")
          : [],
      };
    })
    .filter((item): item is SalesMaterialOutline["sections"][number] => item !== null);

  const structure = Array.isArray(record.structure)
    ? record.structure.filter((v): v is string => typeof v === "string")
    : sections.map((section) => section.heading);

  return {
    purpose:
      typeof record.purpose === "string" && record.purpose.trim()
        ? record.purpose.trim()
        : fallback.purpose,
    targetAudience:
      typeof record.targetAudience === "string" && record.targetAudience.trim()
        ? record.targetAudience.trim()
        : fallback.targetAudience,
    structure: structure.length > 0 ? structure : fallback.structure,
    sections: sections.length > 0 ? sections : fallback.sections,
    notes:
      typeof record.notes === "string" && record.notes.trim()
        ? record.notes.trim()
        : fallback.notes,
  };
}

export async function generateSalesMaterialOutline(
  assignment: string,
  costMode: SalesCostMode,
): Promise<SalesMaterialOutline> {
  const fallback = buildFallbackSalesOutline(assignment, costMode);

  if (isMockLlmEnabled()) {
    return fallback;
  }

  try {
    const response = await createAtlasResponse({
      input: `依頼: ${assignment}\nコストモード: ${costMode}`,
      instructions: OUTLINE_INSTRUCTIONS,
      aiTaskType: "planner_unified",
      maxOutputTokens: costMode === "low" ? 1024 : costMode === "high" ? 2048 : 1536,
    });

    const parsed = extractJsonObject(response.output_text);
    return normalizeOutline(parsed, fallback);
  } catch {
    return fallback;
  }
}
