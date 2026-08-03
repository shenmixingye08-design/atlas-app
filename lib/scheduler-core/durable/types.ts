import type {
  SchedulerEnvironment,
  SchedulerOccurrenceLink,
  SchedulerOutboxRow,
  SchedulerTickHistory,
} from "../types";

export type SchedulerScheduleIndexRow = {
  automationId: string;
  ownerId: string;
  environment: SchedulerEnvironment;
  enabled: boolean;
  paused: boolean;
  deletedAt: string | null;
  nextRunAt: string | null;
  timezone: string;
  endAt: string | null;
  misfirePolicy: import("../types").MisfirePolicy;
  name: string;
  updatedAt: string;
  createdAt: string;
};

export type SchedulerCoreDurableStore = {
  readonly kind: "file" | "postgres";
  upsertSchedule(row: SchedulerScheduleIndexRow): Promise<void>;
  listDueSchedules(input: {
    environment: SchedulerEnvironment;
    nowIso: string;
    limit: number;
  }): Promise<SchedulerScheduleIndexRow[]>;
  updateScheduleNextRun(
    automationId: string,
    nextRunAt: string | null,
  ): Promise<void>;
  insertTick(history: SchedulerTickHistory): Promise<void>;
  completeTick(history: SchedulerTickHistory): Promise<void>;
  insertOccurrenceLink(link: SchedulerOccurrenceLink): Promise<void>;
  insertOutbox(row: SchedulerOutboxRow): Promise<{ created: boolean; row: SchedulerOutboxRow }>;
  listPendingOutbox(limit: number): Promise<SchedulerOutboxRow[]>;
  markOutboxDelivered(outboxId: string, atIso: string): Promise<void>;
  markOutboxFailed(outboxId: string, errorCode: string): Promise<void>;
  getLatestTick(): Promise<SchedulerTickHistory | null>;
  countPendingOutbox(): Promise<number>;
  oldestDueAgeMs(environment: SchedulerEnvironment, nowMs: number): Promise<number | null>;
  resetForTests(): Promise<void>;
};
