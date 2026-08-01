type Counter = { count: number; resetAt: number };

function getBucket(): Map<string, Counter> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationRateLimit?: Map<string, Counter>;
  };
  if (!globalScope.__atlasAutomationRateLimit) {
    globalScope.__atlasAutomationRateLimit = new Map();
  }
  return globalScope.__atlasAutomationRateLimit;
}

export function checkAutomationRateLimit(input: {
  userId: string;
  action: string;
  limit?: number;
  windowMs?: number;
}): { allowed: boolean; remaining: number } {
  const limit = input.limit ?? 60;
  const windowMs = input.windowMs ?? 60_000;
  const key = `${input.userId}:${input.action}`;
  const now = Date.now();
  const bucket = getBucket();
  const current = bucket.get(key);

  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count };
}

export function resetAutomationRateLimitForTests(): void {
  getBucket().clear();
}
