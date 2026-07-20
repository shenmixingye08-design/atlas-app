import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

export const X_TWEETS_API_URL = "https://api.twitter.com/2/tweets";

export type CreateTweetResponse = {
  data?: {
    id: string;
    text: string;
  };
  errors?: Array<{ message?: string; detail?: string }>;
};

export type FetchTweetResponse = {
  data?: {
    id: string;
    text: string;
  };
  errors?: Array<{ message?: string; detail?: string }>;
};

export async function createTweet(input: {
  accessToken: string;
  text: string;
}): Promise<{ tweetId: string; text: string }> {
  const response = await fetchWithTimeout(X_TWEETS_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: input.text }),
  });

  const payload = (await response.json().catch(() => ({}))) as CreateTweetResponse;

  if (!response.ok) {
    const message =
      payload.errors?.[0]?.detail ??
      payload.errors?.[0]?.message ??
      `X API error (${response.status})`;
    throw new Error(message);
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
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as FetchTweetResponse;

  if (!response.ok) {
    const message =
      payload.errors?.[0]?.detail ??
      payload.errors?.[0]?.message ??
      `X API error (${response.status})`;
    throw new Error(message);
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

export function buildTweetUrl(username: string, tweetId: string): string {
  const handle = username.replace(/^@/, "");
  return `https://x.com/${handle}/status/${tweetId}`;
}
