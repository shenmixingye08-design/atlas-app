import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { wrapCompactInstructions } from "@/lib/atlas-personality";

import type {
  CalendarEvent,
  CalendarFreeSlot,
  CalendarMeetingCandidate,
  CalendarOrganizeInsight,
} from "./types";

const CALENDAR_AI_INSTRUCTIONS = wrapCompactInstructions(
  "Google Calendar assistant for ATLAS. Respond in Japanese with calm secretary tone (keigo). Return valid JSON only, no markdown fences.",
);

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse AI JSON response");
    return JSON.parse(match[0]);
  }
}

function getResponseText(response: { output_text?: string | null }): string {
  return response.output_text?.trim() ?? "";
}

function buildMockOrganize(
  events: readonly CalendarEvent[],
): CalendarOrganizeInsight {
  const conflicts: string[] = [];
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]!;
      const b = events[j]!;
      if (
        new Date(a.startAt).getTime() < new Date(b.endAt).getTime() &&
        new Date(b.startAt).getTime() < new Date(a.endAt).getTime()
      ) {
        conflicts.push(`「${a.title}」と「${b.title}」が重複しています`);
      }
    }
  }

  return {
    summaryLines: [
      `予定は${events.length}件あります。`,
      events[0]
        ? `最初の予定は「${events[0].title}」です。`
        : "この期間に予定はありません。",
      conflicts.length > 0
        ? "重複があるため調整をおすすめします。"
        : "大きな重複は見当たりません。",
    ],
    conflicts,
    suggestions:
      events.length === 0
        ? ["集中作業の時間を先に確保すると進めやすいです。"]
        : ["移動時間を前後に確保し、重要会議の前に準備枠を置くと安心です。"],
  };
}

export async function organizeCalendarEventsWithAi(
  events: readonly CalendarEvent[],
): Promise<CalendarOrganizeInsight> {
  if (isMockLlmEnabled()) {
    return buildMockOrganize(events);
  }

  const payload = events.map((event) => ({
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    location: event.location,
    isAllDay: event.isAllDay,
  }));

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: CALENDAR_AI_INSTRUCTIONS,
    input: `Organize these calendar events for an executive. Return JSON:
{
  "summaryLines": ["...", "...", "..."],
  "conflicts": ["..."],
  "suggestions": ["...", "..."]
}

Events:
${JSON.stringify(payload)}`,
    maxOutputTokens: 900,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(getResponseText(response)) as CalendarOrganizeInsight;
  const fallback = buildMockOrganize(events);

  return {
    summaryLines: (parsed.summaryLines ?? fallback.summaryLines).slice(0, 5),
    conflicts: parsed.conflicts ?? fallback.conflicts,
    suggestions: (parsed.suggestions ?? fallback.suggestions).slice(0, 5),
  };
}

export async function proposeMeetingCandidatesWithAi(input: {
  freeSlots: readonly CalendarFreeSlot[];
  durationMinutes: number;
  purpose?: string;
}): Promise<CalendarMeetingCandidate[]> {
  const eligible = input.freeSlots
    .filter((slot) => slot.durationMinutes >= input.durationMinutes)
    .slice(0, 12);

  if (eligible.length === 0) return [];

  if (isMockLlmEnabled()) {
    return eligible.slice(0, 3).map((slot, index) => ({
      startAt: slot.startAt,
      endAt: new Date(
        new Date(slot.startAt).getTime() + input.durationMinutes * 60000,
      ).toISOString(),
      durationMinutes: input.durationMinutes,
      reason:
        index === 0
          ? "午前中の空きで集中しやすい時間帯です"
          : "他予定との間隔が取りやすい枠です",
      score: 90 - index * 10,
    }));
  }

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: CALENDAR_AI_INSTRUCTIONS,
    input: `Propose up to 3 meeting slots of ${input.durationMinutes} minutes.
Purpose: ${input.purpose?.trim() || "一般的な打ち合わせ"}
Return JSON: { "candidates": [ { "startAt": "...", "endAt": "...", "durationMinutes": ${input.durationMinutes}, "reason": "...", "score": 0-100 } ] }

Free slots:
${JSON.stringify(eligible)}`,
    maxOutputTokens: 700,
    temperature: 0.3,
  });

  const parsed = extractJsonObject(getResponseText(response)) as {
    candidates?: CalendarMeetingCandidate[];
  };

  const candidates = (parsed.candidates ?? [])
    .filter((item) => item.startAt && item.endAt)
    .slice(0, 3);

  if (candidates.length > 0) return candidates;

  return eligible.slice(0, 3).map((slot, index) => ({
    startAt: slot.startAt,
    endAt: new Date(
      new Date(slot.startAt).getTime() + input.durationMinutes * 60000,
    ).toISOString(),
    durationMinutes: input.durationMinutes,
    reason: "空き時間から候補を抽出しました",
    score: 80 - index * 5,
  }));
}
