import "server-only";

import { buildHouseholdMemoryCandidateInputs, preferencesFromMemoryValues } from "@/lib/household-book/memory";
import {
  DEFAULT_HOUSEHOLD_PREFERENCES,
  type HouseholdBookDocument,
  type HouseholdPreferences,
} from "@/lib/household-book/types";
import { createPersonalMemory, resolveForContext } from "@/lib/personal-memory/service";

export async function loadHouseholdPreferences(
  userId: string,
): Promise<HouseholdPreferences> {
  try {
    const { result } = await resolveForContext({
      userId,
      allowedScopes: ["recurring_work_preferences", "excel_template", "work_content_style"],
      artifactTypes: ["xlsx"],
    });
    if (result.used.length === 0) return DEFAULT_HOUSEHOLD_PREFERENCES;
    return preferencesFromMemoryValues(
      result.used.map((row) => ({
        scope: row.scope,
        key: row.key,
        value: row.value,
      })),
    );
  } catch {
    return DEFAULT_HOUSEHOLD_PREFERENCES;
  }
}

export async function proposeHouseholdMemoryCandidates(
  userId: string,
  book: HouseholdBookDocument,
): Promise<number> {
  const inputs = buildHouseholdMemoryCandidateInputs(book);
  let created = 0;
  for (const input of inputs) {
    try {
      await createPersonalMemory(userId, input);
      created += 1;
    } catch {
      // Candidate write must never fail the household Excel.
    }
  }
  return created;
}
