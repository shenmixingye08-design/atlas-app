const MAX_BASE_LENGTH = 48;

const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Build a filesystem-safe base name from the assignment or title. */
export function buildDeliverableBaseName(
  assignment: string,
  title?: string,
): string {
  const source = (title ?? assignment).trim();
  const firstLine = source.split("\n")[0]?.trim() ?? "atlas-deliverable";

  const safe = firstLine
    .replace(UNSAFE_FILENAME_CHARS, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_BASE_LENGTH);

  if (safe.length >= 1) {
    return safe;
  }

  return "atlas-deliverable";
}

export function buildFileName(
  baseName: string,
  extension: string,
): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return `${baseName}${ext}`;
}
