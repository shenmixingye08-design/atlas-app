/** Trigger kinds supported by the Automation Platform. */
export type AutomationTriggerType =
  | "manual"
  | "schedule"
  | "event"
  | "condition";

export type ScheduleFrequency =
  | "once"
  | "daily"
  | "weekly"
  | "monthly"
  | "weekdays"
  | "month_end"
  | "custom_days";

/**
 * Strict schedule model — not a free-form cron-only blob.
 * Cron may be derived for external systems but is never the sole source of truth.
 */
export type AutomationScheduleSpec = {
  frequency: ScheduleFrequency;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 0=Sun … 6=Sat — required for weekly / custom_days */
  daysOfWeek?: number[];
  /** 1-31 — used for monthly; clamped to month length at compute time */
  dayOfMonth?: number;
  /** Absolute ISO timestamp for one-shot runs */
  runAt?: string | null;
  /** Optional derived cron for observability only */
  cronDerived?: string | null;
  /** Inclusive start — runs before this are not scheduled */
  startAt?: string | null;
  /** Exclusive end — after this, nextRunAt stays null */
  endAt?: string | null;
  /** Max successful/attempted occurrences; null = unlimited */
  maxOccurrences?: number | null;
};

export type AutomationEventTrigger = {
  source: string;
  eventType: string;
  filter?: Readonly<Record<string, unknown>>;
};

export type AutomationConditionTrigger = {
  expression: string;
  evaluatedFields?: string[];
};

export type AutomationTrigger = {
  type: AutomationTriggerType;
  /** IANA timezone — required for all automations */
  timezone: string;
  schedule: AutomationScheduleSpec | null;
  event: AutomationEventTrigger | null;
  condition: AutomationConditionTrigger | null;
};
