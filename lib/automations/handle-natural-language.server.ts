/**
 * Single NL entry for Home / お願いする / Chat.
 * Operate first, then create. Same Automation SoT.
 */

import "server-only";

import { createAutomationFromNaturalLanguage } from "@/lib/automations/create-from-natural-language.server";
import { parseAutomationNlOperate } from "@/lib/automations/nl-operate";
import { operateAutomationFromNaturalLanguage } from "@/lib/automations/nl-operate.server";
import type { Automation } from "@/lib/automations/types";

export type HandleAutomationNlResult =
  | {
      ok: true;
      message: string;
      frequency?: "daily" | "weekly" | "monthly" | "condition";
      automation: Automation | null;
      code?: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      httpStatus: number;
    };

export async function handleAutomationNaturalLanguage(input: {
  userId: string;
  text: string;
}): Promise<HandleAutomationNlResult> {
  const operate = parseAutomationNlOperate(input.text);
  if (operate.kind !== "none") {
    const result = await operateAutomationFromNaturalLanguage({
      userId: input.userId,
      text: input.text,
      parsed: operate,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      message: result.message,
      automation: result.automation,
      code: result.code,
    };
  }

  const created = await createAutomationFromNaturalLanguage({
    userId: input.userId,
    text: input.text,
  });
  if (!created.ok) return created;
  return {
    ok: true,
    message: created.message,
    frequency: created.frequency,
    automation: created.automation,
  };
}
