import "server-only";

/**
 * True when the process runs on an ephemeral serverless filesystem
 * (Vercel `/var/task`, AWS Lambda, etc.). Durable writes must use
 * Supabase Database / Storage — never `process.cwd()/.data`.
 */
export function isEphemeralServerlessFs(): boolean {
  return (
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.AWS_LAMBDA_FUNCTION_NAME != null ||
    process.env.ATLAS_FORCE_EPHEMERAL_FS === "1"
  );
}

/**
 * Local `process.cwd()/.data/*` is allowed only for local development.
 * Production, Vercel Preview/Production, and forced ephemeral mode: banned.
 */
export function allowProcessCwdDataDir(): boolean {
  if (isEphemeralServerlessFs()) return false;
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DATA_DIR !== "1") {
    return false;
  }
  return true;
}

/** Temp files only — must be deleted after use. */
export function atlasTempRoot(): string {
  return "/tmp/atlas";
}
