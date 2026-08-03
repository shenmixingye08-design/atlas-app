import "server-only";

import { randomUUID } from "node:crypto";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapOccurrence } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type {
  CreateDurableOccurrenceInput,
  DurableOccurrenceRecord,
} from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.occurrences;

type Queryable = Pick<DurableSotPool, "query">;

export class DurableOccurrencesRepository {
  constructor(private readonly pool: Queryable) {}

  async create(
    input: CreateDurableOccurrenceInput,
  ): Promise<DurableOccurrenceRecord> {
    const occurrenceId = input.occurrenceId ?? randomUUID();
    const now = new Date().toISOString();
    try {
      const res = await this.pool.query(
        `insert into public.${T} (
          occurrence_id, owner_id, automation_id, occurrence_key, schedule_id,
          scheduled_at, status, run_id, created_at, updated_at, expires_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10
        ) returning *`,
        [
          occurrenceId,
          input.ownerId,
          input.automationId,
          input.occurrenceKey,
          input.scheduleId ?? null,
          input.scheduledAt,
          input.status ?? "reserved",
          input.runId ?? null,
          now,
          input.expiresAt ?? null,
        ],
      );
      return mapOccurrence(res.rows[0] as Record<string, unknown>);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DurableSotUniqueViolationError(
          "occurrence unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async find(input: {
    automationId: string;
    occurrenceKey: string;
  }): Promise<DurableOccurrenceRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T}
       where automation_id = $1 and occurrence_key = $2
       limit 1`,
      [input.automationId, input.occurrenceKey],
    );
    if (!res.rowCount) return null;
    return mapOccurrence(res.rows[0] as Record<string, unknown>);
  }

  async get(occurrenceId: string): Promise<DurableOccurrenceRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T} where occurrence_id = $1 limit 1`,
      [occurrenceId],
    );
    if (!res.rowCount) return null;
    return mapOccurrence(res.rows[0] as Record<string, unknown>);
  }
}
