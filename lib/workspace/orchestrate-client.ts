import type { OrchestrationResult } from "@/lib/orchestration/types";
import {
  formatUserFacingErrorText,
  toUserFacingError,
} from "@/lib/orchestration/user-errors";
import { submitCommanderRequest } from "@/lib/commander/client";
import type { CommanderRunResult } from "@/lib/commander/types";

/** Client-side timeout — covers commander retries. */
export const ORCHESTRATE_CLIENT_TIMEOUT_MS = 180_000;

export class CommanderConfirmationRequiredError extends Error {
  readonly commander: CommanderRunResult;

  constructor(commander: CommanderRunResult) {
    super("CONFIRMATION_REQUIRED");
    this.name = "CommanderConfirmationRequiredError";
    this.commander = commander;
  }
}

/**
 * Main work request entry — routes through Commander (plan/confirm/execute)
 * then returns the underlying OrchestrationResult for existing workspace UI.
 */
export async function submitWorkRequest(
  assignment: string,
  signal?: AbortSignal,
  options?: {
    metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<OrchestrationResult> {
  const commander = await submitCommanderRequest(assignment, {
    signal,
    mode: "execute",
    metadata: options?.metadata,
  });

  if (commander.status === "awaiting_confirmation") {
    throw new CommanderConfirmationRequiredError(commander);
  }

  if (commander.status === "cancelled") {
    throw new Error("依頼を中止しました。");
  }

  if (!commander.result) {
    throw new Error(
      commander.report.summary ||
        formatUserFacingErrorText(toUserFacingError("実行結果がありません")),
    );
  }

  return {
    ...commander.result,
    ...(commander.runId ? { commanderRunId: commander.runId } : {}),
    ...(commander.workMemory && { workMemory: commander.workMemory }),
    ...(commander.workMemoryCandidates && {
      workMemoryCandidates: commander.workMemoryCandidates as OrchestrationResult["workMemoryCandidates"],
    }),
  };
}

export async function confirmWorkRequest(
  runId: string,
  signal?: AbortSignal,
  options?: { metadata?: Readonly<Record<string, unknown>> },
): Promise<OrchestrationResult> {
  const commander = await submitCommanderRequest("", {
    signal,
    mode: "confirm",
    runId,
    confirmed: true,
    metadata: options?.metadata,
  });

  if (commander.status === "awaiting_confirmation") {
    throw new CommanderConfirmationRequiredError(commander);
  }

  if (!commander.result) {
    throw new Error(commander.report.summary || "確認後の実行に失敗しました。");
  }

  return {
    ...commander.result,
    ...(commander.runId ? { commanderRunId: commander.runId } : {}),
    ...(commander.workMemory && { workMemory: commander.workMemory }),
    ...(commander.workMemoryCandidates && {
      workMemoryCandidates: commander.workMemoryCandidates as OrchestrationResult["workMemoryCandidates"],
    }),
  };
}
