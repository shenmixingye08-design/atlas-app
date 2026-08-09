import { describe, expect, it } from "vitest";

import {
  ATLAS_WORK_QUEUE_BASE_MIGRATION_SQL,
  ATLAS_WORK_QUEUE_DURABLE_CLAIM_MIGRATION_SQL,
  ATLAS_WORK_QUEUE_MIGRATION_SQL,
} from "./migration-sql";

describe("work-queue migration SQL", () => {
  it("includes base tables and durable claim RPC", () => {
    expect(ATLAS_WORK_QUEUE_BASE_MIGRATION_SQL).toContain(
      "atlas_work_queue_jobs",
    );
    expect(ATLAS_WORK_QUEUE_BASE_MIGRATION_SQL).toContain(
      "atlas_work_queue_steps",
    );
    expect(ATLAS_WORK_QUEUE_DURABLE_CLAIM_MIGRATION_SQL).toContain(
      "atlas_claim_work_queue_jobs",
    );
    expect(ATLAS_WORK_QUEUE_DURABLE_CLAIM_MIGRATION_SQL).toContain(
      "atlas_reclaim_stuck_work_queue_job",
    );
    expect(ATLAS_WORK_QUEUE_MIGRATION_SQL).toContain("atlas_work_queue_jobs");
    expect(ATLAS_WORK_QUEUE_MIGRATION_SQL).toContain(
      "atlas_claim_work_queue_jobs",
    );
  });
});
