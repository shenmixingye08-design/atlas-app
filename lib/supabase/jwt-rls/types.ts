/** P3-01 JWT連携RLS types. */

export type JwtRlsSubjectRow = {
  id: string;
  user_id: string;
  correlation_id: string;
  label: string;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type MintClerkSupabaseJwtInput = {
  userId: string;
  /** Seconds until expiry. Default 120. */
  expiresInSec?: number;
  secret: string;
};

export type JwtSecretSource = "env" | "management_api" | "none";

export type ResolveJwtSecretResult =
  | { ok: true; secret: string; source: Exclude<JwtSecretSource, "none"> }
  | { ok: false; secret: null; source: "none"; error: string };

export const JWT_RLS_PROBE_USER_A = "user_p301_probe_a";
export const JWT_RLS_PROBE_USER_B = "user_p301_probe_b";
