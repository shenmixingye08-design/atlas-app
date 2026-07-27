/**
 * Safe deployment identity for operators — no secrets.
 * Uses Vercel-provided env when available.
 */

export type HealthVersionPayload = {
  ok: true;
  environment: string;
  commitSha: string;
  commitShaShort: string;
  buildTime: string;
  appVersion: string;
  vercelUrl: string | null;
};

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getHealthVersionPayload(
  now: Date = new Date(),
): HealthVersionPayload {
  const commitSha =
    firstNonEmpty(
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      process.env.GIT_COMMIT_SHA,
    ) ?? "unknown";

  const environment =
    firstNonEmpty(process.env.VERCEL_ENV, process.env.NODE_ENV) ?? "unknown";

  const buildTime =
    firstNonEmpty(
      process.env.VERCEL_BUILD_TIME,
      process.env.BUILD_TIME,
      process.env.NEXT_PUBLIC_BUILD_TIME,
    ) ?? now.toISOString();

  const appVersion =
    firstNonEmpty(process.env.npm_package_version, process.env.APP_VERSION) ??
    "0.1.0";

  const vercelUrl = firstNonEmpty(process.env.VERCEL_URL);

  return {
    ok: true,
    environment,
    commitSha,
    commitShaShort: commitSha.slice(0, 7),
    buildTime,
    appVersion,
    vercelUrl,
  };
}
