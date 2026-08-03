import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  SchedulerOccurrenceLink,
  SchedulerOutboxRow,
  SchedulerTickHistory,
} from "../types";
import type {
  SchedulerCoreDurableStore,
  SchedulerScheduleIndexRow,
} from "./types";

type FileData = {
  schedules: Record<string, SchedulerScheduleIndexRow>;
  ticks: SchedulerTickHistory[];
  occurrences: SchedulerOccurrenceLink[];
  outbox: Record<string, SchedulerOutboxRow>;
  occurrenceCreatedKeys: Record<string, true>;
};

function emptyData(): FileData {
  return {
    schedules: {},
    ticks: [],
    occurrences: [],
    outbox: {},
    occurrenceCreatedKeys: {},
  };
}

export function createSchedulerCoreFileStore(
  path?: string,
): SchedulerCoreDurableStore {
  const filePath =
    path ??
    join(
      process.cwd(),
      ".data",
      `scheduler-core-${process.pid}-${Date.now()}.json`,
    );

  let data = emptyData();
  let loaded = false;

  function load(): void {
    if (loaded) return;
    loaded = true;
    try {
      const raw = readFileSync(filePath, "utf8");
      data = { ...emptyData(), ...JSON.parse(raw) };
    } catch {
      data = emptyData();
    }
  }

  function persist(): void {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), "utf8");
    renameSync(tmp, filePath);
  }

  return {
    kind: "file",
    async upsertSchedule(row) {
      load();
      data.schedules[row.automationId] = row;
      persist();
    },
    async listDueSchedules({ environment, nowIso, limit }) {
      load();
      const nowMs = Date.parse(nowIso);
      return Object.values(data.schedules)
        .filter(
          (s) =>
            s.environment === environment &&
            s.enabled &&
            !s.paused &&
            !s.deletedAt &&
            s.nextRunAt &&
            Date.parse(s.nextRunAt) <= nowMs &&
            (!s.endAt || Date.parse(s.endAt) > nowMs),
        )
        .sort(
          (a, b) =>
            Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!),
        )
        .slice(0, limit);
    },
    async updateScheduleNextRun(automationId, nextRunAt) {
      load();
      const row = data.schedules[automationId];
      if (!row) return;
      row.nextRunAt = nextRunAt;
      row.updatedAt = new Date().toISOString();
      persist();
    },
    async insertTick(history) {
      load();
      data.ticks.push(history);
      persist();
    },
    async completeTick(history) {
      load();
      const idx = data.ticks.findIndex(
        (t) => t.schedulerTickId === history.schedulerTickId,
      );
      if (idx >= 0) data.ticks[idx] = history;
      else data.ticks.push(history);
      persist();
    },
    async insertOccurrenceLink(link) {
      load();
      if (link.created) {
        if (data.occurrenceCreatedKeys[link.occurrenceKey]) {
          throw new Error("scheduler_occurrence_duplicate");
        }
        data.occurrenceCreatedKeys[link.occurrenceKey] = true;
      }
      data.occurrences.push(link);
      persist();
    },
    async insertOutbox(row) {
      load();
      const existing = Object.values(data.outbox).find(
        (o) =>
          o.occurrenceKey === row.occurrenceKey && o.jobId === row.jobId,
      );
      if (existing) return { created: false, row: existing };
      data.outbox[row.outboxId] = row;
      persist();
      return { created: true, row };
    },
    async listPendingOutbox(limit) {
      load();
      const now = Date.now();
      return Object.values(data.outbox)
        .filter(
          (o) =>
            (o.status === "pending" || o.status === "failed") &&
            Date.parse(o.availableAt) <= now,
        )
        .slice(0, limit);
    },
    async markOutboxDelivered(outboxId, atIso) {
      load();
      const row = data.outbox[outboxId];
      if (!row) return;
      row.status = "delivered";
      row.dispatchedAt = atIso;
      row.updatedAt = atIso;
      persist();
    },
    async markOutboxFailed(outboxId, errorCode) {
      load();
      const row = data.outbox[outboxId];
      if (!row) return;
      row.status = "failed";
      row.errorCode = errorCode;
      row.attempt += 1;
      row.updatedAt = new Date().toISOString();
      persist();
    },
    async getLatestTick() {
      load();
      if (data.ticks.length === 0) return null;
      return [...data.ticks].sort(
        (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
      )[0]!;
    },
    async countPendingOutbox() {
      load();
      return Object.values(data.outbox).filter(
        (o) => o.status === "pending" || o.status === "failed",
      ).length;
    },
    async oldestDueAgeMs(environment, nowMs) {
      load();
      let oldest: number | null = null;
      for (const s of Object.values(data.schedules)) {
        if (
          s.environment !== environment ||
          !s.enabled ||
          s.paused ||
          s.deletedAt ||
          !s.nextRunAt
        ) {
          continue;
        }
        const age = nowMs - Date.parse(s.nextRunAt);
        if (age >= 0 && (oldest === null || age > oldest)) oldest = age;
      }
      return oldest;
    },
    async resetForTests() {
      data = emptyData();
      loaded = true;
      persist();
    },
  };
}
