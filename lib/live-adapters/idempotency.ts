import { createHash } from "crypto";

import type { IntegrationService, LiveExecutionResult } from "./types";

type IdempotencyRow = {
  key: string;
  result: LiveExecutionResult;
  createdAt: string;
};

type Scope = typeof globalThis & {
  __atlasLiveAdapterIdempotency?: Map<string, IdempotencyRow>;
};

function store(): Map<string, IdempotencyRow> {
  const scope = globalThis as Scope;
  if (!scope.__atlasLiveAdapterIdempotency) {
    scope.__atlasLiveAdapterIdempotency = new Map();
  }
  return scope.__atlasLiveAdapterIdempotency;
}

export function hashContent(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function buildIdempotencyKey(input: {
  runId: string;
  stepId: string;
  provider: IntegrationService;
  externalActionKey?: string | null;
  destination?: string | null;
  artifactHash?: string | null;
  recipient?: string | null;
  contentHash?: string | null;
  occurrenceKey?: string | null;
  account?: string | null;
  eventKey?: string | null;
}): string {
  const parts = [
    `run:${input.runId}`,
    `step:${input.stepId}`,
    `provider:${input.provider}`,
    input.externalActionKey ? `ext:${input.externalActionKey}` : null,
    input.destination && input.artifactHash
      ? `upload:${input.destination}:${input.artifactHash}`
      : null,
    input.recipient && input.contentHash && input.occurrenceKey
      ? `email:${input.recipient}:${input.contentHash}:${input.occurrenceKey}`
      : null,
    input.account && input.contentHash && input.occurrenceKey
      ? `post:${input.account}:${input.contentHash}:${input.occurrenceKey}`
      : null,
    input.account && input.eventKey
      ? `cal:${input.account}:${input.eventKey}`
      : null,
  ].filter(Boolean);
  return parts.join("|");
}

export function getIdempotentResult(key: string): LiveExecutionResult | null {
  return store().get(key)?.result ?? null;
}

export function saveIdempotentResult(
  key: string,
  result: LiveExecutionResult,
): LiveExecutionResult {
  store().set(key, {
    key,
    result,
    createdAt: new Date().toISOString(),
  });
  return result;
}

export function resetLiveAdapterIdempotencyForTests(): void {
  store().clear();
}
