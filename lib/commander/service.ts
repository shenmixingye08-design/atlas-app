import "server-only";

import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";

import {
  cancelCommanderRun,
  confirmCommanderRun,
  executeCommander,
  planCommander,
} from "./execute";
import { buildCommanderPlan } from "./plan";
import {
  ensureCommanderRunsHydrated,
  getCommanderRun,
  listCommanderRunsForUser,
} from "./run-store";
import type { CommanderRequest, CommanderRunResult } from "./types";

export function parseCommanderRequest(body: unknown):
  | CommanderRequest
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as {
    assignment?: unknown;
    metadata?: unknown;
    mode?: unknown;
    runId?: unknown;
    confirmed?: unknown;
  };

  const mode =
    record.mode === undefined
      ? "execute"
      : record.mode === "plan" ||
          record.mode === "execute" ||
          record.mode === "confirm" ||
          record.mode === "cancel"
        ? record.mode
        : null;

  if (!mode) {
    return { error: "mode must be plan, execute, confirm, or cancel" };
  }

  if (
    record.metadata !== undefined &&
    (typeof record.metadata !== "object" || record.metadata === null)
  ) {
    return { error: "metadata must be an object" };
  }

  if (mode === "confirm" || mode === "cancel") {
    if (typeof record.runId !== "string" || !record.runId.trim()) {
      return { error: "runId is required for confirm/cancel" };
    }
    return {
      assignment: "",
      mode,
      runId: record.runId.trim(),
      confirmed: mode === "confirm",
      ...(record.metadata !== undefined && {
        metadata: record.metadata as Readonly<Record<string, unknown>>,
      }),
    };
  }

  if (typeof record.assignment !== "string" || !record.assignment.trim()) {
    return { error: "assignment is required and must be a non-empty string" };
  }

  return {
    assignment: record.assignment.trim(),
    mode,
    ...(typeof record.runId === "string" &&
      record.runId.trim() && { runId: record.runId.trim() }),
    ...(record.confirmed === true && { confirmed: true }),
    ...(record.metadata !== undefined && {
      metadata: record.metadata as Readonly<Record<string, unknown>>,
    }),
  };
}

export async function runCommanderRequest(input: {
  request: CommanderRequest;
  userId: string | null;
}): Promise<CommanderRunResult> {
  if (!input.userId) {
    throw new Error("Unauthorized");
  }

  await ensureCommanderRunsHydrated(input.userId);
  await ensureWorkMemoryHydrated(input.userId);

  if (input.request.mode === "plan") {
    return planCommander({
      assignment: input.request.assignment,
      userId: input.userId,
    });
  }

  if (input.request.mode === "cancel") {
    return cancelCommanderRun({
      runId: input.request.runId!,
      userId: input.userId,
    });
  }

  if (input.request.mode === "confirm") {
    return confirmCommanderRun({
      runId: input.request.runId!,
      userId: input.userId,
      metadata: input.request.metadata,
    });
  }

  return executeCommander({
    assignment: input.request.assignment,
    userId: input.userId,
    metadata: input.request.metadata,
    confirmed: input.request.confirmed,
    runId: input.request.runId,
  });
}

export {
  buildCommanderPlan,
  cancelCommanderRun,
  confirmCommanderRun,
  executeCommander,
  getCommanderRun,
  listCommanderRunsForUser,
  planCommander,
};
