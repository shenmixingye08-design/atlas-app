/**
 * VALUE 2 — Memory as lived preference, not a feature label.
 * Priority: current explicit instruction > Memory > default.
 * Cross-genre contamination is forbidden.
 */

import {
  detectInstructionPreferenceItems,
  parseExplicitOverrideFromText,
  preferenceApplicationRate,
  stripKnownPreferencesFromInstruction,
  type InstructionPreferenceItem,
} from "@/lib/memory-apply/instruction-reduction";
import { X_MEMORY_DENIED_SCOPES } from "@/lib/memory-apply/x-social-preference";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";

export const MEMORY_PRIORITY = [
  "explicit",
  "memory",
  "default",
] as const;

export type MemoryPriorityLayer = (typeof MEMORY_PRIORITY)[number];

export type WorkGenre =
  | "x_post"
  | "word"
  | "excel"
  | "pdf"
  | "powerpoint"
  | "gmail"
  | "calendar"
  | "other";

export const GENRE_DENIED_SCOPES: Record<WorkGenre, readonly PersonalMemoryScope[]> =
  {
    x_post: X_MEMORY_DENIED_SCOPES,
    word: ["excel_template", "sheet_naming"],
    excel: ["word_template", "powerpoint_theme", "pdf_layout"],
    pdf: ["excel_template", "sheet_naming"],
    powerpoint: ["excel_template", "sheet_naming"],
    gmail: ["excel_template", "sheet_naming"],
    calendar: ["excel_template", "word_template"],
    other: [],
  };

export function resolveMemoryLayer(input: {
  explicitValue: string | null | undefined;
  memoryValue: string | null | undefined;
  defaultValue: string;
}): { value: string; layer: MemoryPriorityLayer } {
  const explicit = input.explicitValue?.trim() ?? "";
  if (explicit) return { value: explicit, layer: "explicit" };
  const memory = input.memoryValue?.trim() ?? "";
  if (memory) return { value: memory, layer: "memory" };
  return { value: input.defaultValue, layer: "default" };
}

export function isScopeAllowedForGenre(
  genre: WorkGenre,
  scope: PersonalMemoryScope,
): boolean {
  return !GENRE_DENIED_SCOPES[genre].includes(scope);
}

export const FIRST_RUN_SPEC_KEYS = [
  "format:docx",
  "length:short",
  "tone:polite",
  "headingCount",
] as const;

export function detectRespecification(input: {
  firstInstruction: string;
  secondInstruction: string;
  savedKeys: readonly string[];
}): {
  firstSpecCount: number;
  secondSpecCount: number;
  reusedCount: number;
  firstKeys: string[];
  secondKeys: string[];
  reusedKeys: string[];
  allFirstKeysReused: boolean;
} {
  const firstKeys = detectInstructionPreferenceItems(input.firstInstruction);
  const secondKeys = detectInstructionPreferenceItems(input.secondInstruction);
  const saved = new Set(input.savedKeys);
  const reusedKeys = firstKeys.filter(
    (key) => saved.has(key) && !secondKeys.includes(key),
  );
  return {
    firstSpecCount: firstKeys.length,
    secondSpecCount: secondKeys.length,
    reusedCount: reusedKeys.length,
    firstKeys,
    secondKeys,
    reusedKeys,
    allFirstKeysReused:
      firstKeys.length > 0 &&
      firstKeys.every((key) => saved.has(key) && !secondKeys.includes(key)),
  };
}

export function shouldShowPreferenceAppliedNotice(input: {
  preferenceNotice?: string | null;
  appliedPreferenceKeys?: readonly string[] | null;
  applied?: boolean;
}): boolean {
  if (!input.applied) return false;
  const keys = input.appliedPreferenceKeys ?? [];
  if (keys.length === 0) return false;
  const notice = input.preferenceNotice?.trim() ?? "";
  return notice.length > 0;
}

export {
  detectInstructionPreferenceItems,
  parseExplicitOverrideFromText,
  preferenceApplicationRate,
  stripKnownPreferencesFromInstruction,
};
export type { InstructionPreferenceItem };
