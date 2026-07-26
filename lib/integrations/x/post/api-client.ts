import "server-only";

import { createXApiError } from "@/lib/integrations/x/api-error";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import {
  RELIABILITY_TIMEOUTS,
  recordReliabilityEvent,
  withCircuitBreaker,
  withRetry,
} from "@/lib/reliability";

/** In-process dedupe: same accessToken+text within TTL must not double-post. */
const RECENT_POST_TTL_MS = 10 * 60 * 1000;

function recentPostKeys(): Map<string, { tweetId: string; at: number }> {
  const g = globalThis as typeof globalThis & {
    __atlasXRecentPosts?: Map<string, { tweetId: string; at: number }>;
  };
  if (!g.__atlasXRecentPosts) g.__atlasXRecentPosts = new Map();
  return g.__atlasXRecentPosts;
}

function postDedupeKey(accessToken: string, text: string): string {
  return `${accessToken.slice(0, 12)}:${text.trim()}`;
}

export const X_TWEETS_API_URL = "https://api.twitter.com/2/tweets";

export type CreateTweetResponse = {
  data?: {
    id: string;
    text: string;
  };
  errors?: Array<{ message?: string; detail?: string; code?: number | string }>;
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
};

export type FetchTweetResponse = CreateTweetResponse;

async function createTweetOnce(input: {
  accessToken: string;
  text: string;
}): Promise<{ tweetId: string; text: string }> {
  const response = await fetchWithTimeout(
    X_TWEETS_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.text }),
    },
    RELIABILITY_TIMEOUTS.x,
  );

  const payload = (await response.json().catch(() => ({}))) as CreateTweetResponse;

  if (!response.ok) {
    throw createXApiError(response.status, payload);
  }

  const tweetId = payload.data?.id;
  if (!tweetId) {
    throw new Error("X API did not return a tweet id");
  }

  return {
    tweetId,
    text: payload.data?.text ?? input.text,
  };
}

/** Fetch a single tweet by id (owner-scoped via caller access token). */
export async function fetchTweetById(input: {
  accessToken: string;
  tweetId: string;
}): Promise<{ tweetId: string; text: string }> {
  const url = `${X_TWEETS_API_URL}/${encodeURIComponent(input.tweetId)}?tweet.fields=text`;
  const response = await fetchWithTimeout(
    url,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    },
    RELIABILITY_TIMEOUTS.x,
  );

  const payload = (await response.json().catch(() => ({}))) as FetchTweetResponse;

  if (!response.ok) {
    throw createXApiError(response.status, payload);
  }

  const tweetId = payload.data?.id;
  if (!tweetId) {
    throw new Error("X API did not return tweet data");
  }

  return {
    tweetId,
    text: payload.data?.text ?? "",
  };
}

/**
 * Post a tweet with retries, then confirm it exists on X before success.
 * API 200 alone is not enough — existence check is required.
 */
export async function createTweet(input: {
  accessToken: string;
  text: string;
}): Promise<{ tweetId: string; text: string }> {
  const dedupeKey = postDedupeKey(input.accessToken, input.text);
  const recent = recentPostKeys().get(dedupeKey);
  if (recent && Date.now() - recent.at < RECENT_POST_TTL_MS) {
    // Duplicate post forbidden — return the already-confirmed tweet id.
    return { tweetId: recent.tweetId, text: input.text };
  }

  try {
    const created = await withCircuitBreaker("x", async () =>
      withRetry(
        async (attempt) => {
          if (attempt > 1) recordReliabilityEvent("retry", "retry");
          return createTweetOnce(input);
        },
        {
          onRetry: () => recordReliabilityEvent("post_x", "retry"),
        },
      ),
    );

    // Existence confirmation — success only when the tweet can be read back.
    const confirmed = await withRetry(
      () =>
        fetchTweetById({
          accessToken: input.accessToken,
          tweetId: created.tweetId,
        }),
      { maxAttempts: 3 },
    );

    recentPostKeys().set(dedupeKey, {
      tweetId: confirmed.tweetId,
      at: Date.now(),
    });
    recordReliabilityEvent("post_x", "success");
    return {
      tweetId: confirmed.tweetId,
      text: confirmed.text || created.text,
    };
  } catch (error) {
    recordReliabilityEvent("post_x", "failure");
    throw error;
  }
}

export function buildTweetUrl(username: string, tweetId: string): string {
  const handle = username.replace(/^@/, "");
  return `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(tweetId)}`;
}
