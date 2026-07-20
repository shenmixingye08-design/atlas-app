// Live X (Twitter) post verification.
//
// Proves the exact request the app sends actually creates a real tweet and
// returns a post id. Uses the same endpoint / payload shape as
// lib/integrations/x/post/api-client.ts (createTweet).
//
// Usage (real post — requires a user OAuth2 access token with tweet.write):
//   X_TEST_ACCESS_TOKEN=... node scripts/verify-x-post.mjs "投稿本文"
//
// With Vercel production env:
//   vercel env pull .env.prod --environment=production
//   # then export the user token you want to test with and run this script.
//
// The script NEVER prints the token. On success it prints the tweet id + URL.

const X_TWEETS_API_URL = "https://api.twitter.com/2/tweets";
const TEST_MARKER = "【ATLASテスト投稿】";

async function main() {
  const token = process.env.X_TEST_ACCESS_TOKEN?.trim();
  const custom = process.argv.slice(2).join(" ").trim();
  const text = custom
    ? custom.startsWith(TEST_MARKER)
      ? custom
      : `${TEST_MARKER} ${custom}`
    : `${TEST_MARKER} ${new Date().toISOString()} — 接続確認`;

  console.log(`[verify-x-post] text: ${JSON.stringify(text)}`);
  console.log(`[verify-x-post] endpoint: POST ${X_TWEETS_API_URL}`);

  if (!token) {
    console.error(
      "[verify-x-post] BLOCKED: X_TEST_ACCESS_TOKEN not set. " +
        "Provide a user access token with tweet.write scope to create a real tweet.",
    );
    process.exitCode = 2;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(X_TWEETS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ??
      payload?.errors?.[0]?.message ??
      `X API error (${response.status})`;
    console.error(`[verify-x-post] FAILED (${response.status}): ${message}`);
    process.exitCode = 1;
    return;
  }

  const id = payload?.data?.id;
  if (!id) {
    console.error("[verify-x-post] FAILED: X API did not return a tweet id");
    process.exitCode = 1;
    return;
  }

  console.log(`[verify-x-post] SUCCESS tweet id: ${id}`);
  console.log(`[verify-x-post] url: https://x.com/i/web/status/${id}`);
  console.log(
    "[verify-x-post] Delete the test tweet from your X account if desired.",
  );
}

main().catch((error) => {
  console.error("[verify-x-post] ERROR:", error?.message ?? error);
  process.exitCode = 1;
});
