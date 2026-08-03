import type { Pool, PoolClient } from "pg";

import type {
  CreateDurableJobInput,
  CreateDurableOccurrenceInput,
  CreateDurableRunInput,
  DurableJobRecord,
  DurableOccurrenceRecord,
  DurableRunRecord,
} from "../types";
import { DurableJobsRepository } from "../repositories/jobs-repository";
import { DurableOccurrencesRepository } from "../repositories/occurrences-repository";
import { DurableQueueRepository } from "../repositories/queue-repository";
import { RunRepository } from "../repositories/run-repository";

export type CreateRunJobQueueInput = {
  run: CreateDurableRunInput;
  job: Omit<CreateDurableJobInput, "runId"> & { runId?: string };
  /** Optional occurrence reservation (enforces occurrence uniqueness in same TX). */
  occurrence?: CreateDurableOccurrenceInput;
};

export type CreateRunJobQueueResult = {
  run: DurableRunRecord;
  job: DurableJobRecord;
  queue: DurableJobRecord;
  occurrence: DurableOccurrenceRecord | null;
};

/**
 * Transactional create: (Occurrence?) → Run → Job → Queue.
 * Queue row is the same durable job record (queue projection).
 * Any failure rolls back the entire unit of work.
 */
export async function createRunJobQueueTransaction(
  pool: Pool,
  input: CreateRunJobQueueInput,
): Promise<CreateRunJobQueueResult> {
  return withDurableTransaction(pool, async (client) => {
    const runs = new RunRepository(client);
    const jobs = new DurableJobsRepository(client);
    const queue = new DurableQueueRepository(client);
    const occurrences = new DurableOccurrencesRepository(client);

    let occurrence: DurableOccurrenceRecord | null = null;
    if (input.occurrence) {
      occurrence = await occurrences.create(input.occurrence);
    }

    const run = await runs.createRun({
      ...input.run,
      occurrenceId: input.run.occurrenceId ?? occurrence?.occurrenceId ?? null,
    });

    const job = await jobs.create({
      ...input.job,
      runId: input.job.runId ?? run.runId,
      occurrenceId:
        input.job.occurrenceId ?? occurrence?.occurrenceId ?? null,
    });

    // Keep run.job_id pointer consistent after job create.
    await runs.updateRun(run.runId, { jobId: job.jobId });

    const queued = await queue.enqueue(job);
    return { run: { ...run, jobId: job.jobId }, job, queue: queued, occurrence };
  });
}

/** Explicit begin/commit/rollback helper for callers that manage their own client. */
export async function withDurableTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}
