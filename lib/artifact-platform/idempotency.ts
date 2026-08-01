import type { ConvertArtifactResult } from "./types";

type IdempotencyEntry = {
  key: string;
  userId: string;
  createdAt: number;
  result: ConvertArtifactResult;
  inFlight?: boolean;
};

type Bucket = Map<string, IdempotencyEntry>;

const TTL_MS = 24 * 60 * 60 * 1000;

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasArtifactIdempotency?: Bucket;
  };
  if (!scope.__atlasArtifactIdempotency) {
    scope.__atlasArtifactIdempotency = new Map();
  }
  return scope.__atlasArtifactIdempotency;
}

function purge(bucket: Bucket) {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of bucket.entries()) {
    if (v.createdAt < cutoff) bucket.delete(k);
  }
}

export function idempotencyLookup(
  userId: string,
  key: string | null | undefined
): ConvertArtifactResult | null {
  if (!key) return null;
  const bucket = getBucket();
  purge(bucket);
  const entry = bucket.get(`${userId}:${key}`);
  if (!entry) return null;
  return { ...entry.result, reused: true };
}

export function idempotencyStore(
  userId: string,
  key: string | null | undefined,
  result: ConvertArtifactResult
): void {
  if (!key) return;
  const bucket = getBucket();
  bucket.set(`${userId}:${key}`, {
    key,
    userId,
    createdAt: Date.now(),
    result,
  });
}

export function resetArtifactIdempotencyForTests(): void {
  getBucket().clear();
}

/** Composite key for same conversion detection without client key. */
export function buildConversionFingerprint(input: {
  sourceArtifactId: string;
  targetFormat: string;
  revisionReason?: string | null;
}): string {
  return [
    "conv",
    input.sourceArtifactId,
    input.targetFormat,
    input.revisionReason ?? "default",
  ].join(":");
}
