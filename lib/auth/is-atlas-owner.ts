/** Parse ATLAS_OWNER_EMAILS env (comma-separated, case-insensitive). */
export function parseAtlasOwnerEmails(): readonly string[] {
  const raw = process.env.ATLAS_OWNER_EMAILS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
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
