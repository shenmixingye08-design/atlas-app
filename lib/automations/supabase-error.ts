/**
 * Classify Supabase PostgREST / Postgres errors for the P0-6 automation store.
 * Used to distinguish schema-not-applied from transient store failures.
 */

export function isSupabaseRelationMissingError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const code = (error.code ?? "").trim();
  const haystack = [error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();

  if (code === "42P01" || code === "PGRST205") return true;

  return (
    /schema cache/.test(haystack) ||
    /could not find the table/.test(haystack) ||
    /relation .* does not exist/.test(haystack) ||
    (/atlas_automation_definitions/.test(haystack) &&
      /does not exist/.test(haystack)) ||
    (/atlas_automation_executions/.test(haystack) &&
      /does not exist/.test(haystack))
  );
}

export function buildAutomationDiagnosticId(scope: string): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `diag_${Date.now().toString(36)}`;
  return `auto_${scope}_${id}`;
}
