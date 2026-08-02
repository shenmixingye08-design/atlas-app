/**
 * Secretary mode + work-style preferences (client local).
 * Does not rewrite User Profile core.
 */

import type { SecretaryMode, WorkStyleTrait } from "./types";

const STORAGE_KEY = "atlas-executive-assistant-settings";

export type ExecutiveAssistantSettings = {
  secretaryMode: SecretaryMode;
  workStyle: WorkStyleTrait[];
  dismissedKeys: string[];
  snoozedUntil: Record<string, string>;
  /** Last day key (YYYY-MM-DD) when proposals were shown — daily throttle */
  lastProposalDay: string | null;
  proposalsShownThatDay: number;
};

const DEFAULTS: ExecutiveAssistantSettings = {
  secretaryMode: "suggest_only",
  workStyle: [],
  dismissedKeys: [],
  snoozedUntil: {},
  lastProposalDay: null,
  proposalsShownThatDay: 0,
};

export function loadExecutiveAssistantSettings(): ExecutiveAssistantSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ExecutiveAssistantSettings>;
    return {
      secretaryMode:
        parsed.secretaryMode === "off" ||
        parsed.secretaryMode === "suggest_only" ||
        parsed.secretaryMode === "semi_auto" ||
        parsed.secretaryMode === "full_auto"
          ? parsed.secretaryMode
          : "suggest_only",
      workStyle: Array.isArray(parsed.workStyle)
        ? (parsed.workStyle as WorkStyleTrait[])
        : [],
      dismissedKeys: Array.isArray(parsed.dismissedKeys)
        ? parsed.dismissedKeys
        : [],
      snoozedUntil:
        parsed.snoozedUntil && typeof parsed.snoozedUntil === "object"
          ? parsed.snoozedUntil
          : {},
      lastProposalDay:
        typeof parsed.lastProposalDay === "string"
          ? parsed.lastProposalDay
          : null,
      proposalsShownThatDay:
        typeof parsed.proposalsShownThatDay === "number"
          ? parsed.proposalsShownThatDay
          : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveExecutiveAssistantSettings(
  next: ExecutiveAssistantSettings,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function updateSecretaryMode(mode: SecretaryMode): ExecutiveAssistantSettings {
  const current = loadExecutiveAssistantSettings();
  const next = { ...current, secretaryMode: mode };
  saveExecutiveAssistantSettings(next);
  return next;
}

export function dismissExecutiveProposal(dedupeKey: string): void {
  const current = loadExecutiveAssistantSettings();
  if (!current.dismissedKeys.includes(dedupeKey)) {
    current.dismissedKeys.push(dedupeKey);
  }
  delete current.snoozedUntil[dedupeKey];
  saveExecutiveAssistantSettings(current);
}

export function snoozeExecutiveProposal(dedupeKey: string, hours = 24): void {
  const current = loadExecutiveAssistantSettings();
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  current.snoozedUntil[dedupeKey] = until;
  saveExecutiveAssistantSettings(current);
}

export function recordWorkStyleTrait(trait: WorkStyleTrait): void {
  const current = loadExecutiveAssistantSettings();
  if (!current.workStyle.includes(trait)) {
    current.workStyle = [...current.workStyle, trait].slice(-8);
    saveExecutiveAssistantSettings(current);
  }
}

export const SECRETARY_MODE_LABELS: Record<SecretaryMode, string> = {
  off: "OFF",
  suggest_only: "提案のみ",
  semi_auto: "半自動",
  full_auto: "完全自動",
};
