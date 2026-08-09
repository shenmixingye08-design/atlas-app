import {
  consumeDistributedRateLimit,
  resetDistributedRateLimitStoreForTests,
} from "@/lib/http/rate-limit";

/** Word / deliverable generation abuse controls (distributed DB SoT). */
export const WORD_GENERATE_RATE_LIMIT = {
  bucket: "deliverable_generate",
  max: 30,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 2_000,
} as const;

export const WORD_CONCURRENT_LIMIT = {
  bucket: "deliverable_generate_concurrent",
  max: 3,
  windowMs: 10 * 60 * 1000,
} as const;

export const WORD_CONTENT_MAX_CHARS = 100_000;
export const WORD_TABLE_MAX_ROWS = 200;
export const WORD_TABLE_MAX_COLS = 20;
export const WORD_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const WORD_REGENERATE_MAX_PER_GROUP = 30;

/**
 * Soft concurrent slots still use process memory for release semantics,
 * but burst/hour limits are distributed. Concurrent overflow also consumes
 * a short distributed window as a multi-instance backstop.
 */
const concurrent = new Map<string, number>();

export function resetWordRateLimitsForTests(): void {
  resetDistributedRateLimitStoreForTests();
  concurrent.clear();
}

export async function enforceWordGenerateRateLimit(
  userId: string,
): Promise<Response | null> {
  const gate = await consumeDistributedRateLimit(userId, WORD_GENERATE_RATE_LIMIT);
  if (!gate.allowed) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((gate.retryAfterMs || 1000) / 1000),
    );
    return Response.json(
      {
        error:
          "短時間に多くのWord生成依頼がありました。しばらくしてから再実行してください。",
        code: "rate_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  // Soft per-instance concurrency (release on completion). Burst/hour is DB SoT above.
  const running = concurrent.get(userId) ?? 0;
  if (running >= WORD_CONCURRENT_LIMIT.max) {
    return Response.json(
      {
        error:
          "同時に実行できるWord生成の上限に達しています。完了を待ってから再実行してください。",
        code: "concurrency_limited",
      },
      { status: 429 },
    );
  }

  concurrent.set(userId, running + 1);
  return null;
}

export function releaseWordGenerateSlot(userId: string): void {
  const running = concurrent.get(userId) ?? 0;
  if (running <= 1) concurrent.delete(userId);
  else concurrent.set(userId, running - 1);
}

export function assertWordContentLimits(content: string): Response | null {
  if (content.length > WORD_CONTENT_MAX_CHARS) {
    return Response.json(
      {
        error: `本文が長すぎます（上限 ${WORD_CONTENT_MAX_CHARS.toLocaleString()} 文字）。分割して作成するか、内容を調整してください。`,
        code: "payload_too_large",
        maxChars: WORD_CONTENT_MAX_CHARS,
      },
      { status: 413 },
    );
  }
  return null;
}

export function countMarkdownTableShape(content: string): {
  maxRows: number;
  maxCols: number;
} {
  const lines = content.split("\n");
  let maxRows = 0;
  let maxCols = 0;
  let currentRows = 0;
  for (const line of lines) {
    if (line.includes("|")) {
      currentRows += 1;
      maxCols = Math.max(
        maxCols,
        line.split("|").filter((part) => part.trim().length > 0).length,
      );
      maxRows = Math.max(maxRows, currentRows);
    } else {
      currentRows = 0;
    }
  }
  return { maxRows, maxCols };
}

export function assertWordTableLimits(content: string): Response | null {
  const shape = countMarkdownTableShape(content);
  if (shape.maxRows > WORD_TABLE_MAX_ROWS || shape.maxCols > WORD_TABLE_MAX_COLS) {
    return Response.json(
      {
        error: `表が大きすぎます（最大 ${WORD_TABLE_MAX_ROWS} 行 × ${WORD_TABLE_MAX_COLS} 列）。列を整理するか分割してください。`,
        code: "table_too_large",
        maxRows: WORD_TABLE_MAX_ROWS,
        maxCols: WORD_TABLE_MAX_COLS,
      },
      { status: 413 },
    );
  }
  return null;
}
