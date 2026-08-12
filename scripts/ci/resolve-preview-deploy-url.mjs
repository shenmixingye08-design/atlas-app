#!/usr/bin/env node
/**
 * Resolve Vercel Preview environment_url for GITHUB_SHA from GitHub Deployments API.
 * Prints URL or empty string. Never prints secrets.
 */
const sha = (process.env.GITHUB_SHA || "").trim();
const token = (process.env.GITHUB_TOKEN || "").trim();
const repo = (process.env.GITHUB_REPOSITORY || "").trim();
if (!sha || !token || !repo) process.exit(0);

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "atlas-phase2-diagnose",
};

const deployments = await fetch(
  `https://api.github.com/repos/${repo}/deployments?environment=Preview&per_page=20`,
  { headers },
).then((r) => r.json());

if (!Array.isArray(deployments)) process.exit(0);

async function firstSuccessUrl(row) {
  const stUrl = row.statuses_url;
  if (!stUrl) return null;
  const statuses = await fetch(stUrl, { headers }).then((r) => r.json());
  if (!Array.isArray(statuses)) return null;
  for (const st of statuses) {
    const state = String(st.state || "").toLowerCase();
    const envUrl = String(st.environment_url || "");
    if (
      (state === "success" || state === "inactive") &&
      envUrl.includes("vercel.app")
    ) {
      return envUrl.replace(/\/$/, "");
    }
  }
  return null;
}

// Prefer exact SHA match, then most recent successful Preview (branch lag).
for (const row of deployments) {
  if (!String(row.sha || "").startsWith(sha.slice(0, 7))) continue;
  const url = await firstSuccessUrl(row);
  if (url) {
    process.stdout.write(url);
    process.exit(0);
  }
}
for (const row of deployments) {
  const url = await firstSuccessUrl(row);
  if (url) {
    process.stdout.write(url);
    process.exit(0);
  }
}
