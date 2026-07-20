// Live end-to-end X (Twitter) post verification against production data.
//
// Proves the ATLAS posting path actually creates a real tweet by:
//   1. Reading a stored user's X OAuth credentials from Supabase
//      (atlas_x_oauth_credentials) via the service-role REST API.
//   2. Reusing the stored access token, or refreshing it with the X OAuth
//      token endpoint when expired (rotating refresh tokens are persisted
//      back so the real user is NOT logged out).
//   3. Creating a real tweet via POST https://api.twitter.com/2/tweets.
//   4. Confirming the tweet exists via GET /2/tweets/:id.
//   5. Deleting the test tweet again (unless --keep) to avoid spamming.
//
// This script NEVER prints access tokens, refresh tokens, or client secrets.
// On success it prints the tweet id + URL only.
//
// Usage:
//   node scripts/verify-x-post-live.mjs [--keep] ["投稿本文"]
// Requires .env.prod (vercel env pull .env.prod --environment=production) with:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   X_CLIENT_ID, X_CLIENT_SECRET

import { readFileSync } from "node:fs";

const X_TWEETS_API_URL = "https://api.twitter.com/2/tweets";
const X_OAUTH_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TABLE = "atlas_x_oauth_credentials";
const TEST_MARKER = "【MINERVOTテスト投稿】";
const REFRESH_BUFFER_MS = 60_000;

function loadEnvFile(path) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function maskId(id) {
  if (!id) return "(none)";
  if (id.length <= 10) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

async function supabaseSelectConnected(supaUrl, serviceKey) {
  const url =
    `${supaUrl.replace(/\/$/, "")}/rest/v1/${TABLE}` +
    `?select=user_id,access_token,refresh_token,expires_at,scope,account_username,connection_status` +
    `&connection_status=eq.connected&order=last_used_at.desc.nullslast`;
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Supabase read failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }
  return (await response.json()) ?? [];
}

async function supabasePatchTokens(supaUrl, serviceKey, userId, patch) {
  const url =
    `${supaUrl.replace(/\/$/, "")}/rest/v1/${TABLE}` +
    `?user_id=eq.${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Supabase token persist failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }
}

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
    "base64",
  );
  const response = await fetch(X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const msg =
      payload.error_description ?? payload.error ?? `status ${response.status}`;
    throw new Error(`X token refresh failed: ${msg}`);
  }
  return payload;
}

async function createTweet(accessToken, text) {
  const response = await fetch(X_TWEETS_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ??
      payload?.errors?.[0]?.message ??
      payload?.detail ??
      `X API error (${response.status})`;
    throw new Error(message);
  }
  const id = payload?.data?.id;
  if (!id) throw new Error("X API did not return a tweet id");
  return id;
}

async function fetchTweet(accessToken, id) {
  const url = `${X_TWEETS_API_URL}/${encodeURIComponent(id)}?tweet.fields=created_at`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, id: payload?.data?.id ?? null };
}

async function deleteTweet(accessToken, id) {
  const response = await fetch(`${X_TWEETS_API_URL}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, deleted: payload?.data?.deleted === true };
}

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes("--keep");
  const custom = args.filter((a) => a !== "--keep").join(" ").trim();
  const text = custom
    ? custom.startsWith(TEST_MARKER)
      ? custom
      : `${TEST_MARKER} ${custom}`
    : `${TEST_MARKER} ${new Date().toISOString()} — 接続確認`;

  const env = { ...loadEnvFile(".env.prod"), ...process.env };
  const supaUrl =
    env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const clientId = env.X_CLIENT_ID || "";
  const clientSecret = env.X_CLIENT_SECRET || "";

  const missing = [];
  if (!supaUrl) missing.push("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!clientId) missing.push("X_CLIENT_ID");
  if (!clientSecret) missing.push("X_CLIENT_SECRET");
  if (missing.length) {
    console.error(`[verify] BLOCKED: missing env: ${missing.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  console.log(`[verify] text: ${JSON.stringify(text)}`);
  console.log("[verify] reading connected X credentials from Supabase…");
  const rows = await supabaseSelectConnected(supaUrl, serviceKey);
  const usable = rows.filter((r) => r.refresh_token || r.access_token);
  console.log(
    `[verify] connected X users: ${rows.length} (usable: ${usable.length})`,
  );
  if (!usable.length) {
    console.error(
      "[verify] BLOCKED: no connected X users with stored tokens found.",
    );
    process.exitCode = 2;
    return;
  }

  const row = usable[0];
  console.log(
    `[verify] using user ${maskId(row.user_id)} (@${row.account_username ?? "?"}) scope=${row.scope || "?"}`,
  );

  if (row.scope && !row.scope.includes("tweet.write")) {
    console.error(
      "[verify] WARNING: stored scope lacks tweet.write — post will likely 403.",
    );
  }

  let accessToken = row.access_token;
  const expiresAtMs = new Date(row.expires_at).getTime();
  const stillValid =
    Number.isFinite(expiresAtMs) &&
    Date.now() < expiresAtMs - REFRESH_BUFFER_MS &&
    !!accessToken;

  if (stillValid) {
    console.log("[verify] stored access token still valid — reusing.");
  } else {
    if (!row.refresh_token) {
      console.error(
        "[verify] BLOCKED: access token expired and no refresh token stored.",
      );
      process.exitCode = 2;
      return;
    }
    console.log("[verify] access token expired — refreshing via X OAuth…");
    const refreshed = await refreshAccessToken(
      row.refresh_token,
      clientId,
      clientSecret,
    );
    accessToken = refreshed.access_token;
    const expiresAt = new Date(
      Date.now() + (refreshed.expires_in ?? 7200) * 1000,
    ).toISOString();
    await supabasePatchTokens(supaUrl, serviceKey, row.user_id, {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? row.refresh_token,
      expires_at: expiresAt,
      scope: refreshed.scope || row.scope,
      updated_at: new Date().toISOString(),
    });
    console.log(
      "[verify] token refreshed and rotated tokens persisted back to Supabase.",
    );
  }

  console.log("[verify] creating real tweet via api.twitter.com…");
  const tweetId = await createTweet(accessToken, text);
  const url = row.account_username
    ? `https://x.com/${row.account_username}/status/${tweetId}`
    : `https://x.com/i/web/status/${tweetId}`;
  console.log(`[verify] SUCCESS tweet id: ${tweetId}`);
  console.log(`[verify] url: ${url}`);

  const check = await fetchTweet(accessToken, tweetId);
  console.log(
    `[verify] confirm GET /2/tweets/${tweetId}: ${check.ok && check.id === tweetId ? "OK (exists on X)" : "could not confirm"}`,
  );

  if (keep) {
    console.log("[verify] --keep set: leaving the test tweet on the account.");
  } else {
    const del = await deleteTweet(accessToken, tweetId);
    console.log(
      `[verify] cleanup delete: ${del.ok && del.deleted ? "deleted" : "delete not confirmed"}`,
    );
  }
}

main().catch((error) => {
  console.error("[verify] ERROR:", error?.message ?? error);
  process.exitCode = 1;
});
