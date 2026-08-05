/**
 * AI Executive Assistant — types.
 * Discovery / scoring / prediction are rule-based (no LLM).
 */

export type SecretaryMode = "off" | "suggest_only" | "semi_auto" | "full_auto";

export type WorkStyleTrait =
  | "deadline_crunch"
  | "morning"
  | "evening"
  | "likes_confirm"
  | "skips_confirm"
  | "dislikes_notify"
  | "wants_detail";

export type ExecutiveProposalKind =
  | "recurring_work"
  | "habit_file"
  | "habit_delivery"
  | "repeated_correction"
  | "work_prediction"
  | "deadline"
  | "reply_miss"
  | "memory_standard"
  | "automation_candidate";

export type AutomationStarRating = 1 | 2 | 3 | 4 | 5;

export type AutomationScoreBand = "automate_now" | "candidate" | "watch" | "learning";

export type ExecutiveProposal = {
  id: string;
  kind: ExecutiveProposalKind;
  title: string;
  message: string;
  /** Why the secretary noticed this */
  reason: string;
  automationScore: number;
  scoreBand: AutomationScoreBand;
  stars: AutomationStarRating;
  /** Primary CTA */
  actionLabel: string;
  actionHref: string;
  /** Secondary dismiss */
  dismissible: boolean;
  category?: string;
  scheduleHint?: string;
  memoryChain?: string[];
  generatedAt: string;
  /** Stable key for dedupe / throttle */
  dedupeKey: string;
};

export type ExecutiveMemoryChain = {
  id: string;
  jobLabel: string;
  category: string;
  steps: string[];
  usageCount: number;
  lastUsedAt: string | null;
  confidence: number;
};

export type ExecutiveDashboard = {
  generatedAt: string;
  secretaryMode: SecretaryMode;
  proposals: ExecutiveProposal[];
  predictions: ExecutiveProposal[];
  improvements: ExecutiveProposal[];
  automationCandidates: ExecutiveProposal[];
  recentMemory: ExecutiveMemoryChain[];
  workStyle: WorkStyleTrait[];
  /** Max proposals shown today after throttle */
  shownCount: number;
  suppressedCount: number;
};

export type ExecutiveAssistantInput = {
  automations: ReadonlyArray<{
    id: string;
    name: string;
    enabled?: boolean;
    schedule?: { kind?: string; preset?: { type?: string; dayOfWeek?: number; dayOfMonth?: number; hour?: number; minute?: number }; label?: string };
    lastRun?: string | null;
    nextRun?: string | null;
    workflow?: { assignment?: string };
    status?: string;
  }>;
  projects: ReadonlyArray<{
    id: string;
    title?: string;
    workRequest?: string;
    status?: string;
    updatedAt?: string;
    createdAt?: string;
  }>;
  /** Job usage from work profile (read-only snapshot) */
  jobUsage?: ReadonlyArray<{
    jobCategory: string;
    label: string;
    count: number;
    lastUsedAt: string;
    frequency?: "daily" | "weekly" | "monthly";
    preferredFormat?: string;
    preferredHour?: number;
  }>;
  workMemories?: ReadonlyArray<{
    id: string;
    type: string;
    title: string;
    summary: string;
    tags: string[];
    usageCount: number;
    lastUsedAt: string | null;
    structuredData?: Record<string, unknown>;
    isUserConfirmed?: boolean;
  }>;
  notifications?: ReadonlyArray<{
    id: string;
    type?: string;
    title?: string;
    message?: string;
    createdAt?: string;
    readAt?: string | null;
    actionUrl?: string | null;
  }>;
  /** Optional Gmail/reply miss signals (no tokens) */
  replyMissSignals?: ReadonlyArray<{
    id: string;
    subject: string;
    ageHours: number;
    href?: string;
  }>;
  secretaryMode?: SecretaryMode;
  workStyle?: WorkStyleTrait[];
  dismissedKeys?: readonly string[];
  snoozedUntil?: Readonly<Record<string, string>>;
  now?: Date;
  /** Max proposals to surface (anti-spam) */
  maxProposals?: number;
};
