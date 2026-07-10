import type { Automation } from "@/lib/automations/types";
import type { UserWorkProfile } from "@/lib/user-profile/types";

/** Future: connector that triggered or will fulfill this suggestion. */
export type SuggestionIntegrationHint =
  | "atlas"
  | "google_calendar"
  | "gmail"
  | "sns"
  | "dropbox"
  | "wordpress";

export type ProactiveSuggestionKind =
  | "scheduled_habit"
  | "activity_pattern"
  | "profile_habit";

export type ProactiveSuggestionAction = {
  /** Run linked automation immediately. */
  automationId?: string;
  /** One-off workspace assignment when no automation is linked. */
  workspaceAssignment?: string;
};

/** A proactive work suggestion shown on the home screen. */
export type ProactiveSuggestion = {
  id: string;
  kind: ProactiveSuggestionKind;
  message: string;
  automationId?: string;
  automationName?: string;
  action: ProactiveSuggestionAction;
  integrationHint: SuggestionIntegrationHint;
  priority: number;
  generatedAt: string;
};

export type SuggestionTimeContext = {
  timeZone: string;
  weekdayLabel: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  dayOfMonth: number;
};

export type GenerateSuggestionsInput = {
  automations: readonly Automation[];
  profile: UserWorkProfile;
  now?: Date;
};
