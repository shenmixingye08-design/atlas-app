/**
 * Discriminated durable credential read.
 * Callers must never treat "unavailable" as "missing" (or the reverse).
 */
import { isAtlasProduction } from "@/lib/runtime/is-production";

export const DURABLE_READ_FAILED_CODE = "durable_read_failed" as const;

export type DurableCredentialRead<T> =
  | { status: "found"; value: T }
  | { status: "missing" }
  | {
      status: "unavailable";
      developerCode: typeof DURABLE_READ_FAILED_CODE;
      reason: string;
    }
  | { status: "not_configured" };

export type DurableReadUnavailable = Extract<
  DurableCredentialRead<never>,
  { status: "unavailable" }
>;

export const DURABLE_READ_FAILED_USER_MESSAGE =
  "連携情報の確認に失敗しました。しばらくしてからもう一度お試しください";

export function durableReadFailed(reason: string): DurableReadUnavailable {
  return {
    status: "unavailable",
    developerCode: DURABLE_READ_FAILED_CODE,
    reason,
  };
}

/** Production without a Supabase client is a read failure, not "no row". */
export function durableReadWhenClientMissing():
  | DurableReadUnavailable
  | { status: "not_configured" } {
  if (isAtlasProduction()) {
    return durableReadFailed("supabase_not_configured");
  }
  return { status: "not_configured" };
}
