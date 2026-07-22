import { isNextBuildPhase } from "@/lib/runtime/is-next-build";
import { isAtlasProduction } from "@/lib/runtime/is-production";

/** Parse ATLAS_OWNER_EMAILS env (comma-separated, case-insensitive). */
export function parseAtlasOwnerEmails(): readonly string[] {
  const raw = process.env.ATLAS_OWNER_EMAILS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Production must define at least one owner email. */
export function assertOwnerEmailsConfiguredForProduction(): void {
  if (!isAtlasProduction()) return;
  if (isNextBuildPhase()) return;
  if (parseAtlasOwnerEmails().length > 0) return;
  throw new Error(
    "ATLAS_OWNER_EMAILS must be set in production (comma-separated owner emails)",
  );
}

export function isAtlasOwnerEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  const owners = parseAtlasOwnerEmails();

  if (owners.length === 0) return false;

  return owners.includes(normalized);
}
