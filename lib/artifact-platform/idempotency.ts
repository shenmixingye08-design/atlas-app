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

type RegisterIdempotencyEntry = {
  userId: string;
  artifactId: string;
  createdAt: number;
};

function getRegisterBucket(): Map<string, RegisterIdempotencyEntry> {
  const scope = globalThis as typeof globalThis & {
    __atlasArtifactRegisterIdempotency?: Map<string, RegisterIdempotencyEntry>;
  };
  if (!scope.__atlasArtifactRegisterIdempotency) {
    scope.__atlasArtifactRegisterIdempotency = new Map();
  }
  return scope.__atlasArtifactRegisterIdempotency;
}

/** Lookup prior register by userId+requestId (prevents Artifact ID collision / double create). */
export function registerIdempotencyLookup(
  userId: string,
  requestId: string | null | undefined
): string | null {
  if (!requestId) return null;
  const bucket = getRegisterBucket();
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of bucket.entries()) {
    if (v.createdAt < cutoff) bucket.delete(k);
  }
  return bucket.get(`${userId}:${requestId}`)?.artifactId ?? null;
}

export function registerIdempotencyStore(
  userId: string,
  requestId: string | null | undefined,
  artifactId: string
): void {
  if (!requestId) return;
  getRegisterBucket().set(`${userId}:${requestId}`, {
    userId,
    artifactId,
    createdAt: Date.now(),
  });
}

export function resetArtifactIdempotencyForTests(): void {
  getBucket().clear();
  getRegisterBucket().clear();
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
