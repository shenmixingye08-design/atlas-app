import "server-only";

import { BusinessProfileError } from "./errors";

export type DurableDbError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

/** Supabase / Postgres errors that mean Phase 6 tables are not applied yet. */
export function isSchemaMissingError(error: DurableDbError | null | undefined): boolean {
  if (!error) return false;
  const haystack = [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("42p01") ||
    haystack.includes("does not exist") ||
    haystack.includes("could not find the table") ||
    haystack.includes("schema cache") ||
    (haystack.includes("relation") && haystack.includes("exist"))
  );
}

export function durableWriteError(
  operation: string,
  error: DurableDbError | null | undefined,
): BusinessProfileError {
  if (isSchemaMissingError(error)) {
    return new BusinessProfileError(
      "schema_missing",
      "業務プロフィール用のデータベース表が未作成です。Migration 適用後に保存できます。画面の閲覧はそのまま続けられます。",
    );
  }

  const detail = error?.message?.trim();
  return new BusinessProfileError(
    "storage_unavailable",
    detail
      ? `業務プロフィールの保存に失敗しました（${operation}）: ${detail}`
      : `業務プロフィールの保存に失敗しました（${operation}）。しばらくしてから再度お試しください。`,
  );
}

export function throwIfDurableWriteFailed(
  operation: string,
  error: DurableDbError | null | undefined,
): void {
  if (!error) return;
  throw durableWriteError(operation, error);
}

export type BusinessProfileStorageStatus =
  | { ok: true }
  | { ok: false; code: "schema_missing" | "storage_unavailable"; message: string };

export function storageStatusFromError(
  error: DurableDbError | null | undefined,
): BusinessProfileStorageStatus {
  if (!error) return { ok: true };
  const mapped = durableWriteError("list", error);
  return {
    ok: false,
    code: mapped.code === "schema_missing" ? "schema_missing" : "storage_unavailable",
    message: mapped.message,
  };
}
